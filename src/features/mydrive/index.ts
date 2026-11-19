// MyDrive bölümü (mydrive-local-dev 0.1.50 src/widgets/index.tsx'ten taşındı). Yalnız bilgisayarda.
// Değişenler: adlar mydrive_ önekli (komut, CSS, powerup, depolama, olay dinleyici anahtarı);
// komut simgesi eklentinin kendi public/mydrive-logo.svg dosyasından; "MyDrive hazır" tostu kaldırıldı
// (her açılışta gürültü yapıyordu). OAuth ve yükleme mantığı aynı; yerel 8083 sunucusu gerekir.
import { AppEvents, PropertyType, ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import type { FeatureRuntime } from '../registry';
import { quietly, registerGuardedCommand } from '../sdk-helpers';
import {
  MYDRIVE_COMMAND_ID,
  MYDRIVE_DEFAULT_FOLDER_ID,
  MYDRIVE_FILE_CARD_WIDGET,
  MYDRIVE_FILE_GROUP_SLOT,
  MYDRIVE_FILE_ID_SLOT,
  MYDRIVE_FILE_MIME_SLOT,
  MYDRIVE_FILE_NAME_SLOT,
  MYDRIVE_FILE_POWERUP_CODE,
  MYDRIVE_FILE_URL_SLOT,
  MYDRIVE_FOLDER_ID_STORAGE_KEY,
  MYDRIVE_LAST_TARGET_STORAGE_KEY,
  MYDRIVE_POPUP_WIDGET,
} from './constants';
import { MYDRIVE_CARD_EXTENSION_DEFINITIONS } from './cardMetadata';

interface EditorSelectionTarget {
  remId?: string;
  remIds?: string[];
}

interface StoredEditorTarget {
  remId: string;
  source: string;
  capturedAt: number;
}

const REMNOTE_BRIDGE_CALL_URL = 'http://127.0.0.1:3400/call';
const TRACKED_TARGET_MAX_AGE_MS = 10 * 60 * 1000;
const MYDRIVE_SLASH_ICON_CSS_ID = 'mydrive_slash_icon';
const MYDRIVE_CARD_CSS_ID = 'mydrive_card_style';
let lastEditorTarget: { remId: string; source: string; capturedAt: number } | null = null;
// Target tracking is event-driven: a fixed-interval poll kept RemNote's plugin
// channel and the bridge plugin's synced storage busy twice per second.
const TARGET_TRACKER_DEBOUNCE_MS = 400;
const TARGET_TRACKER_LISTENER_KEY = 'mydrive_target_tracker';
const TARGET_TRACKER_EVENTS = [AppEvents.FocusedRemChange, AppEvents.EditorSelectionChanged];
let targetTrackerActive = false;
let targetTrackerDebounce: number | null = null;

function remIdFromEditorSelection(selection?: EditorSelectionTarget | null): string | null {
  if (!selection) return null;
  if (typeof selection.remId === 'string' && selection.remId) return selection.remId;
  if (Array.isArray(selection.remIds) && selection.remIds[0]) return selection.remIds[0];
  return null;
}

function remIdFromBridgeField(field: unknown): string | null {
  if (!field || typeof field !== 'object') return null;
  const fieldValue = field as { value?: unknown; remId?: unknown; _id?: unknown };
  const value = fieldValue.value && typeof fieldValue.value === 'object'
    ? fieldValue.value as { remId?: unknown; _id?: unknown }
    : fieldValue;
  if (typeof value.remId === 'string' && value.remId) return value.remId;
  if (typeof value._id === 'string' && value._id) return value._id;
  return null;
}

async function callRemNoteBridge(action: string, payload: { [key: string]: unknown } = {}, timeoutMs = 1200): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(REMNOTE_BRIDGE_CALL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`RemNote bridge HTTP ${response.status}`);
    const data = await response.json() as { ok?: boolean; result?: unknown; error?: string };
    if (!data.ok) throw new Error(data.error || 'RemNote bridge call failed');
    return data.result;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function resolveBridgeEditorTargetRemId(): Promise<{ remId: string | null; source: string }> {
  try {
    const editorContext = await callRemNoteBridge('inspect_editor_context', { includeFocusedText: true, valueDepth: 4 });
    const fields = editorContext && typeof editorContext === 'object'
      ? (editorContext as { fields?: { [key: string]: unknown } }).fields
      : undefined;
    const selectionRemId = remIdFromBridgeField(fields?.selection);
    if (selectionRemId) return { remId: selectionRemId, source: 'bridge editor selection' };
    const selectedTextRemId = remIdFromBridgeField(fields?.selectedText);
    if (selectedTextRemId) return { remId: selectedTextRemId, source: 'bridge selected text' };
    const selectedRemId = remIdFromBridgeField(fields?.selectedRem);
    if (selectedRemId) return { remId: selectedRemId, source: 'bridge selected Rem' };
  } catch {
    // Bridge is optional; the local plugin SDK fallbacks below still run.
  }

  try {
    const focusContext = await callRemNoteBridge('inspect_focus_context', { valueDepth: 4 });
    const fields = focusContext && typeof focusContext === 'object'
      ? (focusContext as { fields?: { [key: string]: unknown } }).fields
      : undefined;
    const focusedRemId = remIdFromBridgeField(fields?.focusedRem);
    if (focusedRemId) return { remId: focusedRemId, source: 'bridge focused Rem' };
  } catch {
    // Ignore; bridge focus is a fallback only.
  }

  return { remId: null, source: 'bridge target unavailable' };
}

async function resolveLiveEditorTargetRemId(plugin: ReactRNPlugin): Promise<{ remId: string | null; source: string }> {
  const bridgeTarget = await resolveBridgeEditorTargetRemId();
  if (bridgeTarget.remId) return bridgeTarget;

  const selection = await plugin.editor.getSelection().catch(() => undefined);
  const selectionRemId = remIdFromEditorSelection(selection as EditorSelectionTarget | undefined);
  if (selectionRemId) return { remId: selectionRemId, source: 'editor selection' };

  const selectedRem = await plugin.editor.getSelectedRem().catch(() => undefined);
  const selectedRemId = remIdFromEditorSelection(selectedRem as EditorSelectionTarget | undefined);
  if (selectedRemId) return { remId: selectedRemId, source: 'selected Rem' };

  const focusedRem = await plugin.focus.getFocusedRem().catch(() => undefined);
  if (focusedRem?._id) return { remId: focusedRem._id, source: 'focused Rem' };

  return { remId: null, source: 'live editor target unavailable' };
}

// Tracking uses only the local plugin SDK; the HTTP bridge is consulted only
// when the user actually opens MyDrive (resolveLiveEditorTargetRemId).
async function resolveSdkEditorTargetRemId(plugin: ReactRNPlugin): Promise<{ remId: string | null; source: string }> {
  const selection = await plugin.editor.getSelection().catch(() => undefined);
  const selectionRemId = remIdFromEditorSelection(selection as EditorSelectionTarget | undefined);
  if (selectionRemId) return { remId: selectionRemId, source: 'editor selection' };

  const focusedRem = await plugin.focus.getFocusedRem().catch(() => undefined);
  if (focusedRem?._id) return { remId: focusedRem._id, source: 'focused Rem' };

  return { remId: null, source: 'sdk target unavailable' };
}

async function refreshTrackedEditorTarget(plugin: ReactRNPlugin) {
  const target = await resolveSdkEditorTargetRemId(plugin);
  if (!target.remId) return;
  const changed = lastEditorTarget?.remId !== target.remId;
  const trackedTarget: StoredEditorTarget = {
    remId: target.remId,
    source: `tracked ${target.source}`,
    capturedAt: Date.now(),
  };
  lastEditorTarget = trackedTarget;
  if (changed) {
    await plugin.storage.setLocal(MYDRIVE_LAST_TARGET_STORAGE_KEY, trackedTarget).catch(() => undefined);
  }
}

function scheduleTrackedEditorTargetRefresh(plugin: ReactRNPlugin) {
  if (targetTrackerDebounce !== null) window.clearTimeout(targetTrackerDebounce);
  targetTrackerDebounce = window.setTimeout(() => {
    targetTrackerDebounce = null;
    void refreshTrackedEditorTarget(plugin);
  }, TARGET_TRACKER_DEBOUNCE_MS);
}

function startEditorTargetTracker(plugin: ReactRNPlugin) {
  if (targetTrackerActive) return;
  targetTrackerActive = true;
  void refreshTrackedEditorTarget(plugin);
  for (const eventId of TARGET_TRACKER_EVENTS) {
    plugin.event.addListener(eventId, TARGET_TRACKER_LISTENER_KEY, () => scheduleTrackedEditorTargetRefresh(plugin));
  }
}

function stopEditorTargetTracker(plugin: ReactRNPlugin) {
  if (!targetTrackerActive) return;
  targetTrackerActive = false;
  if (targetTrackerDebounce !== null) {
    window.clearTimeout(targetTrackerDebounce);
    targetTrackerDebounce = null;
  }
  for (const eventId of TARGET_TRACKER_EVENTS) {
    plugin.event.removeListener(eventId, TARGET_TRACKER_LISTENER_KEY);
  }
}

function myDriveIconUrl() {
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost:8083';
  return `${origin}/mydrive-logo.svg`;
}

function myDriveSlashIconCSS(iconUrl: string) {
  return `
    [data-command-name="MyDrive"] [data-icon="extension"] {
      background-color: transparent !important;
      background-image: url("${iconUrl}") !important;
      background-position: center !important;
      background-repeat: no-repeat !important;
      background-size: contain !important;
      -webkit-mask-image: none !important;
      mask-image: none !important;
    }
  `;
}

function myDriveCardIconDataUri(label: string) {
  const fontSize = label.length > 3 ? 3.2 : 4.25;
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">',
    '<path fill="#d8dee9" d="M4 1.5h6.8L14.5 5.2v11.3H4z"/>',
    '<path fill="#8b95aa" d="M10.8 1.5v3.9h3.7z"/>',
    '<rect fill="#20232d" x="5.1" y="8" width="8.4" height="5.4" rx=".85"/>',
    `<text x="9.3" y="12.18" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800" fill="#fff">${label}</text>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function myDriveCardMarkerSelectors(marker: string) {
  return [
    `[href*="#${marker}"]`,
    `[href*="%23${marker}"]`,
    `[data-url*="#${marker}"]`,
    `[data-url*="%23${marker}"]`,
    `[data-href*="#${marker}"]`,
    `[data-href*="%23${marker}"]`,
  ].join(',');
}

function myDriveCardDriveFileSelectors() {
  const selectors = [
    '[href*="drive.google.com/uc?id="][href*="export=download"]',
    '[href*="drive.google.com/file/d/"]',
    '[href*="drive.google.com/open?id="]',
    '[data-url*="drive.google.com/uc?id="][data-url*="export=download"]',
    '[data-url*="drive.google.com/file/d/"]',
    '[data-url*="drive.google.com/open?id="]',
    '[data-href*="drive.google.com/uc?id="][data-href*="export=download"]',
    '[data-href*="drive.google.com/file/d/"]',
    '[data-href*="drive.google.com/open?id="]',
  ];
  return selectors.join(',');
}

function myDriveCardExtensionSelectors(extensions: readonly string[]) {
  return extensions.flatMap((extension) => [
    `[title^="MyDrive file:"][title$=".${extension}" i]`,
    `[aria-label^="MyDrive file:"][aria-label$=".${extension}" i]`,
  ]).join(',');
}

function myDriveCardCSS() {
  const baseIcon = myDriveCardIconDataUri('FILE');
  const baseSelectors = [
    myDriveCardMarkerSelectors('mydrive-card'),
    myDriveCardDriveFileSelectors(),
    '[title^="MyDrive file:"]',
    '[aria-label^="MyDrive file:"]',
  ].join(',');
  const groupRules = MYDRIVE_CARD_EXTENSION_DEFINITIONS.map(({ group, label, extensions }) => {
    const selectors = [
      myDriveCardMarkerSelectors(`mydrive-card-${group}`),
      myDriveCardExtensionSelectors(extensions),
    ].filter(Boolean).join(',');
    return `${selectors}{--mydrive-card-plugin-icon-image:url("${myDriveCardIconDataUri(label)}")!important;}`;
  }).join('\n');

  return `
    ${baseSelectors} {
      --mydrive-card-plugin-icon-image: url("${baseIcon}");
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      min-height: 28px !important;
      max-width: 360px !important;
      box-sizing: border-box !important;
      padding: 3px 34px 3px 30px !important;
      border: 1px solid rgba(139,148,170,.48) !important;
      border-radius: 6px !important;
      background: rgba(28,31,42,.72) !important;
      color: rgba(229,233,242,.92) !important;
      text-decoration: none !important;
      position: relative !important;
      vertical-align: middle !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      box-shadow: inset 2px 0 0 rgba(26,115,232,.9), inset 3px 0 0 rgba(52,168,83,.9) !important;
    }
    ${baseSelectors}::before {
      content: "" !important;
      position: absolute !important;
      left: 9px !important;
      top: 50% !important;
      width: 17px !important;
      height: 17px !important;
      transform: translateY(-50%) !important;
      background: transparent var(--mydrive-card-plugin-icon-image) center/contain no-repeat !important;
    }
    ${baseSelectors}::after {
      content: "" !important;
      position: absolute !important;
      right: 9px !important;
      top: 50% !important;
      width: 14px !important;
      height: 14px !important;
      transform: translateY(-50%) !important;
      background: transparent url("${myDriveIconUrl()}") center/contain no-repeat !important;
      opacity: .95 !important;
    }
    ${groupRules}
  `;
}

async function registerMyDriveFilePowerup(plugin: ReactRNPlugin) {
  try {
    await plugin.app.registerPowerup({
      name: 'MyDrive File',
      code: MYDRIVE_FILE_POWERUP_CODE,
      description: 'Google Drive file uploaded by MyDrive.',
      options: {
        slots: [
          {
            code: MYDRIVE_FILE_NAME_SLOT,
            name: 'File name',
            hidden: true,
            onlyProgrammaticModifying: true,
            propertyType: PropertyType.TEXT,
          },
          {
            code: MYDRIVE_FILE_URL_SLOT,
            name: 'Drive URL',
            hidden: true,
            onlyProgrammaticModifying: true,
            propertyType: PropertyType.URL,
          },
          {
            code: MYDRIVE_FILE_GROUP_SLOT,
            name: 'File group',
            hidden: true,
            onlyProgrammaticModifying: true,
            propertyType: PropertyType.TEXT,
          },
          {
            code: MYDRIVE_FILE_MIME_SLOT,
            name: 'MIME type',
            hidden: true,
            onlyProgrammaticModifying: true,
            propertyType: PropertyType.TEXT,
          },
          {
            code: MYDRIVE_FILE_ID_SLOT,
            name: 'Drive file ID',
            hidden: true,
            onlyProgrammaticModifying: true,
            propertyType: PropertyType.TEXT,
          },
        ],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (!message.includes('duplicate') && !message.includes('already')) throw error;
  }
}

async function resolveTargetRemId(plugin: ReactRNPlugin): Promise<{ remId: string | null; source: string }> {
  const liveTarget = await resolveLiveEditorTargetRemId(plugin);
  if (liveTarget.remId) return liveTarget;

  if (lastEditorTarget && Date.now() - lastEditorTarget.capturedAt < TRACKED_TARGET_MAX_AGE_MS) {
    return {
      remId: lastEditorTarget.remId,
      source: lastEditorTarget.source,
    };
  }

  const storedTarget = await plugin.storage.getLocal<StoredEditorTarget>(MYDRIVE_LAST_TARGET_STORAGE_KEY).catch(() => undefined);
  if (storedTarget?.remId && Date.now() - storedTarget.capturedAt < TRACKED_TARGET_MAX_AGE_MS) {
    return {
      remId: storedTarget.remId,
      source: storedTarget.source,
    };
  }

  const focusedPaneId = await plugin.window.getFocusedPaneId().catch(() => undefined);
  const paneRemId = await plugin.window.getOpenPaneRemId(focusedPaneId).catch(() => undefined);
  if (paneRemId) return { remId: null, source: `focused pane Rem ignored (${paneRemId})` };

  return { remId: null, source: 'current editor fallback' };
}

async function openMyDrivePopup(plugin: ReactRNPlugin) {
  const target = await resolveTargetRemId(plugin);
  const folderId = (await plugin.storage.getLocal<string>(MYDRIVE_FOLDER_ID_STORAGE_KEY)) || MYDRIVE_DEFAULT_FOLDER_ID;

  await plugin.widget.openPopup(
    MYDRIVE_POPUP_WIDGET,
    {
      parentRemId: target.remId,
      targetSource: target.source,
      folderId,
      openedAt: new Date().toISOString(),
    },
    true,
  );
}

export function createMyDriveFeature(plugin: ReactRNPlugin): FeatureRuntime {
  let on = false;
  let refreshTimer: number | null = null;
  return {
    id: 'mydrive',
    async activate() {
      on = true;
      startEditorTargetTracker(plugin);
      await plugin.app.registerWidget(MYDRIVE_POPUP_WIDGET, WidgetLocation.Popup, {
        dimensions: { width: 560, height: 'auto' },
      });
      const commandIconUrl = myDriveIconUrl();
      await plugin.app.registerCSS(MYDRIVE_SLASH_ICON_CSS_ID, myDriveSlashIconCSS(commandIconUrl));
      await plugin.app.registerCSS(MYDRIVE_CARD_CSS_ID, myDriveCardCSS());
      await registerMyDriveFilePowerup(plugin);
      await plugin.app.registerWidget(MYDRIVE_FILE_CARD_WIDGET, WidgetLocation.UnderRemEditor, {
        powerupFilter: MYDRIVE_FILE_POWERUP_CODE,
        dimensions: { height: 'auto', width: '100%' },
      });
      const command = {
        id: MYDRIVE_COMMAND_ID,
        name: 'MyDrive',
        quickCode: 'mydrive',
        keywords: 'mydrive /mydrive my drive google drive upload upload file file source pdf document image video',
        icon: commandIconUrl,
        description: 'Upload a file to Google Drive and insert the Drive link under the focused Rem.',
        action: () => openMyDrivePopup(plugin),
      } as Parameters<typeof plugin.app.registerCommand>[0];
      const off = 'MyDrive bölümü kapalı. Ayarlardan açabilirsiniz.';
      await registerGuardedCommand(plugin, command, () => on, off);
      // Eski sürümdeki gecikmeli yeniden kayıt: RemNote bazen ilk kaydı komut listesine geç alıyordu.
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        if (on) void registerGuardedCommand(plugin, command, () => on, off).catch(() => undefined);
      }, 1200);
    },
    async deactivate() {
      on = false;
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      stopEditorTargetTracker(plugin);
      await quietly([
        () => plugin.app.registerCSS(MYDRIVE_SLASH_ICON_CSS_ID, ''),
        () => plugin.app.registerCSS(MYDRIVE_CARD_CSS_ID, ''),
        () => plugin.app.unregisterWidget(MYDRIVE_POPUP_WIDGET, WidgetLocation.Popup),
        () => plugin.app.unregisterWidget(MYDRIVE_FILE_CARD_WIDGET, WidgetLocation.UnderRemEditor),
      ]);
    },
  };
}
