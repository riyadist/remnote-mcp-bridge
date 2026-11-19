import {
  PluginRem,
  renderWidget,
  RichTextInterface,
  usePlugin,
  WidgetLocation,
} from '@remnote/plugin-sdk';
import React, { DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  MYDRIVE_CLIENT_ID_STORAGE_KEY,
  MYDRIVE_CLIENT_SECRET_STORAGE_KEY,
  MYDRIVE_DEFAULT_FOLDER_ID,
  MYDRIVE_FILE_ID_SLOT,
  MYDRIVE_FILE_GROUP_SLOT,
  MYDRIVE_FILE_MIME_SLOT,
  MYDRIVE_FILE_NAME_SLOT,
  MYDRIVE_FILE_POWERUP_CODE,
  MYDRIVE_FILE_URL_SLOT,
  MYDRIVE_FOLDER_ID_STORAGE_KEY,
  MYDRIVE_LAST_TARGET_STORAGE_KEY,
  MYDRIVE_SERVER_ORIGIN,
} from '../features/mydrive/constants';
import {
  driveLink,
  myDriveCardGroupFromFileName,
  myDriveCardLink,
  richTextToPlain,
  visibleMyDriveCardRichText,
} from '../features/mydrive/cardMetadata';
import {
  DriveAccountInfo,
  DriveAccessTokenSession,
  DriveFileResult,
  DriveUploadProgress,
  extractDriveFileIdFromUrl,
  getOAuthRedirectUri,
  OAuthRedirectManualPrompt,
  readCurrentDriveAccessToken,
  requestDriveAccessToken,
  uploadFileToDrive,
} from '../features/mydrive/googleDrive';
import '../features/mydrive/mydrive.css';

interface MyDrivePopupContext {
  parentRemId?: string | null;
  targetSource?: string;
  folderId?: string;
  openedAt?: string;
}

interface EditorSelectionTarget {
  remId?: string;
  remIds?: string[];
}

interface StoredEditorTarget {
  remId?: string;
  source?: string;
  capturedAt?: number;
}

const REMNOTE_BRIDGE_CALL_URL = 'http://127.0.0.1:3400/call';
const TOKEN_REFRESH_SKEW_MS = 2 * 60 * 1000;
const STORED_TARGET_MAX_AGE_MS = 10 * 60 * 1000;

interface UploadRow {
  id: string;
  name: string;
  size: number;
  status: 'queued' | 'uploading' | 'done' | 'error';
  percent: number;
  link?: string;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function describeConnectedStatus(hasStoredRefreshToken: boolean): string {
  return hasStoredRefreshToken
    ? 'Google connected. Persistent login saved.'
    : 'Google connected for this session.';
}

function describeAccount(account?: DriveAccountInfo | null): string {
  return account?.emailAddress || account?.displayName || 'Google account connected';
}

function remIdFromEditorSelection(selection?: EditorSelectionTarget | null): string | null {
  if (!selection) return null;
  if (typeof selection.remId === 'string' && selection.remId) return selection.remId;
  if (Array.isArray(selection.remIds) && selection.remIds[0]) return selection.remIds[0];
  return null;
}

function plainSlotRichText(value: string): RichTextInterface {
  return [{ i: 'm', text: value }];
}

interface MyDrivePowerupVerification {
  ok: boolean;
  hasPowerup: boolean;
  fileName: string;
  driveUrl: string;
  group: string;
  mimeType: string;
  fileId: string;
  slotFileId: string;
  attempts: number;
}

interface MyDriveRemLookup {
  rem: {
    findOne(remId: string): Promise<PluginRem | undefined>;
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readMyDriveFilePowerup(rem: PluginRem, expectedFileName: string, expectedFileId = '', attempts = 1): Promise<MyDrivePowerupVerification> {
  const [hasPowerup, fileName, driveUrl, group, mimeType, fileId] = await Promise.all([
    rem.hasPowerup(MYDRIVE_FILE_POWERUP_CODE).catch(() => false),
    rem.getPowerupPropertyAsRichText(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_NAME_SLOT).catch(() => undefined),
    rem.getPowerupPropertyAsRichText(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_URL_SLOT).catch(() => undefined),
    rem.getPowerupPropertyAsRichText(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_GROUP_SLOT).catch(() => undefined),
    rem.getPowerupPropertyAsRichText(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_MIME_SLOT).catch(() => undefined),
    rem.getPowerupPropertyAsRichText(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_ID_SLOT).catch(() => undefined),
  ]);
  const storedFileName = richTextToPlain(fileName);
  const storedDriveUrl = richTextToPlain(driveUrl);
  const storedGroup = richTextToPlain(group);
  const storedFileId = richTextToPlain(fileId);
  const effectiveFileId = storedFileId || extractDriveFileIdFromUrl(storedDriveUrl);
  return {
    ok: Boolean(
      hasPowerup
      && storedFileName === (expectedFileName.trim() || 'Untitled file')
      && storedDriveUrl
      && storedGroup === myDriveCardGroupFromFileName(expectedFileName)
      && (!expectedFileId || effectiveFileId === expectedFileId),
    ),
    hasPowerup,
    fileName: storedFileName,
    driveUrl: storedDriveUrl,
    group: storedGroup,
    mimeType: richTextToPlain(mimeType),
    fileId: effectiveFileId,
    slotFileId: storedFileId,
    attempts,
  };
}

async function verifyMyDriveFilePowerup(plugin: MyDriveRemLookup, rem: PluginRem, expectedFileName: string, expectedFileId = ''): Promise<MyDrivePowerupVerification> {
  const delays = [0, 120, 300, 650, 1000];
  let lastVerification: MyDrivePowerupVerification | null = null;
  for (let index = 0; index < delays.length; index += 1) {
    if (delays[index]) await delay(delays[index]);
    const freshRem = index === 0 ? rem : await plugin.rem.findOne(rem._id).catch(() => null);
    lastVerification = await readMyDriveFilePowerup(freshRem || rem, expectedFileName, expectedFileId, index + 1);
    if (lastVerification.ok) return lastVerification;
  }
  return lastVerification || readMyDriveFilePowerup(rem, expectedFileName, expectedFileId, delays.length);
}

function isAccessTokenFresh(expiresAt?: number | null): boolean {
  return typeof expiresAt === 'number' && expiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS;
}

function isDriveAuthError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes('invalid authentication credentials')
    || message.includes('oauth 2 access token')
    || message.includes('unauthorized')
    || message.includes('401');
}

function isEmptyCommandTarget(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\u0131/g, 'i');
  return normalized === '' || normalized === '/mydrive' || normalized === 'mydrive' || normalized === '/my' || normalized === 'my';
}

function commandTargetSortTime(rem: PluginRem): number {
  return rem.updatedAt || rem.localUpdatedAt || rem.createdAt || 0;
}

function rowId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;
}

function logClientEvent(event: string, payload: { [key: string]: unknown } = {}) {
  const origin = MYDRIVE_SERVER_ORIGIN;
  fetch(`${origin}/__mydrive_log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event,
      source: 'mydrive_popup',
      payload,
    }),
  }).catch(() => undefined);
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

async function callRemNoteBridge(action: string, payload: { [key: string]: unknown } = {}, timeoutMs = 1500): Promise<unknown> {
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
    // Bridge is optional; the plugin SDK fallbacks still run.
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

function MyDrivePopup() {
  const plugin = usePlugin();
  const inputRef = useRef<HTMLInputElement>(null);
  const [context, setContext] = useState<MyDrivePopupContext>({});
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [folderId, setFolderId] = useState(MYDRIVE_DEFAULT_FOLDER_ID);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [accessTokenExpiresAt, setAccessTokenExpiresAt] = useState<number | null>(null);
  const [authStatus, setAuthStatus] = useState('Google account not connected.');
  const [connectionState, setConnectionState] = useState<'online' | 'offline'>('offline');
  const [accountInfo, setAccountInfo] = useState<DriveAccountInfo | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [manualAuth, setManualAuth] = useState<OAuthRedirectManualPrompt | null>(null);
  const [manualAuthCopyStatus, setManualAuthCopyStatus] = useState('');
  const [dropActive, setDropActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const targetRemIdRef = useRef<string | null>(null);
  const targetSourceRef = useRef<string>('current editor fallback');
  const writebackStateRef = useRef<{ targetConsumed: boolean; nextSiblingPosition?: number }>({ targetConsumed: false });

  const redirectUri = useMemo(() => getOAuthRedirectUri(), []);
  const parentLabel = useMemo(() => (
    context.parentRemId
      ? `Target Rem: ${context.parentRemId} (${context.targetSource || targetSourceRef.current})`
      : 'Target Rem: current editor fallback'
  ), [context.parentRemId, context.targetSource]);

  async function resolveCurrentEditorTargetRemId(): Promise<{ remId: string | null; source: string }> {
    const bridgeTarget = await resolveBridgeEditorTargetRemId();
    if (bridgeTarget.remId) return bridgeTarget;

    const selection = await plugin.editor.getSelection().catch(() => undefined);
    const selectionRemId = remIdFromEditorSelection(selection as EditorSelectionTarget | undefined);
    if (selectionRemId) return { remId: selectionRemId, source: 'editor selection fallback' };

    const selectedRem = await plugin.editor.getSelectedRem().catch(() => undefined);
    const selectedRemId = remIdFromEditorSelection(selectedRem as EditorSelectionTarget | undefined);
    if (selectedRemId) return { remId: selectedRemId, source: 'selected Rem fallback' };

    const focusedRem = await plugin.focus.getFocusedRem().catch(() => undefined);
    if (focusedRem?._id) return { remId: focusedRem._id, source: 'focused Rem fallback' };

    const focusedPaneId = await plugin.window.getFocusedPaneId().catch(() => undefined);
    const paneRemId = await plugin.window.getOpenPaneRemId(focusedPaneId).catch(() => undefined);
    if (paneRemId) return { remId: null, source: `focused pane Rem ignored (${paneRemId})` };

    return { remId: null, source: 'editor insert fallback' };
  }

  async function resolveStoredEditorTargetRemId(): Promise<{ remId: string | null; source: string }> {
    const storedTarget = await plugin.storage.getLocal<StoredEditorTarget>(MYDRIVE_LAST_TARGET_STORAGE_KEY).catch(() => undefined);
    if (
      storedTarget?.remId
      && typeof storedTarget.capturedAt === 'number'
      && Date.now() - storedTarget.capturedAt < STORED_TARGET_MAX_AGE_MS
    ) {
      logClientEvent('stored_editor_target_found', {
        remId: storedTarget.remId,
        source: storedTarget.source || 'stored editor target',
        ageMs: Date.now() - storedTarget.capturedAt,
      });
      return {
        remId: storedTarget.remId,
        source: storedTarget.source || 'stored editor target',
      };
    }
    logClientEvent('stored_editor_target_unavailable', {
      hasStoredTarget: Boolean(storedTarget?.remId),
      capturedAt: storedTarget?.capturedAt,
    });
    return { remId: null, source: 'stored editor target unavailable' };
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const widgetContext = await plugin.widget.getWidgetContext<WidgetLocation.Popup>();
      const popupContext = (widgetContext as unknown as MyDrivePopupContext) || {};
      const storedClientId = (await plugin.storage.getLocal<string>(MYDRIVE_CLIENT_ID_STORAGE_KEY)) || '';
      const storedClientSecret = (await plugin.storage.getLocal<string>(MYDRIVE_CLIENT_SECRET_STORAGE_KEY)) || '';
      const storedFolderId = (await plugin.storage.getLocal<string>(MYDRIVE_FOLDER_ID_STORAGE_KEY)) || popupContext.folderId || MYDRIVE_DEFAULT_FOLDER_ID;
      let targetRemId = popupContext.parentRemId || null;
      let targetSource = popupContext.targetSource || 'popup context';
      if (!targetRemId) {
        const liveTarget = await resolveCurrentEditorTargetRemId();
        targetRemId = liveTarget.remId;
        targetSource = liveTarget.source;
      }
      if (!targetRemId) {
        const storedTarget = await resolveStoredEditorTargetRemId();
        targetRemId = storedTarget.remId;
        targetSource = storedTarget.source;
      }
      if (cancelled) return;
      targetRemIdRef.current = targetRemId;
      targetSourceRef.current = targetSource;
      setContext({ ...popupContext, parentRemId: targetRemId, targetSource });
      setClientId(storedClientId);
      setClientSecret(storedClientSecret);
      setFolderId(storedFolderId);
      logClientEvent('popup_context_loaded', {
        hasTargetRemId: Boolean(targetRemId),
        targetRemId,
        targetSource,
      });
      const serverSession = await readCurrentDriveAccessToken(storedClientId, storedClientSecret);
      if (cancelled) return;
      if (serverSession) {
        applyServerSession(serverSession);
        return;
      }
      setConnectionState('offline');
      setAccountInfo(null);
      setAccessToken(null);
      setAccessTokenExpiresAt(null);
      if (storedClientId) {
        setAuthStatus('Client ID saved. Connect Google before uploading.');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [plugin]);

  function applyServerSession(serverSession: DriveAccessTokenSession): string {
    setAccessToken(serverSession.accessToken);
    setAccessTokenExpiresAt(serverSession.expiresAt || null);
    setConnectionState('online');
    setAccountInfo(serverSession.account || null);
    setAuthStatus(describeConnectedStatus(serverSession.hasStoredRefreshToken));
    return serverSession.accessToken;
  }

  function clearAccessToken(status = 'Google account not connected.') {
    setAccessToken(null);
    setAccessTokenExpiresAt(null);
    setConnectionState('offline');
    setAccountInfo(null);
    setAuthStatus(status);
  }

  async function refreshAccessTokenFromServer(): Promise<string | null> {
    const serverSession = await readCurrentDriveAccessToken(clientId.trim(), clientSecret.trim());
    if (serverSession) {
      return applyServerSession(serverSession);
    }
    clearAccessToken('Google login expired. Connect Google again.');
    return null;
  }

  async function getAvailableAccessToken(): Promise<string> {
    if (accessToken && isAccessTokenFresh(accessTokenExpiresAt)) return accessToken;
    const refreshedToken = await refreshAccessTokenFromServer();
    if (refreshedToken) return refreshedToken;
    return connectGoogle(true);
  }

  async function saveSettings() {
    const cleanClientId = clientId.trim();
    const cleanClientSecret = clientSecret.trim();
    const cleanFolderId = folderId.trim() || MYDRIVE_DEFAULT_FOLDER_ID;
    await plugin.storage.setLocal(MYDRIVE_CLIENT_ID_STORAGE_KEY, cleanClientId);
    await plugin.storage.setLocal(MYDRIVE_CLIENT_SECRET_STORAGE_KEY, cleanClientSecret);
    await plugin.storage.setLocal(MYDRIVE_FOLDER_ID_STORAGE_KEY, cleanFolderId);
    setFolderId(cleanFolderId);
    setConnectionState('offline');
    setAccountInfo(null);
    setAccessToken(null);
    setAccessTokenExpiresAt(null);
    setAuthStatus(cleanClientId ? 'Settings saved. Connect Google to continue.' : 'Client ID is empty.');
  }

  function describeAuthError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('OAuth Client ID is required')) {
      return 'Google OAuth Client ID is required. Paste your OAuth Client ID first.';
    }
    if (message.includes('client_secret is missing')) {
      return 'Google wants a Client Secret for this OAuth client. Paste the Client Secret from Google Cloud and connect again.';
    }
    if (message.includes('script timed out') || message.includes('script failed to load')) {
      return `${message} If this keeps happening, RemNote may be blocking the Google sign-in script.`;
    }
    return message;
  }

  async function connectGoogle(interactive = true): Promise<string> {
    const cleanClientId = clientId.trim();
    if (!cleanClientId) {
      const message = 'Google OAuth Client ID is required. Paste your OAuth Client ID first.';
      setAuthStatus(message);
      throw new Error(message);
    }

    const cleanClientSecret = clientSecret.trim();
    const cleanFolderId = folderId.trim() || MYDRIVE_DEFAULT_FOLDER_ID;
    setAuthStatus(`Opening Google sign-in. If Google shows redirect_uri_mismatch, add this Authorized redirect URI in Google Cloud: ${redirectUri}`);
    await plugin.storage.setLocal(MYDRIVE_CLIENT_ID_STORAGE_KEY, cleanClientId);
    await plugin.storage.setLocal(MYDRIVE_CLIENT_SECRET_STORAGE_KEY, cleanClientSecret);
    await plugin.storage.setLocal(MYDRIVE_FOLDER_ID_STORAGE_KEY, cleanFolderId);
    setFolderId(cleanFolderId);
    setManualAuth(null);
    setManualAuthCopyStatus('');

    try {
      const token = await requestDriveAccessToken(cleanClientId, cleanClientSecret, interactive, {
        onManualOAuthRedirect: (prompt) => {
          setManualAuth(prompt);
          setAuthStatus('Google popup was blocked. Open the Google sign-in link below; MyDrive is waiting for the callback.');
        },
      });
      const serverSession = await readCurrentDriveAccessToken(cleanClientId, cleanClientSecret);
      setAccessToken(serverSession?.accessToken || token);
      setAccessTokenExpiresAt(serverSession?.expiresAt || Date.now() + 50 * 60 * 1000);
      setConnectionState('online');
      setAccountInfo(serverSession?.account || null);
      setAuthStatus(describeConnectedStatus(Boolean(serverSession?.hasStoredRefreshToken)));
      setManualAuth(null);
      setManualAuthCopyStatus('');
      return token;
    } catch (error) {
      const message = describeAuthError(error);
      setAccessToken(null);
      setAccessTokenExpiresAt(null);
      setConnectionState('offline');
      setAccountInfo(null);
      setAuthStatus(message);
      throw new Error(message);
    }
  }

  async function handleConnectGoogle() {
    if (authBusy || busy) return;
    setAuthBusy(true);
    try {
      await connectGoogle(true);
    } catch {
      // connectGoogle already writes the actionable error into authStatus.
    } finally {
      setAuthBusy(false);
    }
  }

  async function copyManualAuthUrl() {
    if (!manualAuth?.authUrl) return;
    try {
      await navigator.clipboard.writeText(manualAuth.authUrl);
      setManualAuthCopyStatus('Sign-in link copied.');
    } catch {
      setManualAuthCopyStatus('Copy failed. Select the URL field manually.');
    }
  }

  async function handleClose() {
    if (busy || authBusy) {
      setAuthStatus('Upload is still running. Wait until it finishes before closing MyDrive.');
      logClientEvent('close_blocked_while_busy', { busy, authBusy, rowCount: rows.length });
      return;
    }
    await plugin.widget.closePopup(true);
  }

  function updateRow(id: string, patch: Partial<UploadRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function findRecentCommandTargetRemId(): Promise<{ remId: string | null; source: string }> {
    const seen = new Map<string, PluginRem>();
    const queryTexts = ['mydrive', '/mydrive', 'mydr\u0131ve', '/mydr\u0131ve', '/my', 'my'];

    for (const queryText of queryTexts) {
      const results = await plugin.search.search([{ i: 'm', text: queryText }], undefined, { numResults: 20 }).catch(() => []);
      for (const rem of results || []) {
        if (rem?._id) seen.set(rem._id, rem);
      }
    }

    const candidates: Array<{ rem: PluginRem; plainText: string }> = [];
    for (const rem of seen.values()) {
      const plainText = await plugin.richText.toString(rem.text || []).catch(() => '');
      if (isEmptyCommandTarget(plainText)) {
        candidates.push({ rem, plainText });
      }
    }

    candidates.sort((left, right) => commandTargetSortTime(right.rem) - commandTargetSortTime(left.rem));
    const target = candidates[0];
    if (!target) {
      logClientEvent('recent_command_target_unavailable', {
        candidateCount: candidates.length,
        seenCount: seen.size,
      });
      return { remId: null, source: 'recent command Rem unavailable' };
    }

    logClientEvent('recent_command_target_found', {
      remId: target.rem._id,
      plainText: target.plainText,
      updatedAt: target.rem.updatedAt,
    });
    return { remId: target.rem._id, source: `recent command Rem (${target.plainText || 'empty'})` };
  }

  async function stampMyDriveFilePowerup(rem: PluginRem, fileName: string, link: string, mimeType: string, fileId: string) {
    const group = myDriveCardGroupFromFileName(fileName);
    await rem.addPowerup(MYDRIVE_FILE_POWERUP_CODE);
    await rem.setPowerupProperty(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_NAME_SLOT, plainSlotRichText(fileName));
    await rem.setPowerupProperty(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_URL_SLOT, plainSlotRichText(link));
    await rem.setPowerupProperty(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_GROUP_SLOT, plainSlotRichText(group));
    await rem.setPowerupProperty(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_MIME_SLOT, plainSlotRichText(mimeType || 'application/octet-stream'));
    await rem.setPowerupProperty(MYDRIVE_FILE_POWERUP_CODE, MYDRIVE_FILE_ID_SLOT, plainSlotRichText(fileId));
    const verification = await verifyMyDriveFilePowerup(plugin, rem, fileName, fileId);
    logClientEvent('writeback_powerup_verified', {
      remId: rem._id,
      fileName,
      ok: verification.ok,
      hasPowerup: verification.hasPowerup,
      hasDriveUrl: Boolean(verification.driveUrl),
      hasFileId: Boolean(verification.fileId),
      hasFileIdSlot: Boolean(verification.slotFileId),
      fileIdSource: verification.slotFileId ? 'slot' : verification.fileId ? 'driveUrl' : 'missing',
      attempts: verification.attempts,
      group: verification.group,
      mimeType: verification.mimeType,
    });
    if (!verification.ok) {
      throw new Error(`MyDrive writeback failed: powerup metadata could not be verified for ${fileName}`);
    }
  }

  async function createSiblingOrChildDriveLink(targetRemId: string, fileName: string, link: string, mimeType: string, fileId: string): Promise<PluginRem | null> {
    const targetRem = await plugin.rem.findOne(targetRemId);
    if (!targetRem) return null;

    const targetPlainText = await plugin.richText.toString(targetRem.text || []).catch(() => '');
    if (!writebackStateRef.current.targetConsumed && isEmptyCommandTarget(targetPlainText)) {
      await targetRem.setText(visibleMyDriveCardRichText(fileName, link));
      await stampMyDriveFilePowerup(targetRem, fileName, link, mimeType, fileId);
      writebackStateRef.current.targetConsumed = true;
      const position = await targetRem.positionAmongstSiblings().catch(() => undefined);
      if (typeof position === 'number') {
        writebackStateRef.current.nextSiblingPosition = position + 1;
      }
      return targetRem;
    }

    const child = await plugin.rem.createRem();
    if (!child) return null;
    await child.setText(visibleMyDriveCardRichText(fileName, link));
    await stampMyDriveFilePowerup(child, fileName, link, mimeType, fileId);

    if (writebackStateRef.current.targetConsumed) {
      const parentRem = await targetRem.getParentRem().catch(() => undefined);
      const position = writebackStateRef.current.nextSiblingPosition;
      if (parentRem) {
        await child.setParent(parentRem, position);
      } else {
        await child.setParent(targetRem);
      }
      if (typeof position === 'number') {
        writebackStateRef.current.nextSiblingPosition = position + 1;
      }
    } else {
      await child.setParent(targetRem);
    }
    return child;
  }

  async function writeDriveLink(result: DriveFileResult, sourceFile: File) {
    const link = driveLink(result);
    const fileName = result.name || sourceFile.name;
    const cardLink = myDriveCardLink(fileName, link);
    let targetRemId = targetRemIdRef.current || context.parentRemId || null;
    let targetSource = targetSourceRef.current || context.targetSource || 'popup context';
    if (!targetRemId) {
      const liveTarget = await resolveCurrentEditorTargetRemId();
      targetRemId = liveTarget.remId;
      targetSource = liveTarget.source;
      targetRemIdRef.current = targetRemId;
      targetSourceRef.current = targetSource;
      setContext((current) => ({ ...current, parentRemId: targetRemId, targetSource }));
    }

    if (!targetRemId) {
      const commandTarget = await findRecentCommandTargetRemId();
      targetRemId = commandTarget.remId;
      targetSource = commandTarget.source;
      targetRemIdRef.current = targetRemId;
      targetSourceRef.current = targetSource;
      setContext((current) => ({ ...current, parentRemId: targetRemId, targetSource }));
    }

    if (!targetRemId) {
      const storedTarget = await resolveStoredEditorTargetRemId();
      targetRemId = storedTarget.remId;
      targetSource = storedTarget.source;
      targetRemIdRef.current = targetRemId;
      targetSourceRef.current = targetSource;
      setContext((current) => ({ ...current, parentRemId: targetRemId, targetSource }));
    }

    logClientEvent('writeback_start', {
      fileName,
      targetRemId,
      targetSource,
      hasTargetRemId: Boolean(targetRemId),
    });

    if (targetRemId) {
      const writtenRem = await createSiblingOrChildDriveLink(targetRemId, fileName, cardLink, sourceFile.type, result.id);
      if (writtenRem) {
        logClientEvent('writeback_success', {
          fileName,
          targetRemId,
          targetSource,
          displayRemId: writtenRem._id,
          mode: 'target_rem_mydrive_card',
        });
        return;
      }
      logClientEvent('writeback_target_failed', { fileName, targetRemId, targetSource });
    }

    logClientEvent('writeback_fallback_blocked', {
      fileName,
      targetRemId,
      targetSource,
      reason: 'MyDrive card requires a verified target Rem and powerup metadata',
    });
    throw new Error(`MyDrive uploaded ${fileName}, but could not attach a verified MyDrive card to the target Rem. Click the target bullet and choose MyDrive again.`);
  }

  async function uploadOne(file: File, token: string, id: string) {
    updateRow(id, { status: 'uploading', percent: 1 });
    const result = await uploadFileToDrive(
      file,
      folderId.trim() || MYDRIVE_DEFAULT_FOLDER_ID,
      token,
      (progress: DriveUploadProgress) => updateRow(id, { percent: progress.percent }),
    );
    logClientEvent('drive_upload_success', {
      fileName: result.name || file.name,
      hasWebContentLink: Boolean(result.webContentLink),
      hasWebViewLink: Boolean(result.webViewLink),
    });
    await writeDriveLink(result, file);
    updateRow(id, {
      status: 'done',
      percent: 100,
      link: driveLink(result),
    });
  }

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (!files.length || busy) return;

    const nextRows = files.map((file) => ({
      id: rowId(file),
      name: file.name,
      size: file.size,
      status: 'queued' as const,
      percent: 0,
    }));
    setRows((current) => [...nextRows, ...current]);
    setBusy(true);

    try {
      const token = await getAvailableAccessToken();
      let currentToken = token;
      for (let index = 0; index < files.length; index += 1) {
        try {
          await uploadOne(files[index], currentToken, nextRows[index].id);
        } catch (error) {
          if (!isDriveAuthError(error)) throw error;
          const refreshedToken = await refreshAccessTokenFromServer();
          if (!refreshedToken) throw error;
          currentToken = refreshedToken;
          await uploadOne(files[index], currentToken, nextRows[index].id);
        }
      }
      setAuthStatus('Upload complete. MyDrive files were written to RemNote.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAuthStatus(message);
      for (const row of nextRows) {
        updateRow(row.id, { status: 'error', error: message });
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDropActive(false);
    void handleFiles(event.dataTransfer.files);
  }

  return (
    <div className="mydrive-popup" role="dialog" aria-label="MyDrive upload">
      <div className="mydrive-popup__header">
        <div className="mydrive-popup__tabs" role="tablist" aria-label="MyDrive actions">
          <button className="mydrive-popup__tab mydrive-popup__tab--active" type="button" role="tab" aria-selected="true">
            <span className="mydrive-popup__upload-icon" aria-hidden="true" />
            Upload File
          </button>
        </div>
        <button
          className="mydrive-popup__close"
          type="button"
          aria-label="Close MyDrive"
          onClick={() => void handleClose()}
        />
      </div>

      <div className="mydrive-popup__settings" aria-label="Google Drive settings">
        <label className="mydrive-popup__field">
          <span>Google OAuth Client ID (Desktop app)</span>
          <input
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            placeholder="Paste OAuth Client ID"
            autoComplete="off"
          />
        </label>
        <label className="mydrive-popup__field">
          <span>Google OAuth Client Secret (optional)</span>
          <input
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            placeholder="Paste Client Secret if Google Cloud shows one"
            autoComplete="off"
            type="password"
          />
        </label>
        <label className="mydrive-popup__field">
          <span>Drive folder ID</span>
          <input
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
            placeholder="Google Drive klasör kimliği (zorunlu) / folder ID"
            autoComplete="off"
          />
        </label>
        <div className="mydrive-popup__settings-actions">
          <button type="button" onClick={saveSettings}>Save</button>
          <button type="button" onClick={() => void handleConnectGoogle()} disabled={authBusy || busy}>
            {authBusy ? 'Connecting...' : 'Connect Google'}
          </button>
        </div>
        <div className={`mydrive-popup__connection mydrive-popup__connection--${connectionState}`} aria-label="Google account connection status">
          <span className="mydrive-popup__status-dot" aria-hidden="true" />
          <div className="mydrive-popup__connection-text">
            <span>{connectionState === 'online' ? 'Online' : 'Offline'}</span>
            <strong>{connectionState === 'online' ? describeAccount(accountInfo) : 'No Google account connected'}</strong>
          </div>
        </div>
        <div className="mydrive-popup__hint">{authStatus}</div>
        <div className="mydrive-popup__hint">OAuth redirect URI: {redirectUri}</div>
        {manualAuth ? (
          <div className="mydrive-popup__manual-auth" aria-label="Manual Google sign-in">
            <a href={manualAuth.authUrl} target="_blank" rel="noreferrer">
              Open Google sign-in
            </a>
            <button type="button" onClick={() => void copyManualAuthUrl()}>
              Copy sign-in link
            </button>
            <input
              value={manualAuth.authUrl}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
              aria-label="Google sign-in URL"
            />
            <div className="mydrive-popup__hint">
              Keep this MyDrive popup open after signing in.
              {manualAuthCopyStatus ? ` ${manualAuthCopyStatus}` : ''}
            </div>
          </div>
        ) : null}
        <div className="mydrive-popup__hint">{parentLabel}</div>
      </div>

      <div
        className={`mydrive-popup__dropzone${dropActive ? ' mydrive-popup__dropzone--active' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={onDrop}
      >
        <div className="mydrive-popup__file-icons" aria-hidden="true">
          <span>PDF</span>
          <span>DOC</span>
          <span>ANY</span>
        </div>
        <div className="mydrive-popup__drop-title">
          Drag & drop files here or{' '}
          <button type="button" className="mydrive-popup__choose" onClick={() => inputRef.current?.click()}>
            choose files
          </button>
        </div>
        <input
          ref={inputRef}
          className="mydrive-popup__file-input"
          type="file"
          multiple
          onChange={(event) => {
            if (event.target.files) void handleFiles(event.target.files);
          }}
        />
      </div>

      {busy ? <div className="mydrive-popup__busy">Uploading...</div> : null}

      <div className="mydrive-popup__rows" aria-live="polite">
        {rows.map((row) => (
          <div className={`mydrive-popup__row mydrive-popup__row--${row.status}`} key={row.id}>
            <div>
              <div className="mydrive-popup__row-name">{row.name}</div>
              <div className="mydrive-popup__row-meta">
                {formatBytes(row.size)} | {row.status} | {row.percent}%
              </div>
              {row.error ? <div className="mydrive-popup__row-error">{row.error}</div> : null}
              {row.link ? <a href={row.link} target="_blank" rel="noreferrer">Open in Drive</a> : null}
            </div>
            <div className="mydrive-popup__progress" aria-hidden="true">
              <div style={{ width: `${row.percent}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

renderWidget(MyDrivePopup);
