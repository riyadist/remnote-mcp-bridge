#!/usr/bin/env node
'use strict';

const CDP_LIST_URL = process.env.REMNOTE_CDP_LIST_URL || 'http://127.0.0.1:9233/json/list';
const STATE_KEY = '__mcpRemNoteCevirOverlay25930AppSchemeToolbarV6Live';
const TIMEOUT_MS = 15000;

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const pair = pending.get(message.id);
    if (!pair) return;
    pending.delete(message.id);
    if (message.error) pair.reject(new Error(JSON.stringify(message.error)));
    else pair.resolve(message.result);
  });
  await withTimeout(new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  }), 'CDP websocket');
  return {
    send(method, params = {}) {
      return withTimeout(new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      }), method);
    },
    close() { ws.close(); },
  };
}

const expression = `(() => {
  const overlayKeys = Object.keys(window).filter((key) => key.startsWith('__mcpRemNoteCevirOverlay'));
  const state = window[${JSON.stringify(STATE_KEY)}];
  if (!state?.installed || typeof state.reconcilePopupResult !== 'function') {
    return {
      ok: false,
      error: 'progress race guard is not installed',
      overlayKeys,
      preferredInstalled: Boolean(state?.installed),
      preferredMethods: state ? Object.keys(state).filter((key) => typeof state[key] === 'function') : []
    };
  }
  const seq = ++state.popupRequestSeq;
  state.activePopupRequestSeq = seq;
  state.activePopupResultRequestSeq = seq;
  const complete = {
    targetText: 'prose',
    translation: 'nesir',
    directTranslation: 'nesir',
    contextualMeaning: 'akici bilimsel duzyazi',
    partial: false,
    detailStatus: 'complete',
    translationSections: [
      { key: 'directTranslation', label: 'Direkt ceviri', value: 'nesir' },
      { key: 'contextualMeaning', label: 'Bu baglamda anlami', value: 'akici bilimsel duzyazi' },
      { key: 'explanation', label: 'Aciklama', value: 'Yazarin bilimsel anlatim uslubunu niteler.' }
    ]
  };
  const staleCoreWithImage = {
    targetText: 'prose',
    translation: 'duz yazi',
    directTranslation: 'duz yazi',
    partial: true,
    detailStatus: 'core_complete',
    selectedImage: { imageUrl: 'https://example.invalid/prose.png', title: 'Prose' },
    translationSections: [
      { key: 'directTranslation', label: 'Direkt ceviri', value: 'duz yazi' }
    ]
  };
  state.activePopupResult = complete;
  const resolved = state.reconcilePopupResult(staleCoreWithImage, seq);
  const content = state.renderTranslationPopupContent(resolved, {
    selectedText: 'prose',
    contextText: 'science writers who pen the most lucid and thrilling prose'
  });
  state.showPopup('', { sticky: true, requestSeq: seq, contentNode: content });
  const popup = document.querySelector('.mcp-cdp-cevir-popup');
  const progress = popup?.querySelector('.mcp-cdp-cevir-progress');
  const report = {
    ok: resolved.detailStatus === 'complete'
      && resolved.partial === false
      && resolved.translationSections.length === 3
      && Boolean(resolved.selectedImage)
      && !progress,
    detailStatus: resolved.detailStatus,
    partial: resolved.partial,
    sectionCount: resolved.translationSections.length,
    selectedImagePreserved: Boolean(resolved.selectedImage),
    progressText: progress?.textContent || '',
    popupVisible: Boolean(popup && getComputedStyle(popup).display !== 'none')
  };
  popup?.remove();
  report.popupRemovedAfterCheck = !document.querySelector('.mcp-cdp-cevir-popup');
  return report;
})()`;

(async () => {
  const response = await withTimeout(fetch(CDP_LIST_URL), 'CDP target list');
  const targets = await response.json();
  const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl
    && /RemNote|app\.asar|file:\/\//i.test(`${item.title || ''} ${item.url || ''}`));
  if (!target) throw new Error('No RemNote page target found.');
  const cdp = await connect(target);
  try {
    const evaluated = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
    });
    if (evaluated.exceptionDetails) throw new Error(JSON.stringify(evaluated.exceptionDetails));
    const report = { target: target.title, ...evaluated.result.value };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) process.exitCode = 1;
  } finally {
    cdp.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
