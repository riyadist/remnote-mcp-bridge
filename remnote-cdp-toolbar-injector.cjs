#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CDP_PORT = 9233;
const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:3400';
const POLL_MS = 2000;
const FETCH_TIMEOUT_MS = 3000;
const CDP_CONNECT_TIMEOUT_MS = 3000;
const CDP_COMMAND_TIMEOUT_MS = 5000;

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    return match ? [match[1], match[2]] : [arg.replace(/^--/, ''), '1'];
  })
);

const cdpPort = Number(args.get('cdp-port') || process.env.REMNOTE_CDP_PORT || DEFAULT_CDP_PORT);
const cdpBaseUrl = args.get('cdp-url') || process.env.REMNOTE_CDP_URL || `http://127.0.0.1:${cdpPort}`;
const bridgeUrl = (args.get('bridge-url') || process.env.REMNOTE_BRIDGE_URL || DEFAULT_BRIDGE_URL).replace(/\/$/, '');
const statusPath = args.get('status-file') || process.env.REMNOTE_CDP_INJECTOR_STATUS_FILE || path.resolve(
  __dirname,
  '..',
  '..',
  'Temp',
  'remnote_cdp_toolbar_injector_status.json'
);

const WebSocketImpl = globalThis.WebSocket || require('ws');
const injectedTargets = new Map();
const targetSessions = new Map();
const startedAt = new Date().toISOString();
let runtimeStatus = {
  pid: process.pid,
  startedAt,
  cdpPort,
  cdpBaseUrl,
  bridgeUrl,
  statusPath,
  state: 'starting',
};
let tickRunning = false;
let tickTimer = null;

function log(message, extra) {
  const suffix = extra ? ` ${JSON.stringify(extra)}` : '';
  console.log(`[remnote-cdp-toolbar-injector] ${new Date().toISOString()} ${message}${suffix}`);
}

function writeRuntimeStatus(patch = {}) {
  runtimeStatus = {
    ...runtimeStatus,
    ...patch,
    pid: process.pid,
    updatedAt: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(path.dirname(statusPath), { recursive: true });
    fs.writeFileSync(statusPath, JSON.stringify(runtimeStatus, null, 2), 'utf8');
  } catch (error) {
    log('status_write_failed', { statusPath, error: String(error?.message || error) });
  }
  return runtimeStatus;
}

async function fetchJson(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`HTTP timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${url}`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function isMainRemNotePage(target) {
  if (!target || target.type !== 'page' || !target.webSocketDebuggerUrl) return false;
  const url = String(target.url || '');
  const title = String(target.title || '');
  if (
    !url ||
    title.includes('DevTools') ||
    /remnoteplugins\.com|localhost:(?:8080|8082|8083)/i.test(url)
  ) {
    return false;
  }

  const legacyDesktopPage = (
    url.startsWith('file:///') &&
    /\/RemNote\/resources\/app\.asar\//i.test(url)
  );
  const currentDesktopPage = /^app:\/\/js(?:\/|$)/i.test(url);
  const hostedRemNotePage = /^https?:\/\/(?:(?:www|beta)\.)?remnote\.com(?:\/|$)/i.test(url);

  return legacyDesktopPage || currentDesktopPage || hostedRemNotePage;
}

const assistantFactorySource = require('./selection-assistant-ui.cjs').toString();
const overlayRevision = require('node:crypto').createHash('sha256')
  .update(injectedOverlay.toString()).update(assistantFactorySource).digest('hex');

function injectedOverlay(openAssistant, revision) {
  const STATE_KEY = '__mcpRemNoteSelectionAssistantV7';
  const BOOTSTRAP_KEY = '__mcpRemNoteAssistantBootstrap';
  if (revision === undefined) {
    revision = window[STATE_KEY]?.revision ?? window[BOOTSTRAP_KEY]?.revision ?? 'legacy';
  }
  if (!document.body) {
    const previous = window[BOOTSTRAP_KEY];
    if (previous?.revision === revision) return { ok: true, waitingForDocument: true };
    previous?.cleanup();
    const ready = () => {
      delete window[BOOTSTRAP_KEY];
      injectedOverlay(openAssistant, revision);
    };
    window[BOOTSTRAP_KEY] = {
      revision,
      cleanup: () => document.removeEventListener('DOMContentLoaded', ready),
    };
    document.addEventListener('DOMContentLoaded', ready, { once: true });
    return { ok: true, waitingForDocument: true };
  }
  const OLD_KEYS = [
    '__mcpRemNoteSelectionAssistantV6',
    '__mcpRemNoteSelectionAssistantV5',
    '__mcpRemNoteSelectionAssistantV4',
    '__mcpRemNoteSelectionAssistantV3',
    '__mcpRemNoteSelectionAssistantV2',
    '__mcpRemNoteSelectionAssistantV1',
    '__mcpRemNoteCevirOverlay25930AppSchemeToolbarV6Live',
    '__mcpRemNoteCevirOverlay25930AppSchemeToolbarV5Live',
    '__mcpRemNoteCevirOverlay25930AppSchemeToolbarV4Live',
    '__mcpRemNoteCevirOverlay25930DetailRepairCooldownV3Live',
    '__mcpRemNoteCevirOverlay25930ChatQuickFirstTimeoutV2Live',
    '__mcpRemNoteCevirOverlay25930ChatEditingIntentV2Live',
    '__mcpRemNoteCevirOverlay25930FeaturedImageExportV2Live',
    '__mcpRemNoteCevirOverlay25930FeaturedImageExportLive',
    '__mcpRemNoteCevirOverlay25930SentenceHighlightV2Live',
    '__mcpRemNoteCevirOverlay25930ImageSenseV2Live',
    '__mcpRemNoteCevirOverlay25930ProgressRaceGuardLive',
    '__mcpRemNoteCevirOverlay25930ProgressRaceGuard',
    '__mcpRemNoteCevirOverlay25928ActionsFirstSidebarOpacityGuard',
    '__mcpRemNoteCevirOverlay25928ActionsFirst',
    '__mcpRemNoteCevirOverlay25927AdaptiveFeaturedLayout',
    '__mcpRemNoteCevirOverlay25926CompactFeaturedLayout',
    '__mcpRemNoteCevirOverlay25925ContextExplanation',
    '__mcpRemNoteCevirOverlay25924ConceptVisual',
    '__mcpRemNoteCevirOverlay25924FeaturedVisualLayout',
    '__mcpRemNoteCevirOverlay25924FeaturedVisual',
    '__mcpRemNoteCevirOverlay25923EarlySolPrefetch',
    '__mcpRemNoteCevirOverlay25922TargetExpression',
    '__mcpRemNoteCevirOverlay25921WindowSpaceGuard',
    '__mcpRemNoteCevirOverlay25920ProgressiveTopicChat',
    '__mcpRemNoteCevirOverlay25919ChatSpaceGuard',
    '__mcpRemNoteCevirOverlay25918TopicChat',
    '__mcpRemNoteCevirOverlay25914PatternTypography',
    '__mcpRemNoteCevirOverlay2595SolMnemonicModelUi',
    '__mcpRemNoteCevirOverlay2595SolMnemonicModel',
    '__mcpRemNoteCevirOverlay2594DurableToolbarHealth',
    '__mcpRemNoteCevirOverlay25866ReadableText',
    '__mcpRemNoteCevirOverlay25865CompactActionsNoEmptyPanel',
    '__mcpRemNoteCevirOverlay25865CompactActions',
    '__mcpRemNoteCevirOverlay25864PopupPersistence',
    '__mcpRemNoteCevirOverlay25861RoomyActionIcons',
    '__mcpRemNoteCevirOverlay25859StalePopupCleanup',
    '__mcpRemNoteCevirOverlay25858SectionIcons',
    '__mcpRemNoteCevirOverlay25857ImagePanel',
    '__mcpRemNoteCevirOverlay25856EtymologyTable',
    '__mcpRemNoteCevirOverlay25847MnemonicPrefetchHierarchy',
    '__mcpRemNoteCevirOverlay25846HighPolish',
    '__mcpRemNoteCevirOverlay25844PopupLayout',
    '__mcpRemNoteCevirOverlay25843PopupHelpers',
    '__mcpRemNoteCevirOverlay25842MnemonicImage',
    '__mcpRemNoteCevirOverlay25834SidebarTabFirst',
    '__mcpRemNoteCevirOverlay25833SentenceHighlightExport',
    '__mcpRemNoteCevirOverlay25827SelectionToolbarOnly',
    '__mcpRemNoteCevirOverlay25827SanitizedMarkup',
    '__mcpRemNoteCevirOverlay25827ResponsiveBounds',
    '__mcpRemNoteCevirOverlay25827FlashcardExport',
    '__mcpRemNoteCevirOverlay25827Flashcard',
    '__mcpRemNoteCevirOverlay25826Prefetch',
    '__mcpRemNoteCevirOverlay25824Highlight',
    '__mcpRemNoteCevirOverlay25824Dismiss',
    '__mcpRemNoteCevirOverlay25824',
    '__mcpRemNoteCevirOverlay25823',
  ];
  const REMNOTE_VOCAB_PARENT_ID = 'Mzp6M8ko2LUQgi33d';
  const POPUP_TEXT_FONT = '15px';
  const POPUP_TEXT_LINE_HEIGHT = '1.48';
  const POPUP_META_FONT = '13px';
  const POPUP_CANDIDATE_FONT = '13px/1.4 system-ui, -apple-system, Segoe UI, sans-serif';
  const TRANSLATE_STAGE_TIMEOUT_MS = Object.freeze({
    core: 35000,
    details: 50000,
    full: 25000,
  });

  function removeStalePopupDom() {
    try {
      document.querySelectorAll('.mcp-cdp-cevir-popup').forEach((el) => {
        el.__mcpPopupPronunciation?.destroy();
        el.remove();
      });
    } catch {}
  }

  if (window[STATE_KEY]?.installed && window[STATE_KEY].revision !== revision) {
    window[STATE_KEY].cleanup?.();
    delete window[STATE_KEY];
  }
  if (window[STATE_KEY]?.installed) {
    try {
      const toolbarFound = Boolean(window[STATE_KEY].scan?.());
      window[STATE_KEY].lastHealthCheckAt = Date.now();
      window[STATE_KEY].lastHealthError = null;
      return {
        ok: true,
        alreadyInstalled: true,
        toolbarFound,
        buttons: document.querySelectorAll('.mcp-cdp-cevir-button').length,
      };
    } catch (error) {
      try {
        window[STATE_KEY].lastHealthError = String(error?.message || error);
        window[STATE_KEY].cleanup?.();
      } catch {}
      try {
        delete window[STATE_KEY];
      } catch {}
    }
  }

  removeStalePopupDom();

  for (const key of OLD_KEYS) {
    try {
      window[key]?.cleanup?.();
    } catch {}
    try {
      delete window[key];
    } catch {}
  }
  for (const key of Object.keys(window)) {
    if (!key.startsWith('__mcpRemNoteCevirOverlay') || key === STATE_KEY) continue;
    try {
      window[key]?.cleanup?.();
    } catch {}
    try {
      delete window[key];
    } catch {}
  }

  const state = {
    installed: true,
    revision,
    lastError: null,
    lastTranslation: null,
    lastSelection: null,
    lastContext: null,
    buttonCount: 0,
    popupRequestSeq: 0,
    activePopupRequestSeq: 0,
    activePopupResultRequestSeq: 0,
    activePopupResult: null,
    dismissedPopupRequestSeq: 0,
    lastDismissReason: null,
    prefetchDelayMs: 650,
    prefetchTimer: null,
    prefetchPendingKey: null,
    prefetchKey: null,
    prefetchPromise: null,
    corePrefetchKey: null,
    corePrefetchPromise: null,
    lastPrefetchStatus: null,
    lastCorePrefetchStatus: null,
    lastPrefetchDurationMs: null,
    lastCorePrefetchDurationMs: null,
    lastPrefetchError: null,
    lastCorePrefetchError: null,
    prefetchRetryKey: null,
    prefetchRetryAfterAt: 0,
    mnemonicPrefetchKey: null,
    mnemonicPrefetchPromise: null,
    mnemonicPrefetchStatus: null,
    mnemonicPrefetchCandidates: [],
    mnemonicPrefetchError: null,
    mnemonicPrefetchDurationMs: null,
    imagePrefetchKey: null,
    imagePrefetchPromise: null,
    imagePrefetchStatus: null,
    imagePrefetchCandidates: [],
    imagePrefetchError: null,
    imagePrefetchDurationMs: null,
    sidebarOpacityZeroSince: null,
    sidebarOpacityRepairCount: 0,
    lastSidebarOpacityObserved: null,
    lastSidebarOpacityRepairAt: null,
    topicChatSessions: new Map(),
    lastFlashcardStatus: null,
    lastFlashcardRemId: null,
    lastFlashcardTargets: [],
    lastFlashcardError: null,
    lastSidebarTabOrderMove: null,
    lastSidebarTabOrderError: null,
    lastScanAt: null,
    lastToolbarFound: false,
    lastHealthCheckAt: null,
    lastHealthError: null,
    healthTimer: null,
  };
  window[STATE_KEY] = state;

  const FLASHCARD_HIGHLIGHT_COLOR = 'Yellow';
  const MCP_WIDGET_TAB_ICON_FRAGMENT = '2885417';

  function compactText(el) {
    return (el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeText(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.!?;:])/g, '$1')
      .trim();
  }

  function stripModelMarkup(value) {
    let text = typeof value === 'string' ? value : '';
    text = text.replace(/&lt;(\/?[A-Za-z][A-Za-z0-9:-]*)(?:\s+[^&]*?)?&gt;/g, '<$1>');
    text = text.replace(/<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*?)?>/g, '');
    return text
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;|&#39;/gi, "'");
  }

  function cleanModelText(value, maxLength = 1200) {
    let text = stripModelMarkup(value)
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (maxLength > 0 && text.length > maxLength) {
      text = text.slice(0, maxLength).trim();
    }
    return text;
  }

  function translationResultRank(result) {
    if (!result) return 0;
    if (result.partial === false || result.detailStatus === 'complete') return 4;
    if (result.detailStatus === 'details_error') return 3;
    if (result.detailStatus === 'core_complete') return 1;
    return 2;
  }

  function reconcilePopupResult(nextResult, requestSeq) {
    if (!nextResult || state.activePopupResultRequestSeq !== requestSeq || !state.activePopupResult) {
      state.activePopupResultRequestSeq = requestSeq;
      state.activePopupResult = nextResult || null;
      return nextResult;
    }

    const current = state.activePopupResult;
    let resolved = translationResultRank(nextResult) >= translationResultRank(current)
      ? nextResult
      : current;

    // Async image/chat/mnemonic work may finish after the detail card. Preserve
    // explicit user choices, but never let its older core result replace details.
    const selectedImage = nextResult.selectedImage || nextResult.imageCandidate;
    if (selectedImage) {
      resolved = {
        ...resolved,
        selectedImage,
        imageCandidate: selectedImage,
      };
    }
    if (nextResult.mnemonic && nextResult.mnemonic !== resolved.mnemonic) {
      resolved = resultWithMnemonicCandidate(resolved, nextResult.mnemonic);
    }

    state.activePopupResult = resolved;
    return resolved;
  }

  function isVisible(el) {
    if (!(el instanceof HTMLElement)) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && rect.bottom > 0 && rect.right > 0;
  }

  function hasSelectionToolbarSignature(el) {
    const text = compactText(el).toLowerCase();
    const hasCoreActions = text.includes('ai cards') && text.includes('explain');
    if (!hasCoreActions) return false;

    const selectionSurface = el.closest?.(
      '.rn-drawing-pdf-selected-text-menu, ' +
      '.rn-drawing-canvas-pdf-highlighter-toolbar, ' +
      '.rich-text-editor__selected-text-menu, ' +
      '.HighlightPopup.pdf-viewer__popup-menu'
    );
    const hasClassicHighlightAction = text.includes('highlight');
    const hasCurrentNotesAction = text.includes('notes');
    return Boolean(selectionSurface && (hasClassicHighlightAction || hasCurrentNotesAction));
  }

  function isHighlightPopupToolbar(el) {
    if (!el?.closest) return false;
    const selectedTextMenu = el.closest('.rn-drawing-pdf-selected-text-menu');
    if (selectedTextMenu && hasSelectionToolbarSignature(selectedTextMenu)) return false;

    const drawingToolbar = el.closest('.rn-drawing-canvas-pdf-highlighter-toolbar');
    if (drawingToolbar) return !hasSelectionToolbarSignature(drawingToolbar);

    const genericHighlightPopup = el.closest('.HighlightPopup.pdf-viewer__popup-menu');
    return Boolean(genericHighlightPopup && !hasSelectionToolbarSignature(genericHighlightPopup));
  }

  function moveMcpRightSidebarTabFirst() {
    try {
      const icon = Array.from(document.querySelectorAll('#document-sidebar .rn-widget-tab-bar img'))
        .find((img) => String(img?.src || '').includes(MCP_WIDGET_TAB_ICON_FRAGMENT));
      const tabItem = icon?.closest('.flex-shrink-0');
      const tabList = tabItem?.parentElement;
      if (!tabItem || !tabList || !tabList.classList?.contains('overflow-x-auto')) return false;
      if (tabList.firstElementChild === tabItem) {
        state.lastSidebarTabOrderMove = 'already_first';
        state.lastSidebarTabOrderError = null;
        return true;
      }
      tabList.insertBefore(tabItem, tabList.firstElementChild);
      state.lastSidebarTabOrderMove = 'moved_first';
      state.lastSidebarTabOrderError = null;
      return true;
    } catch (error) {
      state.lastSidebarTabOrderError = String(error?.message || error);
      return false;
    }
  }

  const SIDEBAR_OPACITY_GRACE_MS = 1500;

  function getDocumentSidebarVisibilitySurface() {
    const inner = document.querySelector('[data-cy="DocumentSidebarDocumentsInner"]');
    const wrapper = inner?.firstElementChild || null;
    return {
      inner,
      wrapper,
      expanded: Boolean(document.querySelector('[data-test="collapse-left-sidebar-button"]')),
      itemCount: inner?.querySelectorAll('[data-test^="Document Sidebar Item:"]').length || 0,
    };
  }

  function releaseDocumentSidebarVisibilityGuard() {
    const { wrapper } = getDocumentSidebarVisibilitySurface();
    if (wrapper?.dataset?.mcpSidebarOpacityGuard === 'true') {
      wrapper.style.removeProperty('opacity');
      delete wrapper.dataset.mcpSidebarOpacityGuard;
    }
    state.sidebarOpacityZeroSince = null;
  }

  function repairExpandedDocumentSidebarVisibility() {
    const { wrapper, expanded, itemCount } = getDocumentSidebarVisibilitySurface();
    if (!wrapper || !expanded || itemCount === 0) {
      if (!expanded) releaseDocumentSidebarVisibilityGuard();
      state.sidebarOpacityZeroSince = null;
      state.lastSidebarOpacityObserved = wrapper ? window.getComputedStyle(wrapper).opacity : null;
      return false;
    }

    const opacity = window.getComputedStyle(wrapper).opacity;
    state.lastSidebarOpacityObserved = opacity;
    if (opacity !== '0') {
      state.sidebarOpacityZeroSince = null;
      return false;
    }

    const now = Date.now();
    if (!state.sidebarOpacityZeroSince) {
      state.sidebarOpacityZeroSince = now;
      return false;
    }
    if (now - state.sidebarOpacityZeroSince < SIDEBAR_OPACITY_GRACE_MS) return false;

    wrapper.style.setProperty('opacity', '1', 'important');
    wrapper.dataset.mcpSidebarOpacityGuard = 'true';
    state.sidebarOpacityZeroSince = null;
    state.sidebarOpacityRepairCount += 1;
    state.lastSidebarOpacityObserved = '1';
    state.lastSidebarOpacityRepairAt = now;
    return true;
  }

  function findToolbar() {
    const editorMenu = document.querySelector('[data-cy="selected-text-menu"]');
    if (editorMenu && isVisible(editorMenu)) {
      return { toolbar: editorMenu, explainAnchor: editorMenu.lastElementChild, surface: 'note' };
    }
    const direct = document.querySelector('.rn-drawing-pdf-selected-text-menu');
    if (direct && isVisible(direct) && hasSelectionToolbarSignature(direct)) {
      const explain = Array.from(direct.querySelectorAll('button, [role="button"], span, div')).find((el) => /^Explain$/i.test(compactText(el)));
      if (explain) {
        return { toolbar: direct, explainAnchor: explain.closest('button, [role="button"]') || explain };
      }
    }

    const candidates = Array.from(document.querySelectorAll('button, [role="button"], span, div')).filter((el) => isVisible(el) && /^Explain$/i.test(compactText(el)));
    for (const explainTextEl of candidates) {
      if (isHighlightPopupToolbar(explainTextEl)) continue;
      let toolbar = explainTextEl;
      for (let depth = 0; depth < 7 && toolbar; depth += 1) {
        const text = compactText(toolbar);
        const rect = toolbar.getBoundingClientRect();
        if (hasSelectionToolbarSignature(toolbar) && rect.width >= 160 && rect.width <= 800 && rect.height >= 28 && rect.height <= 110) {
          return { toolbar, explainAnchor: explainTextEl.closest('button, [role="button"]') || explainTextEl };
        }
        if (isHighlightPopupToolbar(toolbar)) break;
        toolbar = toolbar.parentElement;
      }
    }
    return null;
  }

  function findReactSelectedTextData(toolbar) {
    const roots = [];
    const addRoots = (el) => {
      if (!el) return;
      for (const key of Object.keys(el)) {
        if (key.startsWith('__reactProps') || key.startsWith('__reactFiber')) {
          roots.push(el[key]);
        }
      }
    };

    addRoots(toolbar);
    addRoots(toolbar?.firstElementChild);

    const seen = new WeakSet();
    function visit(value, depth) {
      if (!value || depth > 8) return null;
      if (typeof value !== 'object' && typeof value !== 'function') return null;
      if (seen.has(value)) return null;
      seen.add(value);

      try {
        if (value.selectedTextData && typeof value.selectedTextData === 'object') return value.selectedTextData;
        if (typeof value.text === 'string' && (typeof value.textBefore === 'string' || typeof value.textAfter === 'string')) return value;
      } catch {}

      let keys = [];
      try {
        keys = Object.keys(value);
      } catch {
        return null;
      }

      for (const key of keys.slice(0, 120)) {
        if (['return', 'child', 'sibling', 'stateNode', '_debugOwner', 'alternate'].includes(key)) continue;
        let child;
        try {
          child = value[key];
        } catch {
          continue;
        }
        const found = visit(child, depth + 1);
        if (found) return found;
      }
      return null;
    }

    for (const root of roots) {
      const found = visit(root, 0);
      if (found) return found;
    }
    return null;
  }

  function capturePdfSelection() {
    const toolbar = findToolbar()?.toolbar;
    const data = findReactSelectedTextData(toolbar);
    const selectedText = normalizeText(data?.text || window.getSelection?.().toString() || '');
    const before = normalizeText(data?.textBefore || '');
    const after = normalizeText(data?.textAfter || '');
    const contextText = normalizeText([before, selectedText, after].filter(Boolean).join(' '));
    return { selectedText, contextText, source: data ? 'react_selectedTextData' : 'window_selection' };
  }

  function getTranslationPrefetchKey(capture) {
    const selectedText = normalizeText(capture?.selectedText || '');
    const contextText = normalizeText(capture?.contextText || selectedText);
    return selectedText ? `${selectedText}\n---\n${contextText}` : '';
  }

  function shouldPrefetchTranslation(capture) {
    const selectedText = normalizeText(capture?.selectedText || '');
    const contextText = normalizeText(capture?.contextText || selectedText);
    return Boolean(selectedText && selectedText.length <= 240 && contextText.length <= 1800);
  }

  function styleButton(button) {
    button.style.boxSizing = 'border-box';
    button.style.height = '30px';
    button.style.minWidth = '54px';
    button.style.marginLeft = '2px';
    button.style.padding = '0 9px';
    button.style.border = '1px solid rgba(125, 136, 255, 0.72)';
    button.style.borderRadius = '6px';
    button.style.color = '#f8f8ff';
    button.style.background = '#262633';
    button.style.fontSize = '13px';
    button.style.fontWeight = '700';
    button.style.lineHeight = '28px';
    button.style.whiteSpace = 'nowrap';
    button.style.cursor = 'pointer';
    button.style.fontFamily = 'inherit';
  }

  function getPopup() {
    return document.querySelector('.mcp-cdp-cevir-popup');
  }

  function hidePopup(reason = 'dismiss') {
    const popup = getPopup();
    if (!popup || popup.style.display === 'none') return false;
    popup.style.display = 'none';
    state.dismissedPopupRequestSeq = state.activePopupRequestSeq;
    state.lastDismissReason = reason;
    return true;
  }

  function clampNumber(value, min, max) {
    if (max < min) return min;
    return Math.max(min, Math.min(max, value));
  }

  function placePopupWithinViewport(popup, anchorRect) {
    const margin = 12;
    const gap = 10;
    const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    const usableWidth = Math.max(160, viewportWidth - margin * 2);
    const usableHeight = Math.max(90, viewportHeight - margin * 2);
    const targetPopupWidth = Math.min(640, usableWidth);

    popup.style.boxSizing = 'border-box';
    popup.style.width = targetPopupWidth + 'px';
    popup.style.maxWidth = targetPopupWidth + 'px';
    popup.style.minWidth = Math.min(320, targetPopupWidth) + 'px';
    popup.style.overflowY = 'auto';
    popup.style.overflowX = 'hidden';

    const belowTop = anchorRect ? anchorRect.bottom + gap : Math.min(120, margin + 16);
    const belowSpace = viewportHeight - margin - belowTop;
    const aboveSpace = anchorRect ? anchorRect.top - gap - margin : 0;
    const desiredPopupHeight = Math.min(440, usableHeight);
    const useAbove = Boolean(anchorRect && aboveSpace > belowSpace && belowSpace < desiredPopupHeight);
    const targetSpace = useAbove ? aboveSpace : belowSpace;
    const maxPopupHeight = Math.floor(Math.max(90, Math.min(usableHeight, targetSpace > 90 ? targetSpace : usableHeight)));
    popup.style.maxHeight = maxPopupHeight + 'px';

    const measured = popup.getBoundingClientRect();
    const popupWidth = Math.min(measured.width || targetPopupWidth, targetPopupWidth);
    const popupHeight = Math.min(measured.height || maxPopupHeight, maxPopupHeight);
    const preferredLeft = anchorRect ? anchorRect.left : (viewportWidth - popupWidth) / 2;
    const preferredTop = useAbove && anchorRect
      ? anchorRect.top - gap - popupHeight
      : (anchorRect ? anchorRect.bottom + gap : Math.min(120, margin + 16));

    popup.style.left = clampNumber(preferredLeft, margin, viewportWidth - margin - popupWidth) + 'px';
    popup.style.top = clampNumber(preferredTop, margin, viewportHeight - margin - popupHeight) + 'px';
  }

  function positionOpenPopup() {
    const popup = getPopup();
    if (!popup || popup.style.display === 'none') return;
    placePopupWithinViewport(popup, findToolbar()?.toolbar?.getBoundingClientRect());
  }

  function handleDocumentPointerDown(event) {
    const popup = getPopup();
    if (!popup || popup.style.display === 'none') return;
    const target = event.target;
    if (target instanceof Node && popup.contains(target)) return;
    if (target instanceof Element && target.closest('.mcp-cdp-cevir-button')) return;
    hidePopup('outside_pointerdown');
  }

  function isTopicChatTextarea(target) {
    return target instanceof HTMLTextAreaElement
      && target.classList.contains('mcp-cdp-cevir-chat-input');
  }

  function isUnmodifiedSpaceKey(event) {
    return (event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space')
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey;
  }

  function isUnmodifiedDeleteKey(event) {
    return (event.key === 'Backspace' || event.key === 'Delete')
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey;
  }

  function insertTopicChatTextareaText(textarea, text) {
    const start = typeof textarea.selectionStart === 'number'
      ? textarea.selectionStart
      : textarea.value.length;
    const end = typeof textarea.selectionEnd === 'number'
      ? textarea.selectionEnd
      : start;
    textarea.setRangeText(text, start, end, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function deleteTopicChatTextareaText(textarea, key) {
    const value = textarea.value;
    const start = typeof textarea.selectionStart === 'number'
      ? textarea.selectionStart
      : value.length;
    const end = typeof textarea.selectionEnd === 'number'
      ? textarea.selectionEnd
      : start;
    let deleteStart = start;
    let deleteEnd = end;
    if (start === end && key === 'Backspace' && start > 0) {
      const previousCharacter = Array.from(value.slice(0, start)).pop() || '';
      deleteStart = Math.max(0, start - previousCharacter.length);
    } else if (start === end && key === 'Delete' && end < value.length) {
      const nextCharacter = Array.from(value.slice(end))[0] || '';
      deleteEnd = Math.min(value.length, end + nextCharacter.length);
    }
    if (deleteStart === deleteEnd) return;
    textarea.setRangeText('', deleteStart, deleteEnd, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function handleWindowKeyDown(event) {
    const popup = getPopup();
    const assistantInput = isTopicChatTextarea(event.target)
      && popup && popup.style.display !== 'none' && popup.contains(event.target)
      && event.target.closest('.mcp-selection-assistant');
    if (assistantInput && event.key !== 'Escape') {
      // Keep browser editing/clipboard/IME defaults, but not RemNote's editor shortcuts.
      event.stopImmediatePropagation();
      if (event.target.dataset.saChat === 'true' && event.key === 'Enter'
        && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
        && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        event.target.dispatchEvent(new CustomEvent('sa-send'));
      }
      return;
    }
    if (isTopicChatTextarea(event.target) && !event.isComposing) {
      if (event.target.dataset.saChat === 'true' && event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault(); event.stopImmediatePropagation();
        event.target.dispatchEvent(new CustomEvent('sa-send'));
        return;
      }
      if (isUnmodifiedSpaceKey(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        insertTopicChatTextareaText(event.target, ' ');
        return;
      }
      if (isUnmodifiedDeleteKey(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        deleteTopicChatTextareaText(event.target, event.key);
        return;
      }
    }
    if (event.key === 'Escape') {
      hidePopup('escape');
    }
  }

  function handleViewportChange() {
    scheduleScan();
    positionOpenPopup();
  }

  function appendHighlightedText(parent, value, highlightText) {
    const text = cleanModelText(value, 1600);
    const needle = cleanModelText(highlightText, 200);
    if (!text) return;

    const index = needle
      ? text.toLocaleLowerCase('tr-TR').indexOf(needle.toLocaleLowerCase('tr-TR'))
      : -1;
    if (index < 0) {
      parent.appendChild(document.createTextNode(text));
      return;
    }

    const before = text.slice(0, index);
    const match = text.slice(index, index + needle.length);
    const after = text.slice(index + needle.length);
    if (before) parent.appendChild(document.createTextNode(before));

    const highlight = document.createElement('span');
    highlight.className = 'mcp-cdp-cevir-highlight';
    highlight.style.color = '#facc15';
    highlight.style.fontWeight = '800';
    highlight.textContent = match.toLocaleUpperCase('tr-TR');
    parent.appendChild(highlight);

    if (after) parent.appendChild(document.createTextNode(after));
  }

  function sectionLabel(section) {
    return String(section?.label || '').trim();
  }

  function isExplanationSection(section) {
    const key = String(section?.key || '').trim();
    const label = sectionLabel(section).toLocaleLowerCase('tr-TR');
    const asciiLabel = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return key === 'explanation' || asciiLabel.includes('aciklama') || label.includes('explanation');
  }

  function isEtymologySection(section) {
    const key = String(section?.key || '').trim();
    const label = sectionLabel(section).toLocaleLowerCase('tr-TR');
    const asciiLabel = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return key === 'etymology' || asciiLabel.includes('etimoloji') || label.includes('etymology');
  }

  function isLongTextSection(section) {
    return isExplanationSection(section) || isEtymologySection(section);
  }

  function sectionValue(section) {
    return cleanModelText(section?.value || '', isLongTextSection(section) ? 2600 : 1200);
  }

  const SECTION_ICON_BY_KEY = {
    directTranslation: '↔',
    sentenceTranslation: '¶',
    contextualMeaning: '◎',
    contextExplanation: '↳',
    generalMeanings: 'A',
    englishSynonyms: '≈',
    naturalPatterns: '#',
    verbPatterns: '↗',
    explanation: '?',
    etymology: '⌁',
    mnemonic: '✦',
    visualCue: '□',
    seriesPosition: '§',
    exampleSentence: 'Ex',
    level: 'Lv',
  };

  function sectionIcon(section) {
    const key = String(section?.key || '').trim();
    if (SECTION_ICON_BY_KEY[key]) return SECTION_ICON_BY_KEY[key];
    const label = sectionLabel(section).toLocaleLowerCase('tr-TR');
    const asciiLabel = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (asciiLabel.includes('direkt')) return SECTION_ICON_BY_KEY.directTranslation;
    if (asciiLabel.includes('cumle')) return SECTION_ICON_BY_KEY.sentenceTranslation;
    if (asciiLabel.includes('baglam')) return SECTION_ICON_BY_KEY.contextualMeaning;
    if (asciiLabel.includes('genel anlam')) return SECTION_ICON_BY_KEY.generalMeanings;
    if (asciiLabel.includes('es anlam') || label.includes('synonym')) return SECTION_ICON_BY_KEY.englishSynonyms;
    if (asciiLabel.includes('dogal kalip') || label.includes('natural pattern')) return SECTION_ICON_BY_KEY.naturalPatterns;
    if (asciiLabel.includes('phrasal verb') || asciiLabel.includes('fiil kalip')) return SECTION_ICON_BY_KEY.verbPatterns;
    if (asciiLabel.includes('aciklama') || label.includes('explanation')) return SECTION_ICON_BY_KEY.explanation;
    if (asciiLabel.includes('etimoloji') || label.includes('etymology')) return SECTION_ICON_BY_KEY.etymology;
    if (label.includes('mnemonic')) return SECTION_ICON_BY_KEY.mnemonic;
    if (asciiLabel.includes('gorsel') || label.includes('visual')) return SECTION_ICON_BY_KEY.visualCue;
    if (asciiLabel.includes('dizideki')) return SECTION_ICON_BY_KEY.seriesPosition;
    if (asciiLabel.includes('ornek')) return SECTION_ICON_BY_KEY.exampleSentence;
    if (asciiLabel.includes('seviye')) return SECTION_ICON_BY_KEY.level;
    return '•';
  }

  function appendSectionHeader(row, section) {
    const header = document.createElement('div');
    header.className = 'mcp-cdp-cevir-section-header';
    header.style.display = 'inline-flex';
    header.style.alignItems = 'center';
    header.style.gap = '7px';
    header.style.minWidth = '0';
    header.style.maxWidth = '100%';
    header.style.marginBottom = '4px';
    header.style.padding = '2px 7px 2px 5px';
    header.style.border = '1px solid rgba(125, 136, 255, 0.22)';
    header.style.borderRadius = '6px';
    header.style.background = 'rgba(125, 136, 255, 0.10)';

    const icon = document.createElement('span');
    icon.className = 'mcp-cdp-cevir-section-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = sectionIcon(section);
    icon.style.flex = '0 0 auto';
    icon.style.width = '18px';
    icon.style.height = '18px';
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.justifyContent = 'center';
    icon.style.borderRadius = '999px';
    icon.style.border = '1px solid rgba(165, 180, 252, 0.42)';
    icon.style.background = 'rgba(22, 22, 32, 0.74)';
    icon.style.color = '#bfdbfe';
    icon.style.fontSize = '12px';
    icon.style.fontWeight = '800';
    icon.style.lineHeight = '1';

    const label = document.createElement('span');
    label.className = 'mcp-cdp-cevir-label';
    label.style.minWidth = '0';
    label.style.color = '#c7d2fe';
    label.style.fontSize = '12px';
    label.style.fontWeight = '800';
    label.style.lineHeight = '1.16';
    label.style.letterSpacing = '0';
    label.style.textTransform = 'uppercase';
    label.textContent = sectionLabel(section);

    header.appendChild(icon);
    header.appendChild(label);
    row.appendChild(header);
  }

  function appendSectionBody(row) {
    const body = document.createElement('div');
    body.className = 'mcp-cdp-cevir-section-body';
    body.style.minWidth = '0';
    body.style.whiteSpace = 'pre-wrap';
    body.style.overflowWrap = 'anywhere';
    body.style.fontSize = POPUP_TEXT_FONT;
    body.style.lineHeight = POPUP_TEXT_LINE_HEIGHT;
    row.appendChild(body);
    return body;
  }

  function appendMarkdownBoldInline(parent, value) {
    const text = cleanModelText(value, 1600);
    if (!text) return;
    const pattern = /\*\*([^*]{1,180})\*\*/g;
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      if (match.index > lastIndex) {
        parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const strong = document.createElement('strong');
      strong.className = 'mcp-cdp-cevir-explanation-bold';
      strong.style.fontWeight = '800';
      strong.style.color = '#ffffff';
      strong.textContent = match[1];
      parent.appendChild(strong);
      lastIndex = pattern.lastIndex;
    }
    if (lastIndex < text.length) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function cleanExplanationLabel(value) {
    return cleanModelText(value || '', 80)
      .replace(/^\*\*|\*\*$/g, '')
      .replace(/^["'“”]+|["'“”]+$/g, '')
      .trim();
  }

  function parseExplanationLabelLine(line) {
    const raw = cleanModelText(line || '', 1600).trim();
    if (!raw) return null;
    const bulletMatch = /^[-•]\s*(.+)$/.exec(raw);
    const content = (bulletMatch ? bulletMatch[1] : raw).trim();
    const labelMatch = /^(?:\*\*([^:*]{1,64})\*\*|([^:*]{2,64})):\s*(.+)$/.exec(content);
    if (!labelMatch) {
      return { bullet: Boolean(bulletMatch), label: '', body: content };
    }
    const label = cleanExplanationLabel(labelMatch[1] || labelMatch[2] || '');
    const body = cleanModelText(labelMatch[3] || '', 1500).trim();
    if (!label || !body) {
      return { bullet: Boolean(bulletMatch), label: '', body: content };
    }
    return { bullet: Boolean(bulletMatch), label, body };
  }

  function appendExplanationLabelBody(parent, parsed) {
    if (!parsed?.label) {
      appendMarkdownBoldInline(parent, parsed?.body || '');
      return;
    }
    const label = document.createElement('strong');
    label.className = 'mcp-cdp-cevir-explanation-label';
    label.style.fontWeight = '850';
    label.style.color = '#ffe27a';
    label.textContent = parsed.label + ': ';
    parent.appendChild(label);
    appendMarkdownBoldInline(parent, parsed.body);
  }

  function appendExplanationBlock(parent, valueText) {
    const text = cleanModelText(valueText, 2600);
    if (!text) return;
    const block = document.createElement('div');
    block.className = 'mcp-cdp-cevir-explanation-block';
    block.style.display = 'grid';
    block.style.gap = '8px';
    block.style.marginTop = '6px';
    block.style.whiteSpace = 'normal';

    const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    lines.forEach((line) => {
      const parsed = parseExplanationLabelLine(line);
      if (!parsed) return;
      if (parsed.bullet) {
        const row = document.createElement('div');
        row.className = 'mcp-cdp-cevir-explanation-bullet';
        row.style.display = 'grid';
        row.style.gridTemplateColumns = '16px minmax(0, 1fr)';
        row.style.columnGap = '8px';
        row.style.alignItems = 'start';

        const bullet = document.createElement('span');
        bullet.textContent = '•';
        bullet.style.color = '#ffffff';
        bullet.style.fontWeight = '800';
        row.appendChild(bullet);

        const content = document.createElement('span');
        content.style.minWidth = '0';
        content.style.lineHeight = '1.38';
        appendExplanationLabelBody(content, parsed);
        row.appendChild(content);
        block.appendChild(row);
        return;
      }

      const paragraph = document.createElement('div');
      paragraph.className = 'mcp-cdp-cevir-explanation-paragraph';
      paragraph.style.lineHeight = '1.42';
      appendExplanationLabelBody(paragraph, parsed);
      block.appendChild(paragraph);
    });

    parent.appendChild(block);
  }

  function parseEtymologyRows(valueText) {
    const notes = [];
    const rows = [];
    const lines = cleanModelText(valueText, 2600).split(/\n+/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const bulletMatch = /^[-•]\s*(.+)$/.exec(line);
      const cleanLine = bulletMatch ? bulletMatch[1].trim() : line;
      if (/^[-|:\s]+$/.test(cleanLine)) continue;
      if (/^\|?\s*(?:part|parca|parça|root|kok|kök)\s*\|/i.test(cleanLine)) continue;
      if (cleanLine.includes('|')) {
        const parts = cleanLine.split('|').map((part) => part.trim()).filter(Boolean);
        const lowerParts = parts.map((part) => part.toLocaleLowerCase('tr-TR'));
        if (lowerParts.length && /^(?:part|parca|parça|root|kok|kök)$/.test(lowerParts[0])) continue;
        if (parts.length && parts.every((part) => /^[-:\s]+$/.test(part))) continue;
        if (parts.length >= 2) {
          rows.push({
            part: parts[0],
            meaning: parts[1] || '',
            note: parts.slice(2).join(' | '),
          });
          continue;
        }
      }
      notes.push(cleanLine);
    }
    return { notes, rows };
  }

  function appendEtymologyBlock(parent, valueText) {
    const parsed = parseEtymologyRows(valueText);
    if (!parsed.notes.length && !parsed.rows.length) return;

    const block = document.createElement('div');
    block.className = 'mcp-cdp-cevir-etymology-block';
    block.style.display = 'grid';
    block.style.gap = '10px';
    block.style.marginTop = '8px';
    block.style.whiteSpace = 'normal';

    if (parsed.notes.length) {
      const noteList = document.createElement('div');
      noteList.className = 'mcp-cdp-cevir-etymology-notes';
      noteList.style.display = 'grid';
      noteList.style.gap = '7px';
      parsed.notes.forEach((note) => {
        const row = document.createElement('div');
        row.className = 'mcp-cdp-cevir-etymology-note';
        row.style.display = 'grid';
        row.style.gridTemplateColumns = '16px minmax(0, 1fr)';
        row.style.columnGap = '8px';
        row.style.alignItems = 'start';

        const bullet = document.createElement('span');
        bullet.textContent = '\u2022';
        bullet.style.color = '#9ade7b';
        bullet.style.fontWeight = '800';
        row.appendChild(bullet);

        const content = document.createElement('span');
        content.style.lineHeight = '1.38';
        appendMarkdownBoldInline(content, note);
        row.appendChild(content);
        noteList.appendChild(row);
      });
      block.appendChild(noteList);
    }

    if (parsed.rows.length) {
      const table = document.createElement('div');
      table.className = 'mcp-cdp-cevir-etymology-table';
      table.style.border = '1px solid rgba(125, 136, 255, 0.28)';
      table.style.borderRadius = '7px';
      table.style.overflow = 'hidden';
      table.style.background = 'rgba(35, 35, 47, 0.88)';

      parsed.rows.forEach((entry, index) => {
        const row = document.createElement('div');
        row.className = 'mcp-cdp-cevir-etymology-row';
        row.style.display = 'grid';
        row.style.gridTemplateColumns = 'minmax(88px, 0.85fr) minmax(100px, 1fr) minmax(140px, 1.45fr)';
        row.style.borderTop = index === 0 ? '0' : '1px solid rgba(125, 136, 255, 0.18)';

        [
          ['mcp-cdp-cevir-etymology-part', entry.part, '#ffffff', '800', 'italic'],
          ['mcp-cdp-cevir-etymology-meaning', entry.meaning, '#ffffff', '750', 'normal'],
          ['mcp-cdp-cevir-etymology-note-cell', entry.note, '#c8c8d6', '500', 'normal'],
        ].forEach(([className, text, color, weight, fontStyle]) => {
          const cell = document.createElement('div');
          cell.className = className;
          cell.style.padding = '8px 10px';
          cell.style.borderLeft = className === 'mcp-cdp-cevir-etymology-part' ? '0' : '1px solid rgba(125, 136, 255, 0.14)';
          cell.style.color = color;
          cell.style.fontWeight = weight;
          cell.style.fontStyle = fontStyle;
          cell.style.lineHeight = '1.32';
          cell.style.minWidth = '0';
          cell.style.overflowWrap = 'anywhere';
          appendMarkdownBoldInline(cell, text || '');
          row.appendChild(cell);
        });

        table.appendChild(row);
      });

      block.appendChild(table);
    }

    parent.appendChild(block);
  }

  function isDirectTranslationSection(section) {
    const key = String(section?.key || '').trim();
    const label = sectionLabel(section).toLocaleLowerCase('tr-TR');
    return key === 'directTranslation' || label === 'direkt çeviri' || label === 'direkt ceviri';
  }

  function getDirectTranslation(result) {
    const sections = Array.isArray(result?.translationSections) ? result.translationSections : [];
    const directSection = sections.find((section) => isDirectTranslationSection(section) && sectionValue(section));
    const fallbackTranslation = cleanModelText(result?.translation || '', 1200);
    return sectionValue(directSection)
      || cleanModelText(result?.directTranslation || '', 1200)
      || fallbackTranslation;
  }

  function formatFlashcardBack(value) {
    const text = cleanModelText(value, 1200)
      .replace(/^\*\*Bağlam:\*\*\s*/i, '')
      .trim();
    return text ? `**Bağlam:** ${text}` : '';
  }

  function sanitizeFlashcardInlineMarkerBody(value) {
    return cleanModelText(value, 200)
      .replace(/\[\[/g, '[')
      .replace(/\]\]/g, ']')
      .trim();
  }

  function formatFlashcardDetailBody(section) {
    const value = sectionValue(section);
    const needle = cleanModelText(section?.highlightText || '', 200);
    if (!value || !needle) return value;

    const index = value.toLocaleLowerCase('tr-TR').indexOf(needle.toLocaleLowerCase('tr-TR'));
    if (index < 0) return value;

    const before = value.slice(0, index);
    const match = value.slice(index, index + needle.length);
    const after = value.slice(index + needle.length);
    const highlighted = sanitizeFlashcardInlineMarkerBody(match.toLocaleUpperCase('tr-TR'));
    if (!highlighted) return value;
    return `${before}[[${FLASHCARD_HIGHLIGHT_COLOR}:${highlighted}]]${after}`;
  }

  function detailSectionFromTranslationSection(section) {
    const label = sectionLabel(section);
    const value = sectionValue(section);
    if (!label || !value || isDirectTranslationSection(section)) return null;
    return {
      title: `**${label}**`,
      body: formatFlashcardDetailBody(section),
      collapsed: false,
    };
  }

  function extractTrailingRemId(value) {
    const match = String(value || '').match(/-([A-Za-z0-9]{12,})$/);
    return match ? match[1] : '';
  }

  function parseRemNotePairedPageIdFromUrl(url) {
    let decoded = '';
    try {
      decoded = decodeURIComponent(String(url || ''));
    } catch {
      decoded = String(url || '');
    }
    const match = /\/paired_\(([^)]*)\)_\(([^)]*)\)(?:[_/?#]|$)/.exec(decoded);
    return match ? extractTrailingRemId(match[1]) : '';
  }

  function getActivePdfPageRemId() {
    return parseRemNotePairedPageIdFromUrl(window.location?.href || '');
  }

  function resolveFlashcardImageCandidate(capture, result) {
    const explicitlySelected = normalizePopupImageCandidate(result?.selectedImage || result?.imageCandidate);
    if (explicitlySelected) return explicitlySelected;
    return normalizePopupImageCandidate(getReadyImagePrefetch(capture, result)[0]);
  }

  function buildFlashcardPayload(capture, result, parentId = REMNOTE_VOCAB_PARENT_ID) {
    const directTranslation = getDirectTranslation(result);
    const flashcardBack = formatFlashcardBack(directTranslation);
    const sections = Array.isArray(result?.translationSections) ? result.translationSections : [];
    const imageDetail = buildImageDetailSection(resolveFlashcardImageCandidate(capture, result));
    const detailChildren = [];
    let imageInserted = false;
    for (const section of sections) {
      const detail = detailSectionFromTranslationSection(section);
      if (detail) {
        detailChildren.push(detail);
      }
      if (imageDetail && !imageInserted && isMnemonicSection(section)) {
        detailChildren.push(imageDetail);
        imageInserted = true;
      }
    }
    if (imageDetail && !imageInserted) {
      detailChildren.push(imageDetail);
    }

    return {
      parentId,
      front: capture.selectedText,
      back: flashcardBack,
      type: 'forward',
      detailToggles: detailChildren.length
        ? [
            {
              title: '**Detaylar**',
              children: detailChildren,
              collapsed: false,
            },
          ]
        : [],
      tags: ['RemNote PDF', 'English'],
    };
  }

  function buildFlashcardTargets(capture, result) {
    const targets = [
      {
        label: 'ingilizce kelimeler',
        parentId: REMNOTE_VOCAB_PARENT_ID,
        payload: buildFlashcardPayload(capture, result, REMNOTE_VOCAB_PARENT_ID),
      },
    ];
    const pdfPageRemId = getActivePdfPageRemId();
    if (pdfPageRemId && pdfPageRemId !== REMNOTE_VOCAB_PARENT_ID) {
      targets.push({
        label: 'PDF sayfasi',
        parentId: pdfPageRemId,
        payload: buildFlashcardPayload(capture, result, pdfPageRemId),
      });
    }
    return targets;
  }

  async function callHostCreateFlashcard(payload) {
    const response = await fetch('http://127.0.0.1:3400/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_flashcard',
        payload,
      }),
    });
    const json = await response.json();
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || json?.result?.error || 'HTTP ' + response.status);
    }
    return json?.result || json;
  }

  async function callHostTranslateHelper(action, payload) {
    const response = await fetch('http://127.0.0.1:3400/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    });
    const json = await response.json();
    const result = json?.result?.result || json?.result || json;
    if (!response.ok || json?.ok === false) {
      throw new Error(json?.error || result?.error || 'HTTP ' + response.status);
    }
    return result;
  }

  function isMnemonicSection(section) {
    const key = String(section?.key || '').trim();
    const label = sectionLabel(section).toLocaleLowerCase('tr-TR');
    return key === 'mnemonic' || label === 'mnemonic';
  }

  function isNaturalPatternsSection(section) {
    const key = String(section?.key || '').trim();
    const label = sectionLabel(section).toLocaleLowerCase('tr-TR');
    const asciiLabel = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return key === 'naturalPatterns' || key === 'verbPatterns' || asciiLabel.includes('dogal kalip') ||
      asciiLabel.includes('phrasal verb') || asciiLabel.includes('fiil kalip') || label.includes('natural pattern');
  }

  function isEnglishSynonymsSection(section) {
    const key = String(section?.key || '').trim();
    const label = sectionLabel(section).toLocaleLowerCase('tr-TR');
    return key === 'englishSynonyms' || label.includes('ingilizce') || label.includes('synonym');
  }

  function getGpt55MnemonicPrefetchKey(capture, result) {
    if (!capture?.selectedText || !result || result?.selectionMode === 'sentence') return '';
    const directTranslation = getDirectTranslation(result);
    const hasMeaningCore = Boolean(directTranslation || result?.contextualMeaning || result?.generalMeanings);
    if (!hasMeaningCore) return '';
    return JSON.stringify({
      selectedText: normalizeText(capture.selectedText),
      contextText: normalizeText(capture.contextText || capture.selectedText).slice(0, 1200),
      targetText: normalizeText(result?.targetText || capture.selectedText),
    });
  }

  function getReadyGpt55MnemonicPrefetch(capture, result) {
    const key = getGpt55MnemonicPrefetchKey(capture, result);
    if (!key || state.mnemonicPrefetchKey !== key || state.mnemonicPrefetchStatus !== 'ok') return [];
    return Array.isArray(state.mnemonicPrefetchCandidates) ? state.mnemonicPrefetchCandidates : [];
  }

  function isGpt55MnemonicPrefetchPending(capture, result) {
    const key = getGpt55MnemonicPrefetchKey(capture, result);
    return Boolean(key && state.mnemonicPrefetchKey === key && state.mnemonicPrefetchPromise);
  }

  function prefetchGpt55MnemonicCandidates(capture, result) {
    const key = getGpt55MnemonicPrefetchKey(capture, result);
    if (!key) return Promise.resolve([]);
    if (state.mnemonicPrefetchKey === key && state.mnemonicPrefetchPromise) {
      return state.mnemonicPrefetchPromise;
    }
    if (state.mnemonicPrefetchKey === key && state.mnemonicPrefetchStatus === 'ok' && state.mnemonicPrefetchCandidates.length) {
      return Promise.resolve(state.mnemonicPrefetchCandidates);
    }

    const startedAt = Date.now();
    state.mnemonicPrefetchKey = key;
    state.mnemonicPrefetchStatus = 'running';
    state.mnemonicPrefetchCandidates = [];
    state.mnemonicPrefetchError = null;
    state.mnemonicPrefetchDurationMs = null;
    state.mnemonicPrefetchPromise = callHostTranslateHelper('host_translate_mnemonic_candidates', {
      selectedText: capture.selectedText,
      contextText: capture.contextText || capture.selectedText,
      result,
      source: 'gpt56sol',
      modelTier: 'gpt56_sol_medium',
      candidate: result?.mnemonic || '',
      limit: 3,
    })
      .then((data) => {
        const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
        if (state.mnemonicPrefetchKey === key) {
          state.mnemonicPrefetchStatus = 'ok';
          state.mnemonicPrefetchCandidates = candidates;
          state.mnemonicPrefetchDurationMs = Date.now() - startedAt;
        }
        return candidates;
      })
      .catch((error) => {
        if (state.mnemonicPrefetchKey === key) {
          state.mnemonicPrefetchStatus = 'error';
          state.mnemonicPrefetchCandidates = [];
          state.mnemonicPrefetchError = String(error?.message || error);
          state.mnemonicPrefetchDurationMs = Date.now() - startedAt;
        }
        return [];
      })
      .finally(() => {
        if (state.mnemonicPrefetchKey === key) {
          state.mnemonicPrefetchPromise = null;
        }
      });
    return state.mnemonicPrefetchPromise;
  }

  function getImagePrefetchKey(capture, result) {
    if (!capture?.selectedText || !result) return '';
    const directTranslation = getDirectTranslation(result);
    const hasMeaningCore = Boolean(directTranslation || result?.contextualMeaning || result?.generalMeanings);
    if (!hasMeaningCore) return '';
    return JSON.stringify({
      selectedText: normalizeText(capture.selectedText),
      contextText: normalizeText(capture.contextText || capture.selectedText).slice(0, 1200),
      targetText: normalizeText(result?.targetText || capture.selectedText),
    });
  }

  function getReadyImagePrefetch(capture, result) {
    const key = getImagePrefetchKey(capture, result);
    if (!key || state.imagePrefetchKey !== key || state.imagePrefetchStatus !== 'ok') return [];
    return Array.isArray(state.imagePrefetchCandidates) ? state.imagePrefetchCandidates : [];
  }

  function prefetchImageCandidates(capture, result) {
    const key = getImagePrefetchKey(capture, result);
    if (!key) return Promise.resolve([]);
    if (state.imagePrefetchKey === key && state.imagePrefetchPromise) return state.imagePrefetchPromise;
    if (state.imagePrefetchKey === key && state.imagePrefetchStatus === 'ok') {
      return Promise.resolve(state.imagePrefetchCandidates);
    }

    const startedAt = Date.now();
    state.imagePrefetchKey = key;
    state.imagePrefetchStatus = 'running';
    state.imagePrefetchCandidates = [];
    state.imagePrefetchError = null;
    state.imagePrefetchDurationMs = null;
    state.imagePrefetchPromise = callHostTranslateHelper('host_translate_image_candidates', {
      selectedText: capture.selectedText,
      contextText: capture.contextText || capture.selectedText,
      result,
      limit: 3,
    })
      .then((data) => {
        const candidates = Array.isArray(data?.candidates)
          ? data.candidates.map(normalizePopupImageCandidate).filter(Boolean)
          : [];
        if (state.imagePrefetchKey === key) {
          state.imagePrefetchStatus = 'ok';
          state.imagePrefetchCandidates = candidates;
          state.imagePrefetchDurationMs = Date.now() - startedAt;
        }
        return candidates;
      })
      .catch((error) => {
        if (state.imagePrefetchKey === key) {
          state.imagePrefetchStatus = 'error';
          state.imagePrefetchCandidates = [];
          state.imagePrefetchError = String(error?.message || error);
          state.imagePrefetchDurationMs = Date.now() - startedAt;
        }
        return [];
      })
      .finally(() => {
        if (state.imagePrefetchKey === key) state.imagePrefetchPromise = null;
      });
    return state.imagePrefetchPromise;
  }

  function upsertPopupSection(sections, next, afterKey) {
    const cleanNext = {
      ...next,
      value: cleanModelText(next?.value || '', 1200),
    };
    const existingIndex = sections.findIndex((section) => String(section?.key || '') === cleanNext.key);
    if (existingIndex >= 0) {
      return sections.map((section, index) => index === existingIndex ? cleanNext : section);
    }
    const afterIndex = afterKey ? sections.findIndex((section) => String(section?.key || '') === afterKey) : -1;
    if (afterIndex >= 0) {
      return sections.slice(0, afterIndex + 1).concat([cleanNext], sections.slice(afterIndex + 1));
    }
    const synonymsIndex = sections.findIndex((section) => isEnglishSynonymsSection(section));
    if (synonymsIndex >= 0 && cleanNext.key === 'mnemonic') {
      return sections.slice(0, synonymsIndex).concat([cleanNext], sections.slice(synonymsIndex));
    }
    return sections.concat([cleanNext]);
  }

  function resultWithMnemonicCandidate(result, candidate) {
    const cleanCandidate = cleanModelText(candidate, 500);
    const sections = Array.isArray(result?.translationSections) ? result.translationSections : [];
    return {
      ...result,
      mnemonic: cleanCandidate,
      translationSections: upsertPopupSection(sections, {
        key: 'mnemonic',
        label: 'Mnemonic',
        value: cleanCandidate,
      }, 'naturalPatterns'),
    };
  }

  function parseNaturalPatternRows(value) {
    return cleanModelText(value, 1600)
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const eqIndex = line.indexOf('=');
        if (eqIndex < 0) return { pattern: line, detail: '', meaning: '', exampleEnglish: '', exampleTurkish: '' };
        const detail = line.slice(eqIndex + 1).trim();
        const semicolon = detail.indexOf(';');
        const meaning = (semicolon >= 0 ? detail.slice(0, semicolon) : detail).trim();
        const example = semicolon >= 0 ? detail.slice(semicolon + 1).trim() : '';
        const exampleEquals = example.indexOf('=');
        return {
          pattern: line.slice(0, eqIndex).trim(),
          detail,
          meaning,
          exampleEnglish: (exampleEquals >= 0 ? example.slice(0, exampleEquals) : example).trim(),
          exampleTurkish: (exampleEquals >= 0 ? example.slice(exampleEquals + 1) : '').trim(),
        };
      });
  }

  function sectionTextByKey(result, key) {
    const direct = key === 'directTranslation' ? result?.directTranslation : '';
    const contextual = key === 'contextualMeaning' ? result?.contextualMeaning : '';
    const directValue = cleanModelText(direct || contextual || '', 220);
    if (directValue) return directValue;
    const sections = Array.isArray(result?.translationSections) ? result.translationSections : [];
    const section = sections.find((item) => String(item?.key || '').trim() === key);
    return cleanModelText(sectionValue(section), 220);
  }

  function fallbackNaturalPatternDetail(result) {
    const direct = sectionTextByKey(result, 'directTranslation').replace(/[.;]+$/g, '').trim();
    if (direct) return `${direct} anlamındaki kullanım`;
    return sectionTextByKey(result, 'contextualMeaning').replace(/[.;]+$/g, '').trim();
  }

  function appendNaturalPatternHierarchy(parent, valueText, result) {
    const rows = parseNaturalPatternRows(valueText);
    if (rows.length < 2) {
      parent.appendChild(document.createTextNode(valueText));
      return;
    }

    const list = document.createElement('div');
    list.className = 'mcp-cdp-cevir-pattern-list';
    list.style.display = 'grid';
    list.style.gap = '0';
    list.style.marginTop = '3px';

    rows.forEach((row, index) => {
      const item = document.createElement('div');
      item.className = 'mcp-cdp-cevir-pattern-item';
      item.style.padding = index === 0 ? '3px 1px 10px' : '9px 1px 10px';
      item.style.borderBottom = index === rows.length - 1 ? '0' : '1px solid rgba(148, 163, 184, 0.18)';
      item.style.background = 'transparent';
      item.style.whiteSpace = 'normal';

      const pattern = document.createElement('div');
      pattern.className = 'mcp-cdp-cevir-pattern-term';
      pattern.textContent = row.pattern;
      pattern.style.color = '#dbeafe';
      pattern.style.fontSize = '15px';
      pattern.style.fontWeight = '700';
      pattern.style.lineHeight = '1.3';
      pattern.style.marginBottom = row.meaning ? '3px' : '0';
      item.appendChild(pattern);

      if (row.meaning) {
        const detail = document.createElement('div');
        detail.className = 'mcp-cdp-cevir-pattern-detail';
        detail.textContent = row.meaning;
        detail.style.color = '#f4f4f5';
        detail.style.fontSize = '14.5px';
        detail.style.fontWeight = '450';
        detail.style.lineHeight = '1.42';
        item.appendChild(detail);
      } else if (!row.exampleEnglish) {
        const fallbackDetail = fallbackNaturalPatternDetail(result);
        if (fallbackDetail) {
          pattern.style.marginBottom = '4px';
          const detail = document.createElement('div');
          detail.className = 'mcp-cdp-cevir-pattern-detail mcp-cdp-cevir-pattern-detail-fallback';
          detail.textContent = fallbackDetail;
          detail.style.color = '#dbeafe';
          detail.style.lineHeight = '1.35';
          detail.style.opacity = '0.92';
          item.appendChild(detail);
        }
      }

      if (row.exampleEnglish) {
        const example = document.createElement('div');
        example.className = 'mcp-cdp-cevir-pattern-example';
        example.style.display = 'flex';
        example.style.flexWrap = 'wrap';
        example.style.gap = '2px 6px';
        example.style.marginTop = '6px';
        example.style.color = '#cbd5e1';
        example.style.fontSize = '13.5px';
        example.style.fontWeight = '400';
        example.style.lineHeight = '1.42';

        const english = document.createElement('span');
        english.className = 'mcp-cdp-cevir-pattern-example-en';
        english.textContent = row.exampleEnglish;
        english.style.color = '#c7d2fe';
        english.style.fontStyle = 'italic';
        example.appendChild(english);

        if (row.exampleTurkish) {
          const separator = document.createElement('span');
          separator.textContent = '=';
          separator.style.color = '#7f8aa3';
          example.appendChild(separator);

          const turkish = document.createElement('span');
          turkish.textContent = row.exampleTurkish;
          example.appendChild(turkish);
        }
        item.appendChild(example);
      }

      list.appendChild(item);
    });

    parent.appendChild(list);
  }

  function normalizePopupImageCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') return null;
    const imageUrl = cleanModelText(candidate.imageUrl || candidate.image_url || '', 1000);
    if (!/^https?:\/\//i.test(imageUrl)) return null;
    return {
      title: cleanModelText(candidate.title || 'Gorsel', 180),
      imageUrl,
      thumbUrl: cleanModelText(candidate.thumbUrl || candidate.thumb_url || imageUrl, 1000),
      pageUrl: cleanModelText(candidate.pageUrl || candidate.page_url || '', 1000),
      source: cleanModelText(candidate.source || '', 80),
      license: cleanModelText(candidate.license || '', 80),
      creator: cleanModelText(candidate.creator || '', 120),
      displayMode: candidate.displayMode === 'contain' ? 'contain' : 'cover',
      score: Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : null,
    };
  }

  function shortenPopupUrl(value) {
    const raw = cleanModelText(value || '', 1000);
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      const compactPath = parsed.pathname && parsed.pathname !== '/'
        ? parsed.pathname.replace(/\/$/, '').slice(0, 54)
        : '';
      return `${parsed.hostname}${compactPath}${parsed.pathname.length > 54 ? '...' : ''}`;
    } catch {
      return raw.length > 72 ? `${raw.slice(0, 69)}...` : raw;
    }
  }

  function imageCandidateCaption(candidate) {
    if (!candidate) return '';
    return [
      candidate.title,
      [candidate.source, candidate.license].filter(Boolean).join(' / '),
      candidate.creator,
      candidate.pageUrl ? 'Sayfa: ' + shortenPopupUrl(candidate.pageUrl) : '',
    ].filter(Boolean).join('\n');
  }

  function imageCandidateCompactCaption(candidate) {
    if (!candidate) return '';
    return [
      candidate.title,
      [candidate.source, candidate.license].filter(Boolean).join(' / '),
      candidate.creator,
    ].filter(Boolean).join('\n');
  }

  function appendFeaturedVisual(parent, candidate, selected = false, summary = {}) {
    const image = normalizePopupImageCandidate(candidate);
    if (!image) return null;
    const stage = document.createElement('div');
    stage.className = 'mcp-cdp-cevir-featured-stage';
    stage.style.display = 'grid';
    stage.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))';
    stage.style.gap = '12px';
    stage.style.alignItems = 'start';
    stage.style.marginBottom = '10px';
    stage.style.minWidth = '0';

    const summaryNode = document.createElement('div');
    summaryNode.className = 'mcp-cdp-cevir-featured-summary';
    summaryNode.style.minWidth = '0';
    summaryNode.style.padding = '2px';
    const summaryLabel = document.createElement('div');
    summaryLabel.textContent = 'KISA ANLAM';
    summaryLabel.style.color = '#a5b4fc';
    summaryLabel.style.font = '750 10px/1.2 system-ui, -apple-system, Segoe UI, sans-serif';
    const summaryValue = document.createElement('div');
    summaryValue.textContent = cleanModelText(summary.directText || '', 500);
    summaryValue.style.marginTop = '5px';
    summaryValue.style.color = '#f8fafc';
    summaryValue.style.font = '750 17px/1.3 system-ui, -apple-system, Segoe UI, sans-serif';
    summaryValue.style.overflowWrap = 'anywhere';
    summaryNode.appendChild(summaryLabel);
    summaryNode.appendChild(summaryValue);
    const contextualMeaning = cleanModelText(summary.contextualMeaning || '', 700);
    if (contextualMeaning && contextualMeaning.toLocaleLowerCase('tr-TR') !== summaryValue.textContent.toLocaleLowerCase('tr-TR')) {
      const context = document.createElement('div');
      context.textContent = contextualMeaning;
      context.style.marginTop = '8px';
      context.style.color = '#cbd5e1';
      context.style.font = '400 13px/1.42 system-ui, -apple-system, Segoe UI, sans-serif';
      context.style.overflowWrap = 'anywhere';
      summaryNode.appendChild(context);
    }
    stage.appendChild(summaryNode);

    const figure = document.createElement('figure');
    figure.className = 'mcp-cdp-cevir-featured-visual';
    figure.setAttribute('aria-label', selected ? 'Secilen gorsel' : 'Onerilen gorsel');
    figure.style.boxSizing = 'border-box';
    figure.style.width = '100%';
    figure.style.maxWidth = '280px';
    figure.style.margin = '0';
    figure.style.justifySelf = 'end';
    figure.style.padding = '7px';
    figure.style.background = '#f8fafc';
    figure.style.border = '1px solid rgba(165, 180, 252, 0.48)';
    figure.style.borderRadius = '8px';
    figure.style.overflow = 'hidden';

    const img = document.createElement('img');
    img.src = image.thumbUrl || image.imageUrl;
    img.alt = image.title || (selected ? 'Secilen gorsel' : 'Onerilen gorsel');
    img.style.display = 'block';
    img.style.width = '100%';
    img.style.height = image.displayMode === 'contain' ? 'auto' : '142px';
    img.style.maxHeight = image.displayMode === 'contain' ? '128px' : 'none';
    img.style.objectFit = image.displayMode || 'contain';
    img.style.objectPosition = 'center';
    img.style.borderRadius = '5px';
    img.style.background = '#ffffff';

    const caption = document.createElement('figcaption');
    caption.textContent = `${selected ? 'Secilen' : 'Onerilen'} · ${image.title || 'Gorsel'}`;
    caption.style.marginTop = '6px';
    caption.style.color = '#334155';
    caption.style.font = '650 10px/1.3 system-ui, -apple-system, Segoe UI, sans-serif';
    caption.style.overflowWrap = 'anywhere';
    figure.appendChild(img);
    figure.appendChild(caption);
    stage.appendChild(figure);
    parent.appendChild(stage);
    return stage;
  }

  function imageCandidateDetailCaption(candidate) {
    if (!candidate) return '';
    return [
      candidate.title,
      [candidate.source, candidate.license].filter(Boolean).join(' / '),
      candidate.creator,
      candidate.pageUrl ? 'Sayfa: ' + candidate.pageUrl : '',
    ].filter(Boolean).join('\n');
  }

  function buildImageDetailSection(candidate) {
    const image = normalizePopupImageCandidate(candidate);
    if (!image) return null;
    return {
      title: '**Gorsel**',
      body: imageCandidateDetailCaption(image),
      imageUrls: [image.imageUrl],
      collapsed: false,
    };
  }

  function stylePopupActionButton(button) {
    button.style.boxSizing = 'border-box';
    button.style.minHeight = '38px';
    button.style.height = 'auto';
    button.style.minWidth = '0';
    button.style.width = '100%';
    button.style.flex = '1 1 0';
    button.style.maxWidth = '100%';
    button.style.padding = '6px 10px';
    button.style.border = '1px solid rgba(125, 136, 255, 0.72)';
    button.style.borderRadius = '6px';
    button.style.color = '#f8f8ff';
    button.style.background = '#27273a';
    button.style.fontSize = '13px';
    button.style.fontWeight = '700';
    button.style.lineHeight = '1.15';
    button.style.whiteSpace = 'normal';
    button.style.cursor = 'pointer';
    button.style.fontFamily = 'inherit';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.gap = '7px';
    button.style.overflow = 'hidden';
    button.style.textAlign = 'center';
  }

  function setPopupActionButtonContent(button, iconText, labelText) {
    if (!button) return;
    const icon = String(iconText || button.dataset.icon || '').trim();
    const label = String(labelText || '').trim();
    button.dataset.icon = icon;
    button.dataset.label = label;
    button.textContent = '';
    if (icon) {
      const iconNode = document.createElement('span');
      iconNode.className = 'mcp-cdp-cevir-action-icon';
      iconNode.setAttribute('aria-hidden', 'true');
      iconNode.textContent = icon;
      iconNode.style.flex = '0 0 auto';
      iconNode.style.width = '18px';
      iconNode.style.height = '18px';
      iconNode.style.display = 'inline-flex';
      iconNode.style.alignItems = 'center';
      iconNode.style.justifyContent = 'center';
      iconNode.style.borderRadius = '50%';
      iconNode.style.border = '1px solid rgba(165, 180, 252, 0.38)';
      iconNode.style.background = 'rgba(15, 23, 42, 0.46)';
      iconNode.style.color = '#bfdbfe';
      iconNode.style.font = '800 10px/1 system-ui, -apple-system, Segoe UI, sans-serif';
      button.appendChild(iconNode);
    }
    const labelNode = document.createElement('span');
    labelNode.className = 'mcp-cdp-cevir-action-label';
    labelNode.textContent = label;
    labelNode.style.minWidth = '0';
    labelNode.style.overflow = 'visible';
    labelNode.style.textOverflow = 'clip';
    labelNode.style.lineHeight = '1.15';
    labelNode.style.paddingBottom = '1px';
    labelNode.style.whiteSpace = 'normal';
    labelNode.style.textAlign = 'center';
    button.setAttribute('aria-label', label);
    button.appendChild(labelNode);
  }

  function setPopupActionButtonLabel(button, labelText) {
    setPopupActionButtonContent(button, button?.dataset?.icon || '', labelText);
  }

  function setPopupStatusText(status, text) {
    if (!status) return;
    const nextText = String(text || '').trim();
    status.textContent = nextText;
    status.style.display = nextText ? 'block' : 'none';
  }

  async function exportTranslationAsFlashcard(capture, result, button, status) {
    const targets = buildFlashcardTargets(capture, result);
    const payload = targets[0]?.payload || null;
    if (!payload?.front || !payload?.back) {
      throw new Error('Kart icin secili metin veya direkt ceviri bos.');
    }

    button.disabled = true;
    setPopupActionButtonLabel(button, 'Aktariliyor...');
    setPopupStatusText(status, '');
    state.lastFlashcardStatus = 'running';
    state.lastFlashcardError = null;
    state.lastFlashcardTargets = [];

    try {
      const createdTargets = [];
      const failedTargets = [];
      for (const target of targets) {
        try {
          const created = await callHostCreateFlashcard(target.payload);
          createdTargets.push({ label: target.label, parentId: target.parentId, remId: created?.remId || null });
        } catch (error) {
          failedTargets.push({ label: target.label, error: String(error?.message || error) });
        }
      }

      if (!createdTargets.length) {
        throw new Error(failedTargets.map((target) => `${target.label}: ${target.error}`).join('; ') || 'Flashcard kaydedilemedi.');
      }

      state.lastFlashcardStatus = failedTargets.length ? 'partial' : 'ok';
      state.lastFlashcardRemId = createdTargets[0]?.remId || null;
      state.lastFlashcardTargets = createdTargets;
      state.lastFlashcardError = failedTargets.length
        ? failedTargets.map((target) => `${target.label}: ${target.error}`).join('; ')
        : null;
      setPopupActionButtonLabel(button, failedTargets.length ? 'Kismi aktarildi' : 'Aktarildi');
      if (status) {
        const savedLabels = createdTargets.map((target) => target.label).join(' + ');
        setPopupStatusText(
          status,
          failedTargets.length
            ? `Kaydedildi: ${savedLabels}. Hata: ${state.lastFlashcardError}`
            : `Flashcard kaydedildi: ${savedLabels}.`
        );
      }
    } catch (error) {
      state.lastFlashcardStatus = 'error';
      state.lastFlashcardError = String(error?.message || error);
      button.disabled = false;
      setPopupActionButtonLabel(button, "Flashcard'a aktar");
      setPopupStatusText(status, 'Aktarim hatasi: ' + state.lastFlashcardError);
    }
  }

  function getTopicChatSession(capture) {
    const key = JSON.stringify({
      selectedText: cleanModelText(capture?.selectedText, 500).toLocaleLowerCase('en-US'),
      contextText: cleanModelText(capture?.contextText || capture?.selectedText, 1800),
    });
    if (!state.topicChatSessions.has(key)) {
      state.topicChatSessions.set(key, {
        activeTab: 'card',
        messages: [],
        draft: '',
        busy: false,
        error: '',
        requestId: 0,
      });
      while (state.topicChatSessions.size > 20) {
        const oldest = state.topicChatSessions.keys().next().value;
        if (!oldest) break;
        state.topicChatSessions.delete(oldest);
      }
    }
    return state.topicChatSessions.get(key);
  }

  function appendTopicChatAnswer(parent, value) {
    const lines = cleanModelText(value, 4000).split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const block = document.createElement('div');
    block.className = 'mcp-cdp-cevir-chat-answer';
    block.style.display = 'grid';
    block.style.gap = '7px';
    lines.forEach((line) => {
      const bulletMatch = /^[-*]\s+(.+)$/.exec(line);
      if (bulletMatch) {
        const row = document.createElement('div');
        row.style.display = 'grid';
        row.style.gridTemplateColumns = '12px minmax(0, 1fr)';
        row.style.gap = '6px';
        const bullet = document.createElement('span');
        bullet.textContent = '•';
        bullet.style.color = '#a5b4fc';
        bullet.style.fontWeight = '800';
        const body = document.createElement('span');
        appendMarkdownBoldInline(body, bulletMatch[1]);
        row.appendChild(bullet);
        row.appendChild(body);
        block.appendChild(row);
        return;
      }
      const paragraph = document.createElement('p');
      paragraph.style.margin = '0';
      appendMarkdownBoldInline(paragraph, line);
      block.appendChild(paragraph);
    });
    parent.appendChild(block);
  }

  function createTopicChatTabShell(capture, result, rerender) {
    const session = getTopicChatSession(capture);
    const tabRow = document.createElement('div');
    tabRow.className = 'mcp-cdp-cevir-tabs';
    tabRow.setAttribute('role', 'tablist');
    tabRow.setAttribute('aria-label', 'Ceviri gorunumu');
    tabRow.style.display = 'grid';
    tabRow.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
    tabRow.style.gap = '4px';
    tabRow.style.margin = '0 0 14px';
    tabRow.style.padding = '4px';
    tabRow.style.border = '1px solid rgba(125, 136, 255, 0.28)';
    tabRow.style.borderRadius = '8px';
    tabRow.style.background = '#18181f';

    const cardView = document.createElement('div');
    cardView.className = 'mcp-cdp-cevir-card-view';
    const chatView = document.createElement('div');
    chatView.className = 'mcp-cdp-cevir-chat-view';
    chatView.setAttribute('role', 'tabpanel');
    chatView.setAttribute('aria-label', 'Konu sohbeti');
    chatView.style.minWidth = '0';

    const buttons = {};
    const setActiveTab = (tab) => {
      session.activeTab = tab;
      cardView.style.display = tab === 'card' ? 'block' : 'none';
      chatView.style.display = tab === 'chat' ? 'grid' : 'none';
      for (const [key, button] of Object.entries(buttons)) {
        const active = key === tab;
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.style.color = active ? '#ffffff' : '#a1a1aa';
        button.style.background = active ? '#30303a' : 'transparent';
        button.style.borderColor = active ? 'rgba(165, 180, 252, 0.48)' : 'transparent';
        button.style.boxShadow = active ? '0 1px 2px rgba(0, 0, 0, 0.24)' : 'none';
      }
    };

    const makeTabButton = (key, iconText, labelText) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `mcp-cdp-cevir-tab mcp-cdp-cevir-tab-${key}`;
      button.setAttribute('role', 'tab');
      button.style.display = 'inline-flex';
      button.style.alignItems = 'center';
      button.style.justifyContent = 'center';
      button.style.gap = '8px';
      button.style.minHeight = '36px';
      button.style.padding = '5px 12px';
      button.style.border = '1px solid transparent';
      button.style.borderRadius = '6px';
      button.style.cursor = 'pointer';
      button.style.font = '700 13px/1.2 "Segoe UI Variable Text", "Segoe UI", sans-serif';
      const icon = document.createElement('span');
      icon.textContent = iconText;
      icon.setAttribute('aria-hidden', 'true');
      icon.style.display = 'inline-flex';
      icon.style.alignItems = 'center';
      icon.style.justifyContent = 'center';
      icon.style.width = '21px';
      icon.style.height = '21px';
      icon.style.color = '#bfdbfe';
      icon.style.background = 'rgba(15, 23, 42, 0.7)';
      icon.style.border = '1px solid rgba(165, 180, 252, 0.38)';
      icon.style.borderRadius = '50%';
      icon.style.font = '800 10px/1 system-ui, sans-serif';
      const label = document.createElement('span');
      label.textContent = labelText;
      button.appendChild(icon);
      button.appendChild(label);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setActiveTab(key);
        if (key === 'chat') {
          window.setTimeout(() => chatView.querySelector('textarea')?.focus(), 0);
        }
      }, true);
      buttons[key] = button;
      tabRow.appendChild(button);
    };

    makeTabButton('card', '▤', 'Kart');
    makeTabButton('chat', '···', 'Sohbet');

    const heading = document.createElement('div');
    heading.style.display = 'flex';
    heading.style.alignItems = 'flex-start';
    heading.style.justifyContent = 'space-between';
    heading.style.gap = '12px';
    heading.style.padding = '0 2px 10px';
    heading.style.borderBottom = '1px solid rgba(148, 163, 184, 0.18)';
    const headingText = document.createElement('div');
    const headingTitle = document.createElement('strong');
    headingTitle.textContent = 'Konuya sor';
    headingTitle.style.display = 'block';
    headingTitle.style.fontSize = '14px';
    const headingMeta = document.createElement('span');
    headingMeta.textContent = 'Secili ifade ve cumle baglami otomatik eklendi.';
    headingMeta.style.display = 'block';
    headingMeta.style.marginTop = '3px';
    headingMeta.style.color = '#a1a1aa';
    headingMeta.style.fontSize = '12px';
    headingText.appendChild(headingTitle);
    headingText.appendChild(headingMeta);
    heading.appendChild(headingText);

    if (session.messages.length) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.textContent = 'Temizle';
      clear.style.padding = '4px 7px';
      clear.style.color = '#c7d2fe';
      clear.style.background = 'transparent';
      clear.style.border = '0';
      clear.style.cursor = 'pointer';
      clear.style.font = '650 12px/1.2 inherit';
      clear.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        session.messages = [];
        session.error = '';
        session.draft = '';
        rerender(result);
      }, true);
      heading.appendChild(clear);
    }
    chatView.appendChild(heading);

    const sendQuestion = async (suggestedQuestion = '') => {
      const question = cleanModelText(suggestedQuestion || session.draft, 1200);
      if (!question || session.busy) return;
      const history = session.messages.slice(-6).map(({ role, content }) => ({ role, content }));
      const requestId = session.requestId + 1;
      const messageId = `topic_chat_${Date.now()}_${requestId}`;
      session.requestId = requestId;
      session.messages.push({ id: `${messageId}_user`, role: 'user', content: question });
      session.draft = '';
      session.error = '';
      session.busy = true;
      rerender(result);
      const payload = {
        selectedText: capture.selectedText,
        contextText: capture.contextText || capture.selectedText,
        result,
        question,
        messages: history,
        source: 'cdp_pdf_translate_topic_chat',
      };
      const upsertAssistant = (message) => {
        const index = session.messages.findIndex((item) => item.id === messageId);
        if (index < 0) session.messages.push(message);
        else session.messages[index] = message;
      };
      let qualityFinished = false;
      let quickShown = false;
      const quickTask = callHostTranslateHelper('host_translate_topic_chat_quick', payload)
        .then((data) => {
          if (session.requestId !== requestId || qualityFinished) return data;
          const answer = cleanModelText(data?.answer, 4000);
          if (!answer) return data;
          quickShown = true;
          const meta = [data?.model, data?.durationMs ? `${(data.durationMs / 1000).toFixed(1)} sn` : '', 'kalite tamamlaniyor']
            .filter(Boolean)
            .join(' | ');
          upsertAssistant({ id: messageId, role: 'assistant', content: answer, meta, qualityPending: true });
          rerender(result);
          return data;
        })
        .catch(() => null);
      await quickTask;
      try {
        const data = await callHostTranslateHelper('host_translate_topic_chat', payload);
        qualityFinished = true;
        if (session.requestId !== requestId) return;
        const answer = cleanModelText(data?.answer, 4000);
        if (!answer) throw new Error('AI bos cevap verdi.');
        const meta = [data?.model, data?.durationMs ? `${(data.durationMs / 1000).toFixed(1)} sn` : '', 'kaliteli yanit']
          .filter(Boolean)
          .join(' | ');
        upsertAssistant({ id: messageId, role: 'assistant', content: answer, meta });
      } catch (error) {
        qualityFinished = true;
        const quickData = await quickTask;
        if (session.requestId !== requestId) return;
        const quickAnswer = cleanModelText(quickData?.answer, 4000);
        if (quickAnswer) {
          const meta = [quickData?.model, quickData?.durationMs ? `${(quickData.durationMs / 1000).toFixed(1)} sn` : '', 'hizli yanit']
            .filter(Boolean)
            .join(' | ');
          upsertAssistant({ id: messageId, role: 'assistant', content: quickAnswer, meta });
          if (!quickShown) session.error = 'Kaliteli yanit tamamlanamadi; hizli yanit gosterildi.';
        } else {
          session.error = String(error?.message || error);
        }
      } finally {
        if (session.requestId === requestId) {
          session.busy = false;
          rerender(result);
        }
      }
    };

    if (!session.messages.length) {
      const suggestions = document.createElement('div');
      suggestions.className = 'mcp-cdp-cevir-chat-suggestions';
      suggestions.style.display = 'grid';
      suggestions.style.gap = '7px';
      suggestions.style.marginTop = '12px';
      for (const question of ['Bu kullanim neden boyle?', 'Benzer kelimelerden farki ne?', 'Uc dogal ornek verir misin?']) {
        const suggestion = document.createElement('button');
        suggestion.type = 'button';
        suggestion.textContent = question;
        suggestion.style.minHeight = '38px';
        suggestion.style.padding = '8px 11px';
        suggestion.style.color = '#dbeafe';
        suggestion.style.background = 'rgba(48, 48, 58, 0.7)';
        suggestion.style.border = '1px solid rgba(125, 136, 255, 0.28)';
        suggestion.style.borderRadius = '6px';
        suggestion.style.cursor = 'pointer';
        suggestion.style.font = '600 13px/1.35 inherit';
        suggestion.style.textAlign = 'left';
        suggestion.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          void sendQuestion(question);
        }, true);
        suggestions.appendChild(suggestion);
      }
      chatView.appendChild(suggestions);
    }

    const messages = document.createElement('div');
    messages.className = 'mcp-cdp-cevir-chat-messages';
    messages.setAttribute('aria-live', 'polite');
    messages.style.display = 'grid';
    messages.style.gap = '12px';
    messages.style.maxHeight = '280px';
    messages.style.overflowY = 'auto';
    messages.style.marginTop = session.messages.length ? '12px' : '0';
    messages.style.paddingRight = '3px';
    for (const message of session.messages) {
      const item = document.createElement('div');
      item.className = `mcp-cdp-cevir-chat-message is-${message.role}`;
      item.style.minWidth = '0';
      item.style.overflowWrap = 'anywhere';
      item.style.fontSize = '14px';
      item.style.lineHeight = '1.48';
      if (message.role === 'user') {
        item.style.justifySelf = 'end';
        item.style.maxWidth = '86%';
        item.style.padding = '9px 11px';
        item.style.background = '#343447';
        item.style.border = '1px solid rgba(165, 180, 252, 0.36)';
        item.style.borderRadius = '8px 8px 2px 8px';
      } else {
        item.style.padding = '2px 5px 3px 12px';
        item.style.borderLeft = '2px solid #818cf8';
      }
      const role = document.createElement('div');
      role.textContent = message.role === 'user' ? 'SEN' : 'HIZLI AI';
      role.style.marginBottom = '5px';
      role.style.color = '#a5b4fc';
      role.style.fontSize = '10px';
      role.style.fontWeight = '800';
      item.appendChild(role);
      if (message.role === 'assistant') appendTopicChatAnswer(item, message.content);
      else item.appendChild(document.createTextNode(message.content));
      if (message.meta) {
        const meta = document.createElement('div');
        meta.textContent = message.meta;
        meta.style.marginTop = '7px';
        meta.style.color = '#71717a';
        meta.style.fontSize = '10px';
        item.appendChild(meta);
      }
      messages.appendChild(item);
    }
    if (session.busy) {
      const thinking = document.createElement('div');
      thinking.textContent = session.messages.some((message) => message.qualityPending)
        ? 'Hizli yanit hazir; kalite tamamlaniyor...'
        : 'Yanit hazirlaniyor...';
      thinking.style.color = '#c7d2fe';
      thinking.style.fontSize = '12px';
      thinking.style.padding = '3px 0 3px 12px';
      thinking.style.borderLeft = '2px solid rgba(129, 140, 248, 0.55)';
      thinking.setAttribute('aria-busy', 'true');
      messages.appendChild(thinking);
    }
    chatView.appendChild(messages);

    if (session.error) {
      const error = document.createElement('div');
      error.textContent = session.error;
      error.style.marginTop = '10px';
      error.style.padding = '8px 10px';
      error.style.color = '#fecaca';
      error.style.background = 'rgba(127, 29, 29, 0.28)';
      error.style.border = '1px solid rgba(248, 113, 113, 0.34)';
      error.style.borderRadius = '6px';
      error.style.fontSize = '12px';
      chatView.appendChild(error);
    }

    const composer = document.createElement('div');
    composer.className = 'mcp-cdp-cevir-chat-composer';
    composer.style.display = 'grid';
    composer.style.gridTemplateColumns = 'minmax(0, 1fr) 42px';
    composer.style.gap = '8px';
    composer.style.alignItems = 'end';
    composer.style.marginTop = '12px';
    composer.style.padding = '8px';
    composer.style.background = '#18181f';
    composer.style.border = '1px solid rgba(125, 136, 255, 0.4)';
    composer.style.borderRadius = '8px';
    const textarea = document.createElement('textarea');
    textarea.className = 'mcp-cdp-cevir-chat-input';
    textarea.value = session.draft;
    textarea.rows = 2;
    textarea.maxLength = 1200;
    textarea.placeholder = 'Bu ifade hakkinda bir sey sor...';
    textarea.setAttribute('aria-label', 'Konu hakkinda soru');
    textarea.disabled = session.busy;
    textarea.style.boxSizing = 'border-box';
    textarea.style.width = '100%';
    textarea.style.minHeight = '42px';
    textarea.style.maxHeight = '120px';
    textarea.style.resize = 'vertical';
    textarea.style.padding = '8px';
    textarea.style.color = '#ffffff';
    textarea.style.background = 'transparent';
    textarea.style.border = '0';
    textarea.style.outline = '0';
    textarea.style.font = '400 14px/1.4 inherit';
    textarea.addEventListener('input', () => { session.draft = textarea.value; });
    textarea.addEventListener('keydown', (event) => {
      if (isUnmodifiedSpaceKey(event) && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        insertTopicChatTextareaText(textarea, ' ');
        return;
      }
      if (isUnmodifiedDeleteKey(event) && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        deleteTopicChatTextareaText(textarea, event.key);
        return;
      }
      event.stopPropagation();
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        session.draft = textarea.value;
        void sendQuestion();
      }
    }, true);
    const send = document.createElement('button');
    send.type = 'button';
    send.textContent = '↑';
    send.title = 'Gonder';
    send.setAttribute('aria-label', 'Soruyu gonder');
    send.disabled = session.busy || !session.draft.trim();
    send.style.width = '42px';
    send.style.height = '42px';
    send.style.padding = '0';
    send.style.color = '#ffffff';
    send.style.background = '#4f46e5';
    send.style.border = '1px solid #818cf8';
    send.style.borderRadius = '7px';
    send.style.cursor = send.disabled ? 'default' : 'pointer';
    send.style.opacity = send.disabled ? '0.4' : '1';
    textarea.addEventListener('input', () => {
      send.disabled = session.busy || !textarea.value.trim();
      send.style.cursor = send.disabled ? 'default' : 'pointer';
      send.style.opacity = send.disabled ? '0.4' : '1';
    });
    send.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      session.draft = textarea.value;
      void sendQuestion();
    }, true);
    composer.appendChild(textarea);
    composer.appendChild(send);
    chatView.appendChild(composer);
    const hint = document.createElement('div');
    hint.textContent = 'Enter gonderir · Shift+Enter yeni satir';
    hint.style.marginTop = '5px';
    hint.style.color = '#71717a';
    hint.style.fontSize = '10px';
    hint.style.textAlign = 'right';
    chatView.appendChild(hint);

    setActiveTab(session.activeTab || 'card');
    return { tabRow, cardView, chatView };
  }

  function renderTranslationPopupContent(result, capture) {
    const sections = Array.isArray(result?.translationSections) ? result.translationSections : [];
    const directText = getDirectTranslation(result);
    if (!sections.length && !directText) return null;

    const container = document.createElement('div');
    container.className = 'mcp-cdp-cevir-content';
    container.style.whiteSpace = 'pre-wrap';
    const isPartialResult = result?.partial === true || ['loading', 'core_complete', 'details_error'].includes(result?.detailStatus);

    if (isPartialResult) {
      const statusRow = document.createElement('div');
      statusRow.className = 'mcp-cdp-cevir-progress';
      statusRow.textContent = result?.detailStatus === 'details_error'
        ? 'Kaliteli ceviri hazir. Ayrintilar su anda alinamadi.'
        : result?.detailStatus === 'core_complete'
          ? 'Kaliteli ceviri hazir. Aciklama, kaliplar ve etimoloji tamamlaniyor...'
          : 'Ceviri hazir. Detaylar tamamlaniyor...';
      statusRow.style.color = '#a5b4fc';
      statusRow.style.fontSize = POPUP_META_FONT;
      statusRow.style.lineHeight = '1.35';
      statusRow.style.marginBottom = '12px';
      container.appendChild(statusRow);
    }

    const popupRequestSeq = state.activePopupRequestSeq;
    const rerender = (nextResult) => {
      if (state.activePopupRequestSeq !== popupRequestSeq) return;
      const resolvedResult = reconcilePopupResult(nextResult, popupRequestSeq);
      const nextContent = renderTranslationPopupContent(resolvedResult, capture);
      showPopup('', {
        sticky: true,
        requestSeq: popupRequestSeq,
        contentNode: nextContent,
      });
    };
    let cardView = container;
    if (capture?.selectedText && directText) {
      const shell = createTopicChatTabShell(capture, result, rerender);
      container.appendChild(shell.tabRow);
      container.appendChild(shell.cardView);
      container.appendChild(shell.chatView);
      cardView = shell.cardView;
    }

    const clickedText = cleanModelText(capture?.selectedText, 240);
    const translatedTarget = cleanModelText(result?.targetText || clickedText, 240);
    if (clickedText && translatedTarget) {
      const expandedTarget = translatedTarget.toLocaleLowerCase('en-US') !== clickedText.toLocaleLowerCase('en-US');
      const targetRow = document.createElement('div');
      targetRow.className = 'mcp-cdp-cevir-target-expression';
      targetRow.setAttribute('aria-label', `Cevrilen ifade: ${translatedTarget}`);
      targetRow.style.display = 'grid';
      targetRow.style.gridTemplateColumns = '28px minmax(0, 1fr) auto';
      targetRow.style.alignItems = 'center';
      targetRow.style.columnGap = '10px';
      targetRow.style.rowGap = '2px';
      targetRow.style.marginBottom = '12px';
      targetRow.style.padding = '8px 10px';
      targetRow.style.background = 'rgba(54, 65, 96, 0.42)';
      targetRow.style.border = '1px solid rgba(129, 140, 248, 0.38)';
      targetRow.style.borderRadius = '7px';
      targetRow.style.minWidth = '0';

      const targetIcon = document.createElement('span');
      targetIcon.className = 'mcp-cdp-cevir-target-icon';
      targetIcon.textContent = expandedTarget ? '↗' : '•';
      targetIcon.setAttribute('aria-hidden', 'true');
      targetIcon.style.display = 'inline-flex';
      targetIcon.style.alignItems = 'center';
      targetIcon.style.justifyContent = 'center';
      targetIcon.style.width = '26px';
      targetIcon.style.height = '26px';
      targetIcon.style.color = '#93c5fd';
      targetIcon.style.background = 'rgba(30, 41, 59, 0.72)';
      targetIcon.style.border = '1px solid rgba(147, 197, 253, 0.32)';
      targetIcon.style.borderRadius = '50%';
      targetIcon.style.fontSize = '14px';
      targetIcon.style.lineHeight = '1';

      const targetCopy = document.createElement('div');
      targetCopy.style.minWidth = '0';
      const targetLabel = document.createElement('div');
      targetLabel.className = 'mcp-cdp-cevir-target-label';
      targetLabel.textContent = 'ÇEVRİLEN İFADE';
      targetLabel.style.color = '#a5b4fc';
      targetLabel.style.fontSize = '10px';
      targetLabel.style.fontWeight = '750';
      targetLabel.style.lineHeight = '1.2';
      const targetValue = document.createElement('div');
      targetValue.className = 'mcp-cdp-cevir-target-value';
      targetValue.textContent = translatedTarget;
      targetValue.style.marginTop = '2px';
      targetValue.style.color = '#f8fafc';
      targetValue.style.fontSize = '15px';
      targetValue.style.fontWeight = '750';
      targetValue.style.lineHeight = '1.25';
      targetValue.style.overflowWrap = 'anywhere';
      targetCopy.appendChild(targetLabel);
      targetCopy.appendChild(targetValue);
      targetRow.appendChild(targetIcon);
      targetRow.appendChild(targetCopy);

      if (expandedTarget) {
        const targetMeta = document.createElement('div');
        targetMeta.className = 'mcp-cdp-cevir-target-meta';
        targetMeta.textContent = `Tıklanan: ${clickedText} · Otomatik kalıp`;
        targetMeta.style.maxWidth = '190px';
        targetMeta.style.padding = '3px 7px';
        targetMeta.style.color = '#cbd5e1';
        targetMeta.style.background = 'rgba(15, 23, 42, 0.48)';
        targetMeta.style.borderRadius = '5px';
        targetMeta.style.fontSize = '10px';
        targetMeta.style.fontWeight = '650';
        targetMeta.style.lineHeight = '1.25';
        targetMeta.style.textAlign = 'right';
        targetMeta.style.whiteSpace = 'normal';
        targetRow.appendChild(targetMeta);
      }

      cardView.appendChild(targetRow);
    }

    const explicitlySelectedImage = normalizePopupImageCandidate(result?.selectedImage || result?.imageCandidate);
    const readyFeaturedImage = explicitlySelectedImage || getReadyImagePrefetch(capture, result)[0] || null;
    let featuredStage = null;
    if (readyFeaturedImage) {
      featuredStage = appendFeaturedVisual(cardView, readyFeaturedImage, Boolean(explicitlySelectedImage), {
        directText,
        contextualMeaning: result?.contextualMeaning,
      });
    } else if (getImagePrefetchKey(capture, result)) {
      void prefetchImageCandidates(capture, result).then((candidates) => {
        if (!candidates.length || state.activePopupRequestSeq !== popupRequestSeq) return;
        rerender(state.activePopupResultRequestSeq === popupRequestSeq ? state.activePopupResult : result);
      });
    }

    const payload = capture?.selectedText ? buildFlashcardPayload(capture, result) : null;
    if (!isPartialResult && payload?.front && payload?.back) {
      const actionRow = document.createElement('div');
      actionRow.className = 'mcp-cdp-cevir-actions';
      actionRow.style.display = 'grid';
      actionRow.style.gridTemplateColumns = '1fr';
      actionRow.style.gap = '8px';
      actionRow.style.marginBottom = '14px';

      const status = document.createElement('span');
      status.className = 'mcp-cdp-cevir-flashcard-status';
      status.style.display = 'none';
      status.style.width = '100%';
      status.style.maxWidth = '100%';
      status.style.color = '#a5b4fc';
      status.style.fontSize = POPUP_META_FONT;
      status.style.lineHeight = '1.3';
      status.style.whiteSpace = 'normal';
      status.style.wordBreak = 'normal';
      status.style.overflowWrap = 'break-word';

      const buttonRow = document.createElement('div');
      buttonRow.className = 'mcp-cdp-cevir-action-buttons';
      buttonRow.style.display = 'grid';
      buttonRow.style.gridTemplateColumns = 'repeat(auto-fit, minmax(128px, 1fr))';
      buttonRow.style.alignItems = 'stretch';
      buttonRow.style.gap = '7px';
      buttonRow.style.width = '100%';
      buttonRow.style.maxWidth = '100%';
      buttonRow.style.overflow = 'visible';

      const candidatePanel = document.createElement('div');
      candidatePanel.className = 'mcp-cdp-cevir-candidate-panel';
      candidatePanel.style.display = 'none';
      candidatePanel.style.gap = '8px';
      candidatePanel.style.marginBottom = '12px';
      candidatePanel.style.maxWidth = '100%';
      candidatePanel.style.minWidth = '0';

      const setCandidateStatus = (text) => {
        setPopupStatusText(status, text);
      };

      const clearCandidatePanel = () => {
        candidatePanel.textContent = '';
        candidatePanel.style.display = 'none';
        setCandidateStatus('');
      };

      const showCandidatePanel = () => {
        candidatePanel.style.display = 'grid';
      };

      const appendCandidatePanelDismiss = () => {
        const header = document.createElement('div');
        header.className = 'mcp-cdp-cevir-candidate-panel-header';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.minHeight = '26px';
        header.style.margin = '0 0 2px 0';

        const label = document.createElement('span');
        label.textContent = 'Adaylar';
        label.style.color = '#a5b4fc';
        label.style.font = '700 13px/1.2 system-ui, -apple-system, Segoe UI, sans-serif';

        const dismissButton = document.createElement('button');
        dismissButton.type = 'button';
        dismissButton.className = 'mcp-cdp-cevir-candidate-dismiss';
        dismissButton.textContent = '×';
        dismissButton.title = 'Adaylari kapat';
        dismissButton.setAttribute('aria-label', 'Aday listesini kapat');
        dismissButton.style.width = '26px';
        dismissButton.style.height = '26px';
        dismissButton.style.padding = '0';
        dismissButton.style.border = '1px solid rgba(251, 113, 133, 0.5)';
        dismissButton.style.borderRadius = '50%';
        dismissButton.style.color = '#fb7185';
        dismissButton.style.background = 'rgba(251, 113, 133, 0.08)';
        dismissButton.style.font = '800 18px/24px system-ui, -apple-system, Segoe UI, sans-serif';
        dismissButton.style.cursor = 'pointer';
        dismissButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          clearCandidatePanel();
        }, true);

        header.appendChild(label);
        header.appendChild(dismissButton);
        candidatePanel.appendChild(header);
      };

      const makeCandidateButton = (text, onClick) => {
        const candidateButton = document.createElement('button');
        candidateButton.type = 'button';
        candidateButton.textContent = text;
        candidateButton.style.width = '100%';
        candidateButton.style.padding = '8px 10px';
        candidateButton.style.border = '1px solid rgba(125, 136, 255, 0.42)';
        candidateButton.style.borderRadius = '6px';
        candidateButton.style.color = '#ffffff';
        candidateButton.style.background = '#30303a';
        candidateButton.style.cursor = 'pointer';
        candidateButton.style.font = POPUP_CANDIDATE_FONT;
        candidateButton.style.textAlign = 'left';
        candidateButton.style.whiteSpace = 'pre-wrap';
        candidateButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        }, true);
        return candidateButton;
      };

      const renderMnemonicCandidates = (candidates, sourceLabel) => {
        candidatePanel.textContent = '';
        if (!candidates.length) {
          candidatePanel.style.display = 'none';
          setCandidateStatus('Mnemonic adayi bulunamadi.');
          return;
        }
        showCandidatePanel();
        setCandidateStatus(`${sourceLabel}: ${candidates.length} aday hazir. Birini sec.`);
        appendCandidatePanelDismiss();
        candidates.forEach((candidate, index) => {
          candidatePanel.appendChild(makeCandidateButton(`${index + 1}. ${candidate}`, () => {
            rerender(resultWithMnemonicCandidate(result, candidate));
          }));
        });
      };

      const renderImageCandidates = (candidates) => {
        candidatePanel.textContent = '';
        if (!candidates.length) {
          candidatePanel.style.display = 'none';
          setCandidateStatus('Uygun gorsel bulunamadi.');
          return;
        }
        showCandidatePanel();
        setCandidateStatus(`${candidates.length} gorsel hazir. Birini sec.`);
        appendCandidatePanelDismiss();
        const gallery = document.createElement('div');
        gallery.className = 'mcp-cdp-cevir-image-gallery';
        gallery.style.display = 'grid';
        gallery.style.gridTemplateColumns = 'repeat(auto-fit, minmax(180px, 1fr))';
        gallery.style.gap = '8px';
        gallery.style.minWidth = '0';
        candidates.forEach((candidate, index) => {
          const image = normalizePopupImageCandidate(candidate);
          if (!image) return;
          const candidateButton = document.createElement('button');
          candidateButton.type = 'button';
          candidateButton.style.display = 'grid';
          candidateButton.style.gridTemplateRows = '132px auto';
          candidateButton.style.gap = '7px';
          candidateButton.style.alignItems = 'start';
          candidateButton.style.width = '100%';
          candidateButton.style.padding = '7px';
          candidateButton.style.border = '1px solid rgba(125, 136, 255, 0.42)';
          candidateButton.style.borderRadius = '6px';
          candidateButton.style.color = '#ffffff';
          candidateButton.style.background = '#30303a';
          candidateButton.style.cursor = 'pointer';
          candidateButton.style.font = POPUP_CANDIDATE_FONT;
          candidateButton.style.textAlign = 'left';
          candidateButton.style.boxSizing = 'border-box';
          candidateButton.style.maxWidth = '100%';
          candidateButton.style.minWidth = '0';
          const img = document.createElement('img');
          img.src = image.thumbUrl || image.imageUrl;
          img.alt = image.title || `Gorsel ${index + 1}`;
          img.style.display = 'block';
          img.style.width = '100%';
          img.style.height = '132px';
          img.style.objectFit = image.displayMode || 'contain';
          img.style.objectPosition = 'center';
          img.style.borderRadius = '4px';
          img.style.background = '#ffffff';
          const caption = document.createElement('span');
          caption.textContent = `${index + 1}. ${imageCandidateCompactCaption(image)}`;
          caption.style.whiteSpace = 'pre-wrap';
          caption.style.minWidth = '0';
          caption.style.overflowWrap = 'anywhere';
          caption.style.wordBreak = 'break-word';
          candidateButton.appendChild(img);
          candidateButton.appendChild(caption);
          candidateButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            rerender({
              ...result,
              selectedImage: image,
              imageCandidate: image,
            });
          }, true);
          gallery.appendChild(candidateButton);
        });
        candidatePanel.appendChild(gallery);
      };

      const updateGpt55ButtonState = () => {
        if (!gpt55Button) return;
        if (getReadyGpt55MnemonicPrefetch(capture, result).length) {
          gpt55Button.disabled = false;
          setPopupActionButtonLabel(gpt55Button, 'Sol Hazir');
        } else if (isGpt55MnemonicPrefetchPending(capture, result)) {
          gpt55Button.disabled = false;
          setPopupActionButtonLabel(gpt55Button, 'Hazirlaniyor');
        } else {
          gpt55Button.disabled = false;
          setPopupActionButtonLabel(gpt55Button, 'Sol Medium');
        }
      };

      const requestMnemonicCandidates = async (button, tier) => {
        const useGpt55 = tier === 'gpt56_sol_medium' || tier === 'gpt56_sol_high_refine';
        const useHighRefine = tier === 'gpt56_sol_high_refine';
        if (tier === 'default') {
          void prefetchGpt55MnemonicCandidates(capture, result).finally(updateGpt55ButtonState);
        }
        if (tier === 'gpt56_sol_medium') {
          const readyCandidates = getReadyGpt55MnemonicPrefetch(capture, result);
          if (readyCandidates.length) {
            renderMnemonicCandidates(readyCandidates, '6.1 Sol Medium');
            updateGpt55ButtonState();
            return;
          }
          if (isGpt55MnemonicPrefetchPending(capture, result)) {
            setPopupActionButtonLabel(button, 'Hazirlaniyor');
            setCandidateStatus('6.1 Sol Medium zaten hazirlaniyor; bitince acilacak.');
            candidatePanel.textContent = '';
            candidatePanel.style.display = 'none';
            const candidates = await prefetchGpt55MnemonicCandidates(capture, result);
            renderMnemonicCandidates(candidates, '6.1 Sol Medium');
            updateGpt55ButtonState();
            return;
          }
        }
        button.disabled = true;
        setPopupActionButtonLabel(button, useHighRefine ? 'Parlatiliyor' : 'Hazirlaniyor');
        setCandidateStatus(useHighRefine ? '5.6 Sol High tek adayi parlatiyor...' : useGpt55 ? '6.1 Sol Medium dusunuyor...' : 'Mnemonic adaylari uretiliyor...');
        candidatePanel.textContent = '';
        candidatePanel.style.display = 'none';
        try {
          if (tier === 'gpt56_sol_medium') {
            const candidates = await prefetchGpt55MnemonicCandidates(capture, result);
            renderMnemonicCandidates(candidates, '6.1 Sol Medium');
          } else {
            const data = await callHostTranslateHelper('host_translate_mnemonic_candidates', {
              selectedText: capture.selectedText,
              contextText: capture.contextText || capture.selectedText,
              result,
              source: useGpt55 ? 'gpt56sol' : 'default',
              modelTier: useHighRefine ? 'gpt56_sol_high_refine' : useGpt55 ? 'gpt56_sol_medium' : 'default',
              candidate: result?.mnemonic || '',
              limit: useHighRefine ? 1 : 3,
            });
            renderMnemonicCandidates(Array.isArray(data?.candidates) ? data.candidates : [], useHighRefine ? 'High Mnemonic' : 'Mnemonic');
          }
        } catch (error) {
          setCandidateStatus('Mnemonic hatasi: ' + String(error?.message || error));
        } finally {
          button.disabled = false;
          if (tier === 'gpt56_sol_medium') updateGpt55ButtonState();
          else setPopupActionButtonLabel(button, useHighRefine ? 'High Mnemonic' : 'Mnemonic');
        }
      };

      const requestImageCandidates = async (button) => {
        button.disabled = true;
        setPopupActionButtonLabel(button, 'Gorsel...');
        setCandidateStatus('Gorsel adaylari araniyor...');
        candidatePanel.textContent = '';
        candidatePanel.style.display = 'none';
        try {
          const candidates = await prefetchImageCandidates(capture, result);
          renderImageCandidates(candidates);
        } catch (error) {
          setCandidateStatus('Gorsel hatasi: ' + String(error?.message || error));
        } finally {
          button.disabled = false;
          setPopupActionButtonLabel(button, 'Gorsel');
        }
      };

      if (result?.selectedImage || result?.imageCandidate) {
        const selectedImage = normalizePopupImageCandidate(result.selectedImage || result.imageCandidate);
        if (selectedImage) {
          setCandidateStatus('Gorsel secildi; Flashcard aktariminda karta eklenecek.');
        }
      }

      const mnemonicButton = document.createElement('button');
      mnemonicButton.type = 'button';
      mnemonicButton.className = 'mcp-cdp-cevir-mnemonic-button';
      mnemonicButton.title = '3 mnemonic adayi uret';
      stylePopupActionButton(mnemonicButton);
      setPopupActionButtonContent(mnemonicButton, SECTION_ICON_BY_KEY.mnemonic, 'Mnemonic');
      mnemonicButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void requestMnemonicCandidates(mnemonicButton, 'default');
      }, true);

      const imageButton = document.createElement('button');
      imageButton.type = 'button';
      imageButton.className = 'mcp-cdp-cevir-image-button';
      imageButton.title = '3 gorsel adayi ara';
      stylePopupActionButton(imageButton);
      setPopupActionButtonContent(imageButton, SECTION_ICON_BY_KEY.visualCue, 'Gorsel');
      imageButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void requestImageCandidates(imageButton);
      }, true);

      const gpt55Button = document.createElement('button');
      gpt55Button.type = 'button';
      gpt55Button.className = 'mcp-cdp-cevir-gpt55-button';
      gpt55Button.title = 'GPT-6.1-Sol medium ile mnemonic adayi iste';
      stylePopupActionButton(gpt55Button);
      setPopupActionButtonContent(gpt55Button, '6.1', 'Sol Medium');
      const gpt55PrefetchPromise = prefetchGpt55MnemonicCandidates(capture, result);
      updateGpt55ButtonState();
      void gpt55PrefetchPromise.finally(updateGpt55ButtonState);
      gpt55Button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void requestMnemonicCandidates(gpt55Button, 'gpt56_sol_medium');
      }, true);

      const highPolishButton = document.createElement('button');
      highPolishButton.type = 'button';
      highPolishButton.className = 'mcp-cdp-cevir-high-polish-button';
      highPolishButton.title = 'GPT-5.6-Sol high ile en iyi tek mnemonic adayini secip parlatir';
      stylePopupActionButton(highPolishButton);
      setPopupActionButtonContent(highPolishButton, 'H', 'High Mnemonic');
      highPolishButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void requestMnemonicCandidates(highPolishButton, 'gpt56_sol_high_refine');
      }, true);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mcp-cdp-cevir-flashcard-button';
      button.title = "Direkt ceviriyi kartin arkasina, diger bolumleri Detaylar'a kaydet";
      button.setAttribute('aria-label', 'Ceviriyi flashcard olarak aktar');
      stylePopupActionButton(button);
      setPopupActionButtonContent(button, '+', "Flashcard'a aktar");
      button.style.gridColumn = '1 / -1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void exportTranslationAsFlashcard(capture, result, button, status);
      }, true);

      buttonRow.appendChild(mnemonicButton);
      buttonRow.appendChild(imageButton);
      buttonRow.appendChild(gpt55Button);
      buttonRow.appendChild(highPolishButton);
      buttonRow.appendChild(button);
      actionRow.appendChild(status);
      actionRow.appendChild(buttonRow);
      if (featuredStage?.parentNode === cardView) {
        cardView.insertBefore(actionRow, featuredStage);
        cardView.insertBefore(candidatePanel, featuredStage);
      } else {
        cardView.appendChild(actionRow);
        cardView.appendChild(candidatePanel);
      }
    }

    if (!sections.length) {
      const row = document.createElement('div');
      row.className = 'mcp-cdp-cevir-section';
      row.style.padding = '7px 10px';
      row.style.border = '1px solid rgba(125, 136, 255, 0.20)';
      row.style.borderRadius = '7px';
      row.style.background = 'rgba(48, 48, 58, 0.58)';

      const label = document.createElement('span');
      label.className = 'mcp-cdp-cevir-label';
      label.style.fontWeight = '700';
      label.style.color = '#ffffff';
      label.textContent = 'Direkt çeviri: ';
      row.appendChild(label);

      row.appendChild(document.createTextNode(directText));
      row.textContent = '';
      appendSectionHeader(row, { key: 'directTranslation', label: 'Direkt çeviri' });
      appendSectionBody(row).appendChild(document.createTextNode(directText));
      cardView.appendChild(row);
      return container.childElementCount ? container : null;
    }

    sections.forEach((section, index) => {
      if (readyFeaturedImage && ['directTranslation', 'contextualMeaning'].includes(String(section?.key || ''))) return;
      const labelText = String(section?.label || '').trim();
      const valueText = sectionValue(section);
      if (!labelText || !valueText) return;

      const row = document.createElement('div');
      row.className = 'mcp-cdp-cevir-section';
      row.style.marginBottom = index === sections.length - 1 ? '0' : '14px';
      row.style.padding = '7px 10px';
      row.style.border = '1px solid rgba(125, 136, 255, 0.20)';
      row.style.borderRadius = '7px';
      row.style.background = 'rgba(48, 48, 58, 0.58)';

      const label = document.createElement('span');
      label.className = 'mcp-cdp-cevir-label';
      label.style.fontWeight = '700';
      label.style.color = '#ffffff';
      label.textContent = labelText + ': ';
      row.appendChild(label);
      row.textContent = '';
      appendSectionHeader(row, section);
      const body = appendSectionBody(row);

      if (isNaturalPatternsSection(section)) {
        appendNaturalPatternHierarchy(body, valueText, result);
      } else if (isExplanationSection(section)) {
        appendExplanationBlock(body, valueText);
      } else if (isEtymologySection(section)) {
        appendEtymologyBlock(body, valueText);
      } else {
        appendHighlightedText(body, valueText, section?.highlightText);
      }
      cardView.appendChild(row);
    });

    return container.childElementCount ? container : null;
  }

  // POPUP_PRONUNCIATION_BEGIN
  // Self-contained: the exact function can also attach to an already-open old-host popup.
  function installPopupPronunciation(popup) {
    if (!popup) {
      const doc = document;
      const win = doc.defaultView;
      const key = '__mcpPopupPronunciationBootstrap';
      const existing = doc.querySelector('.mcp-cdp-cevir-popup');
      if (existing) {
        win[key]?.destroy();
        return installPopupPronunciation(existing);
      }
      if (win[key]) return win[key];
      let disposed = false, body = null;
      const watcher = new win.MutationObserver(sync);
      function destroy() {
        if (disposed) return;
        disposed = true; controller.waiting = false;
        watcher.disconnect();
        doc.removeEventListener('DOMContentLoaded', sync);
        if (win[key] === controller) delete win[key];
      }
      function sync() {
        if (disposed) return;
        const candidate = doc.querySelector('.mcp-cdp-cevir-popup');
        if (candidate) {
          destroy();
          controller.attached = installPopupPronunciation(candidate);
          return;
        }
        if (doc.body && body !== doc.body) {
          watcher.disconnect(); body = doc.body;
          watcher.observe(body, { childList: true });
          doc.removeEventListener('DOMContentLoaded', sync);
        }
      }
      const controller = { waiting: true, sync, destroy, attached: null };
      win[key] = controller;
      if (!doc.body) doc.addEventListener('DOMContentLoaded', sync, { once: true });
      sync();
      return controller;
    }
    if (popup.__mcpPopupPronunciation) {
      popup.__mcpPopupPronunciation.sync();
      return popup.__mcpPopupPronunciation;
    }
    const doc = popup.ownerDocument;
    const win = doc.defaultView;
    let target = '', button = null, status = null, owned = null, disposed = false;
    let message = '';
    const api = win.speechSynthesis;
    function chooseVoice() {
      const voices = (api?.getVoices?.() || []).filter(v => v.localService === true && /^en(?:[-_]|$)/i.test(v.lang));
      return voices.find(v => /^en[-_]US$/i.test(v.lang) && v.default)
        || voices.find(v => /^en[-_]US$/i.test(v.lang))
        || voices.find(v => v.default) || voices[0];
    }
    function paint() {
      if (button) {
        button.setAttribute('aria-pressed', owned ? 'true' : 'false');
        button.setAttribute('aria-label', owned ? 'İngilizce seslendirmeyi durdur' : 'İngilizce telaffuzu dinle');
        const voice = owned?.voice || chooseVoice();
        button.title = voice ? `${owned ? 'Seslendirmeyi durdur' : 'İngilizce telaffuz'} · ${voice.name} (${voice.lang})` : 'Yerel İngilizce ses bulunamadı';
      }
      if (status && status.textContent !== message) status.textContent = message;
    }
    function stop() {
      if (owned) {
        owned = null;
        api.cancel();
      }
      message = '';
      paint();
    }
    function click(event) {
      event.preventDefault(); event.stopPropagation();
      sync();
      if (disposed || !button || !target) return;
      if (owned) { stop(); return; }
      if (!api || typeof api.speak !== 'function' || typeof api.cancel !== 'function' || typeof win.SpeechSynthesisUtterance !== 'function') {
        message = 'Seslendirme bu uygulamada desteklenmiyor.'; paint(); return;
      }
      const voice = chooseVoice();
      if (!voice) { message = 'Yerel İngilizce ses bulunamadı. Windows İngilizce sesini etkinleştirin.'; paint(); return; }
      if (api.speaking || api.pending) { message = 'Başka bir seslendirme sürüyor. Bitince tekrar deneyin.'; paint(); return; }
      const utterance = new win.SpeechSynthesisUtterance(target);
      utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = 0.95; utterance.pitch = 1;
      owned = utterance; message = ''; paint();
      const finish = error => {
        if (disposed || owned !== utterance) return;
        owned = null; message = error ? 'Seslendirme yapılamadı. Tekrar deneyin.' : ''; paint();
      };
      utterance.onend = () => finish(false);
      utterance.onerror = () => finish(true);
      try { api.speak(utterance); } catch { finish(true); }
    }
    const observer = new win.MutationObserver(sync);
    // Direct-child removal only: never watch the application's subtree.
    const parentObserver = new win.MutationObserver(() => {
      if (!popup.isConnected) destroy();
    });
    if (popup.parentElement) parentObserver.observe(popup.parentElement, { childList: true });
    const observe = () => observer.observe(popup, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    function sync() {
      if (disposed) return;
      observer.disconnect();
      const value = popup.querySelector('.mcp-cdp-cevir-target-value');
      const row = value?.closest('.mcp-cdp-cevir-target-expression');
      const next = value?.textContent?.trim() || '';
      const style = win.getComputedStyle(popup);
      const hidden = popup.hidden || !popup.isConnected || style.display === 'none' || style.visibility === 'hidden';
      if (next !== target || hidden || !row) stop();
      if (next !== target) message = '';
      target = next;
      if (row && next && !hidden) {
        if (!button || button.parentElement !== row) {
          button?.remove(); status?.remove();
          row.querySelectorAll('.mcp-cdp-pronounce-button,.mcp-cdp-pronounce-status').forEach(el => el.remove());
          button = doc.createElement('button');
          button.type = 'button'; button.className = 'mcp-cdp-pronounce-button';
          button.style.cssText = 'margin-left:auto;flex:0 0 30px;width:30px;height:30px;padding:5px;align-self:flex-start;border:1px solid rgba(147,197,253,.45);border-radius:6px;background:rgba(30,41,59,.72);color:#93c5fd;cursor:pointer;line-height:1;display:inline-flex;align-items:center;justify-content:center';
          button.style.gridColumn = '3'; button.style.gridRow = '1';
          const meta = row.querySelector('.mcp-cdp-cevir-target-meta');
          if (meta) { meta.style.gridColumn = '2 / -1'; meta.style.gridRow = '2'; }
          button.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
          button.addEventListener('click', click);
          status = doc.createElement('span'); status.className = 'mcp-cdp-pronounce-status'; status.setAttribute('role', 'status');
          status.style.cssText = 'font-size:11px;color:#cbd5e1;overflow-wrap:anywhere;flex-basis:100%';
          status.style.gridColumn = '1 / -1'; status.style.gridRow = '3';
          row.append(button, status);
        }
        paint();
      } else {
        button?.remove(); status?.remove(); button = status = null;
      }
      observe();
    }
    function destroy() {
      if (disposed) return;
      disposed = true; observer.disconnect(); parentObserver.disconnect(); stop();
      button?.remove(); status?.remove(); button = status = null;
      delete popup.__mcpPopupPronunciation;
    }
    const controller = { sync, stop, destroy };
    popup.__mcpPopupPronunciation = controller;
    sync();
    return controller;
  }
  // POPUP_PRONUNCIATION_END

  function showPopup(message, options = {}) {
    if (options.requestSeq && state.dismissedPopupRequestSeq === options.requestSeq) {
      return;
    }

    let popup = getPopup();
    if (!popup) {
      popup = document.createElement('div');
      popup.className = 'mcp-cdp-cevir-popup';
      popup.style.position = 'fixed';
      popup.style.zIndex = '2147483647';
      popup.style.boxSizing = 'border-box';
      popup.style.width = '640px';
      popup.style.maxWidth = 'calc(100vw - 24px)';
      popup.style.minWidth = '320px';
      popup.style.padding = '16px 20px';
      popup.style.borderRadius = '8px';
      popup.style.boxShadow = '0 14px 42px rgba(0,0,0,.38)';
      popup.style.border = '1px solid rgba(125,136,255,.36)';
      popup.style.background = '#20202a';
      popup.style.color = '#fff';
      popup.style.fontSize = POPUP_TEXT_FONT;
      popup.style.lineHeight = POPUP_TEXT_LINE_HEIGHT;
      popup.style.fontFamily = '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif';
      popup.style.whiteSpace = 'pre-wrap';
      popup.style.maxHeight = '50vh';
      popup.style.overflowY = 'auto';
      popup.style.overflowX = 'hidden';
      document.body.appendChild(popup);
    }

    if (options.requestSeq) {
      state.activePopupRequestSeq = options.requestSeq;
    }
    const rect = findToolbar()?.toolbar?.getBoundingClientRect();
    popup.style.width = options.assistant ? '700px' : '640px';
    popup.style.maxHeight = options.assistant ? 'calc(100vh - 48px)' : '50vh';
    popup.style.borderRadius = options.assistant ? '16px' : '8px';
    popup.style.padding = options.assistant ? '18px' : '16px 20px';
    popup.textContent = '';
    if (options.contentNode instanceof Node) {
      popup.style.whiteSpace = 'normal';
      popup.appendChild(options.contentNode);
    } else {
      popup.style.whiteSpace = 'pre-wrap';
      popup.textContent = message;
    }
    popup.style.display = 'block';
    popup.style.visibility = 'hidden';
    placePopupWithinViewport(popup, rect);
    popup.style.visibility = 'visible';
    installPopupPronunciation(popup);
    if (!options.sticky) {
      window.setTimeout(() => {
        popup.style.display = 'none';
      }, options.timeoutMs || 8500);
    }
  }

  function formatTranslationForPopup(result) {
    const sections = Array.isArray(result?.translationSections) ? result.translationSections : [];
    if (sections.length) {
      return sections
        .map((section) => {
          const label = String(section?.label || '').trim();
          const value = sectionValue(section);
          return label && value ? label + ': ' + value : '';
        })
        .filter(Boolean)
        .join('\n\n');
    }
    return String(result?.translation || '').trim();
  }

  async function callHostTranslateSelection(capture, source, options = {}) {
    const stage = options.stage || (options.quick ? 'quick' : 'full');
    const action = stage === 'core'
      ? 'host_translate_selection_core'
      : stage === 'details'
        ? 'host_translate_selection_details'
        : stage === 'quick'
          ? 'host_translate_selection_quick'
          : 'host_translate_selection';
    const timeoutMs = Number(options.timeoutMs) > 0
      ? Number(options.timeoutMs)
      : TRANSLATE_STAGE_TIMEOUT_MS[stage] || TRANSLATE_STAGE_TIMEOUT_MS.full;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch('http://127.0.0.1:3400/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          action,
          payload: {
            selectedText: capture.selectedText,
            contextText: capture.contextText || capture.selectedText,
            source,
            ...(stage === 'details' ? { coreResult: options.coreResult || {} } : {}),
          },
        }),
      });
      const json = await response.json();
      const result = json?.result?.result || json?.result || json;
      return { response, json, result };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`${stage} ceviri ${timeoutMs} ms icinde tamamlanamadi.`);
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function prefetchTranslationForSelection(expectedKey) {
    const capture = capturePdfSelection();
    const key = getTranslationPrefetchKey(capture);
    if (!key || key !== expectedKey || !shouldPrefetchTranslation(capture)) return null;
    if (state.prefetchPromise && state.prefetchKey === key) return state.prefetchPromise;
    if (
      state.prefetchRetryKey === key
      && state.lastPrefetchStatus === 'error'
      && Date.now() < Number(state.prefetchRetryAfterAt || 0)
    ) {
      return null;
    }

    const startedAt = Date.now();
    state.prefetchKey = key;
    state.lastPrefetchStatus = 'running';
    state.lastPrefetchError = null;
    state.prefetchRetryKey = null;
    state.prefetchRetryAfterAt = 0;
    const corePromise = state.corePrefetchKey === key && state.corePrefetchPromise
      ? state.corePrefetchPromise
      : prefetchCoreTranslationForSelection(key);
    state.prefetchPromise = Promise.resolve(corePromise)
      .then((coreResult) => {
        if (!coreResult) throw new Error('Kaliteli ceviri cekirdegi alinamadi.');
        return callHostTranslateSelection(
          capture,
          'codex_cdp_pdf_toolbar_details_prefetch:' + capture.source,
          { stage: 'details', coreResult }
        );
      })
      .then(({ response, json, result }) => {
        const popupText = formatTranslationForPopup(result);
        if (!response.ok || !popupText) throw new Error(json?.error || json?.result?.error || 'HTTP ' + response.status);
        state.lastPrefetchStatus = 'ok';
        state.lastPrefetchDurationMs = Date.now() - startedAt;
        state.prefetchRetryKey = null;
        state.prefetchRetryAfterAt = 0;
        return result;
      })
      .catch((error) => {
        state.lastPrefetchStatus = 'error';
        state.lastPrefetchDurationMs = Date.now() - startedAt;
        state.lastPrefetchError = String(error?.message || error);
        state.prefetchRetryKey = key;
        state.prefetchRetryAfterAt = Date.now() + 60000;
        return null;
      })
      .finally(() => {
        if (state.prefetchKey === key) {
          state.prefetchPromise = null;
        }
      });
    return state.prefetchPromise;
  }

  async function prefetchCoreTranslationForSelection(expectedKey) {
    const capture = capturePdfSelection();
    const key = getTranslationPrefetchKey(capture);
    if (!key || key !== expectedKey || !shouldPrefetchTranslation(capture)) return null;
    if (state.corePrefetchPromise && state.corePrefetchKey === key) return state.corePrefetchPromise;

    const startedAt = Date.now();
    state.corePrefetchKey = key;
    state.lastCorePrefetchStatus = 'running';
    state.lastCorePrefetchError = null;
    state.corePrefetchPromise = callHostTranslateSelection(
      capture,
      'codex_cdp_pdf_toolbar_core_prefetch:' + capture.source,
      { stage: 'core' }
    )
      .then(({ response, json, result }) => {
        const popupText = formatTranslationForPopup(result);
        if (!response.ok || !popupText) throw new Error(json?.error || json?.result?.error || 'HTTP ' + response.status);
        state.lastCorePrefetchStatus = 'ok';
        state.lastCorePrefetchDurationMs = Date.now() - startedAt;
        return result;
      })
      .catch((error) => {
        state.lastCorePrefetchStatus = 'error';
        state.lastCorePrefetchDurationMs = Date.now() - startedAt;
        state.lastCorePrefetchError = String(error?.message || error);
        return null;
      })
      .finally(() => {
        if (state.corePrefetchKey === key) {
          state.corePrefetchPromise = null;
        }
      });
    return state.corePrefetchPromise;
  }

  function prefetchProgressiveTranslationPaths(key) {
    void prefetchCoreTranslationForSelection(key);
    window.setTimeout(() => {
      void prefetchTranslationForSelection(key);
    }, 150);
  }

  function scheduleTranslationPrefetch() {
    const capture = capturePdfSelection();
    const key = getTranslationPrefetchKey(capture);
    if (!key || !shouldPrefetchTranslation(capture)) return;
    const fullReady = state.prefetchKey === key && (state.prefetchPromise || state.lastPrefetchStatus === 'ok');
    const coreReady = state.corePrefetchKey === key && (state.corePrefetchPromise || state.lastCorePrefetchStatus === 'ok');
    const detailCoolingDown = state.prefetchRetryKey === key
      && state.lastPrefetchStatus === 'error'
      && Date.now() < Number(state.prefetchRetryAfterAt || 0);
    if ((fullReady || detailCoolingDown) && coreReady) return;
    state.prefetchPendingKey = key;
    if (state.prefetchTimer) {
      window.clearTimeout(state.prefetchTimer);
    }
    state.prefetchTimer = window.setTimeout(() => {
      state.prefetchTimer = null;
      prefetchProgressiveTranslationPaths(key);
    }, state.prefetchDelayMs);
  }

  function warmTranslationPrefetchNow() {
    const capture = capturePdfSelection();
    const key = getTranslationPrefetchKey(capture);
    if (!key || !shouldPrefetchTranslation(capture)) return;
    state.prefetchPendingKey = key;
    if (state.prefetchTimer) {
      window.clearTimeout(state.prefetchTimer);
      state.prefetchTimer = null;
    }
    prefetchProgressiveTranslationPaths(key);
  }

  async function translateFromSelection(captureOverride) {
    const requestSeq = state.popupRequestSeq + 1;
    state.popupRequestSeq = requestSeq;
    state.activePopupRequestSeq = requestSeq;
    state.activePopupResultRequestSeq = requestSeq;
    state.activePopupResult = null;
    state.dismissedPopupRequestSeq = 0;
    state.lastDismissReason = null;
    const capture = captureOverride || capturePdfSelection();
    state.lastSelection = capture.selectedText;
    state.lastContext = capture.contextText;

    if (!capture.selectedText) {
      showPopup("Secim okunamadi. PDF icinde metni secili tutup tekrar Cevir'e bas.");
      return;
    }

    showPopup('Ceviriliyor...', { sticky: true, requestSeq });
    let coreResult = null;
    const renderHostResult = ({ response, json, result }) => {
      const popupText = formatTranslationForPopup(result);
      const translation = result?.translation || popupText;
      if (!response.ok || !translation || !popupText) throw new Error(json?.error || json?.result?.error || 'HTTP ' + response.status);
      return { popupText, result };
    };
    const showHostResult = (envelope) => {
      const rendered = renderHostResult(envelope);
      if (state.activePopupRequestSeq !== requestSeq) return rendered;
      const resolvedResult = reconcilePopupResult(rendered.result, requestSeq);
      const popupContent = renderTranslationPopupContent(resolvedResult, capture);
      if (!resolvedResult?.mnemonic) {
        void prefetchGpt55MnemonicCandidates(capture, resolvedResult);
      }
      state.lastTranslation = rendered.popupText;
      state.lastError = null;
      showPopup(rendered.popupText, {
        sticky: true,
        requestSeq,
        contentNode: popupContent,
      });
      return { ...rendered, popupContent, result: resolvedResult };
    };

    try {
      const coreEnvelope = await callHostTranslateSelection(
        capture,
        'cdp_pdf_toolbar_overlay_core:' + capture.source,
        { stage: 'core' }
      );
      coreResult = coreEnvelope.result;
      showHostResult(coreEnvelope);
      if (state.activePopupRequestSeq !== requestSeq) return;

      try {
        const detailEnvelope = await callHostTranslateSelection(
          capture,
          'cdp_pdf_toolbar_overlay_details:' + capture.source,
          { stage: 'details', coreResult }
        );
        showHostResult(detailEnvelope);
      } catch (detailError) {
        state.lastError = String(detailError?.message || detailError);
        if (coreResult && state.activePopupRequestSeq === requestSeq) {
          showHostResult({
            response: { ok: true, status: 200 },
            json: {},
            result: {
              ...coreResult,
              partial: true,
              detailStatus: 'details_error',
            },
          });
        }
      }
    } catch (coreError) {
      state.lastError = String(coreError?.message || coreError);
      try {
        const fallbackEnvelope = await callHostTranslateSelection(
          capture,
          'cdp_pdf_toolbar_overlay_core_fallback:' + capture.source,
          { stage: 'full' }
        );
        showHostResult(fallbackEnvelope);
      } catch (fallbackError) {
        state.lastError = String(fallbackError?.message || fallbackError);
        showPopup('Ceviri hatasi: ' + state.lastError, { sticky: true, requestSeq });
      }
    }
  }

  function ensureButton() {
    state.lastScanAt = Date.now();
    const found = findToolbar();
    if (!found) {
      state.lastToolbarFound = false;
      state.buttonCount = document.querySelectorAll('.mcp-cdp-cevir-button').length;
      return false;
    }
    state.lastToolbarFound = true;

    found.toolbar.querySelectorAll('.mcp-cdp-cevir-button').forEach((button, index) => {
      if (index > 0) button.remove();
    });

    if (found.toolbar.querySelector('.mcp-cdp-cevir-button')) {
      state.buttonCount = document.querySelectorAll('.mcp-cdp-cevir-button').length;
      if (found.surface !== 'note') scheduleTranslationPrefetch();
      return true;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mcp-cdp-cevir-button';
    button.textContent = 'AI Asistanı';
    button.title = 'Seçili metin için AI komutları';
    button.setAttribute('aria-label', 'AI Asistanı');
    styleButton(button);

    const preserve = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const warm = () => { if (found.surface !== 'note') warmTranslationPrefetchNow(); };
    button.addEventListener('pointerenter', warm, true);
    button.addEventListener('focus', warm, true);
    button.addEventListener('pointerdown', (event) => {
      preserve(event);
      warm();
    }, true);
    button.addEventListener('mousedown', preserve, true);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.openAssistant(found.surface || 'pdf');
    }, true);

    found.explainAnchor.insertAdjacentElement('afterend', button);
    state.buttonCount = document.querySelectorAll('.mcp-cdp-cevir-button').length;
    if (found.surface !== 'note') scheduleTranslationPrefetch();
    return true;
  }

  function runHealthScan() {
    try {
      repairExpandedDocumentSidebarVisibility();
      const found = ensureButton();
      state.lastHealthCheckAt = Date.now();
      state.lastHealthError = null;
      return found;
    } catch (error) {
      state.lastHealthCheckAt = Date.now();
      state.lastHealthError = String(error?.message || error);
      return false;
    }
  }

  const scanTimers = new Set();
  function scheduleScan() {
    if (!state.installed || scanTimers.size) return;
    for (const delay of [0, 80, 240]) {
      const timer = window.setTimeout(() => {
        scanTimers.delete(timer);
        if (!state.installed) return;
        moveMcpRightSidebarTabFirst();
        runHealthScan();
      }, delay);
      scanTimers.add(timer);
    }
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  for (const name of ['selectionchange', 'mouseup', 'keyup', 'pointerup']) {
    document.addEventListener(name, scheduleScan, true);
  }
  document.addEventListener('scroll', handleViewportChange, true);
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
  window.addEventListener('keydown', handleWindowKeyDown, true);
  window.addEventListener('resize', handleViewportChange, true);

  state.scan = runHealthScan;
  state.openAssistant = (surface = 'note') => {
    state.activePopupRequestSeq = ++state.popupRequestSeq;
    openAssistant({ capture: capturePdfSelection, call: callHostTranslateHelper,
      show: showPopup, close: () => hidePopup('assistant_close'), translate: translateFromSelection }, surface);
  };
  state.capture = capturePdfSelection;
  state.showPopup = showPopup;
  state.renderTranslationPopupContent = renderTranslationPopupContent;
  state.formatTranslationForPopup = formatTranslationForPopup;
  state.translationResultRank = translationResultRank;
  state.reconcilePopupResult = reconcilePopupResult;
  state.resolveFlashcardImageCandidate = resolveFlashcardImageCandidate;
  state.buildFlashcardPayload = buildFlashcardPayload;
  state.getMnemonicPrefetchKey = getGpt55MnemonicPrefetchKey;
  state.prefetchMnemonicCandidates = prefetchGpt55MnemonicCandidates;
  state.getImagePrefetchKey = getImagePrefetchKey;
  state.prefetchImageCandidates = prefetchImageCandidates;
  state.moveRightSidebarTabFirst = moveMcpRightSidebarTabFirst;
  state.repairSidebarVisibility = repairExpandedDocumentSidebarVisibility;
  state.healthTimer = window.setInterval(runHealthScan, 1000);
  state.cleanup = () => {
    state.installed = false;
    for (const timer of scanTimers) window.clearTimeout(timer);
    scanTimers.clear();
    observer.disconnect();
    for (const name of ['selectionchange', 'mouseup', 'keyup', 'pointerup']) {
      document.removeEventListener(name, scheduleScan, true);
    }
    document.removeEventListener('scroll', handleViewportChange, true);
    document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    window.removeEventListener('keydown', handleWindowKeyDown, true);
    window.removeEventListener('resize', handleViewportChange, true);
    if (state.prefetchTimer) {
      window.clearTimeout(state.prefetchTimer);
      state.prefetchTimer = null;
    }
    if (state.healthTimer) {
      window.clearInterval(state.healthTimer);
      state.healthTimer = null;
    }
    releaseDocumentSidebarVisibilityGuard();
    document.querySelectorAll('.mcp-cdp-cevir-button').forEach((el) => el.remove());
    removeStalePopupDom();
    state.installed = false;
  };

  scheduleScan();
  return {
    ok: true,
    installed: true,
    buttons: document.querySelectorAll('.mcp-cdp-cevir-button').length,
    sidebarOpacityRepairCount: state.sidebarOpacityRepairCount,
    capture: capturePdfSelection(),
  };
}

const overlaySource = `(${injectedOverlay.toString()})(${assistantFactorySource},${JSON.stringify(overlayRevision)})`;

function connectWebSocket(url, connectTimeoutMs = CDP_CONNECT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocketImpl(url);
    const pending = new Map();
    let nextId = 0;
    let connected = false;
    const connectTimer = setTimeout(() => {
      if (connected) return;
      try { ws.close(); } catch {}
      reject(new Error(`CDP WebSocket connect timeout after ${connectTimeoutMs}ms`));
    }, connectTimeoutMs);

    const rejectPending = (error) => {
      for (const pair of pending.values()) {
        clearTimeout(pair.timer);
        pair.reject(error);
      }
      pending.clear();
    };

    ws.onopen = () => {
      connected = true;
      clearTimeout(connectTimer);
      resolve({
        get isOpen() { return ws.readyState === 1; },
        send(method, params = {}, timeoutMs = CDP_COMMAND_TIMEOUT_MS) {
          if (ws.readyState !== 1) {
            return Promise.reject(new Error(`CDP WebSocket is not open for ${method}`));
          }
          const id = ++nextId;
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              pending.delete(id);
              rej(new Error(`CDP command timeout: ${method} after ${timeoutMs}ms`));
            }, timeoutMs);
            pending.set(id, { resolve: res, reject: rej, timer, method });
            try {
              ws.send(JSON.stringify({ id, method, params }));
            } catch (error) {
              clearTimeout(timer);
              pending.delete(id);
              rej(error);
            }
          });
        },
        close() {
          try {
            ws.close();
          } catch {}
        },
      });
    };

    ws.onerror = (error) => {
      const normalized = error instanceof Error ? error : new Error(String(error?.message || error));
      if (!connected) {
        clearTimeout(connectTimer);
        reject(normalized);
      }
      rejectPending(normalized);
    };

    ws.onclose = () => {
      clearTimeout(connectTimer);
      rejectPending(new Error('CDP WebSocket closed'));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id || !pending.has(msg.id)) return;
      const pair = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(pair.timer);
      if (msg.error) pair.reject(new Error(JSON.stringify(msg.error)));
      else pair.resolve(msg.result);
    };
  });
}

async function injectTarget(target) {
  let session = targetSessions.get(target.id);
  if (session && (!session.client.isOpen || session.url !== target.webSocketDebuggerUrl)) {
    session.client.close();
    targetSessions.delete(target.id);
    session = null;
  }
  if (!session) {
    const client = await connectWebSocket(target.webSocketDebuggerUrl);
    session = { client, url: target.webSocketDebuggerUrl, preloadIdentifier: null };
    targetSessions.set(target.id, session);
  }
  const { client } = session;
  try {
    if (!session.preloadIdentifier) {
      await client.send('Runtime.enable');
      await client.send('Page.enable');
      const registered = await client.send('Page.addScriptToEvaluateOnNewDocument', { source: overlaySource });
      if (!registered?.identifier) throw new Error('CDP preload registration returned no identifier');
      session.preloadIdentifier = registered.identifier;
    }
    const evaluated = await client.send('Runtime.evaluate', {
      expression: overlaySource,
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluated?.exceptionDetails) {
      throw new Error(`CDP overlay evaluation failed: ${evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text || 'unknown exception'}`);
    }
    const value = evaluated?.result?.value || {};
    injectedTargets.set(target.id, { title: target.title, updatedAt: Date.now(), value });
    return value;
  } catch (error) {
    targetSessions.delete(target.id);
    client.close();
    throw error;
  }
}

async function tick() {
  if (tickRunning) {
    writeRuntimeStatus({ state: 'busy', lastBusySkipAt: new Date().toISOString() });
    return;
  }
  tickRunning = true;
  writeRuntimeStatus({ state: 'polling', lastTickAt: new Date().toISOString(), lastError: null,
    successfulPages: 0, buttonCount: 0, toolbarFound: false });
  let targets;
  try {
    targets = await fetchJson(`${cdpBaseUrl}/json/list`);
  } catch (error) {
    log('waiting_for_remnote_cdp', { cdpBaseUrl, error: String(error.message || error) });
    writeRuntimeStatus({ state: 'waiting_for_cdp', cdpReady: false, pageCount: 0, lastError: String(error.message || error) });
  } finally {
    if (targets) {
      const pages = targets.filter(isMainRemNotePage);
      const liveIds = new Set(pages.map((page) => page.id));
      for (const [id, session] of targetSessions) {
        if (liveIds.has(id)) continue;
        session.client.close();
        targetSessions.delete(id);
        injectedTargets.delete(id);
      }
      if (pages.length === 0) {
        const pageTargets = targets.filter((target) => target?.type === 'page');
        const pageUrls = pageTargets
          .slice(0, 3)
          .map((target) => String(target?.url || '').slice(0, 180));
        log('no_main_remnote_page', {
          cdpBaseUrl,
          discoveredTargetCount: targets.length,
          pageTargetCount: pageTargets.length,
          pageUrls,
        });
        writeRuntimeStatus({
          state: 'waiting_for_page',
          cdpReady: true,
          discoveredTargetCount: targets.length,
          pageCount: 0,
          successfulPages: 0,
          buttonCount: 0,
          toolbarFound: false,
          pageUrls,
        });
      }

      let successfulPages = 0;
      let buttonCount = 0;
      let toolbarFound = false;
      for (const page of pages) {
        try {
          const wasKnown = injectedTargets.has(page.id);
          const result = await injectTarget(page);
          successfulPages += 1;
          buttonCount += Number(result?.buttons || 0);
          toolbarFound = toolbarFound || Boolean(result?.toolbarFound);
          if (!wasKnown || result?.buttons || result?.capture?.selectedText) {
            log('injected', { title: page.title, buttons: result?.buttons, toolbarFound: result?.toolbarFound, source: result?.capture?.source });
          }
        } catch (error) {
          log('inject_failed', { title: page.title, error: String(error.message || error) });
          writeRuntimeStatus({ lastError: String(error.message || error), lastFailedTargetTitle: page.title || null });
        }
      }

      if (successfulPages > 0) {
        writeRuntimeStatus({
          state: 'healthy',
          cdpReady: true,
          discoveredTargetCount: targets.length,
          pageCount: pages.length,
          successfulPages,
          buttonCount,
          toolbarFound,
          lastSuccessAt: new Date().toISOString(),
        });
      } else if (pages.length > 0) {
        writeRuntimeStatus({
          state: 'injection_failed',
          cdpReady: true,
          discoveredTargetCount: targets.length,
          pageCount: pages.length,
          successfulPages: 0,
          buttonCount: 0,
          toolbarFound: false,
        });
      }
    }

    tickRunning = false;
    clearTimeout(tickTimer);
    tickTimer = setTimeout(() => void tick(), POLL_MS);
  }
}

log('started', { cdpBaseUrl, bridgeUrl });
writeRuntimeStatus({ state: 'started' });
void tick();
