#!/usr/bin/env node
'use strict';

const CDP_LIST_URL = process.env.REMNOTE_CDP_LIST_URL || 'http://127.0.0.1:9233/json/list';
const STATE_KEY = '__mcpRemNoteCevirOverlay25930AppSchemeToolbarV6Live';
const TIMEOUT_MS = Number(process.env.REMNOTE_SOL_PREFETCH_VERIFY_TIMEOUT_MS || 60000);

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function getRemNoteTarget() {
  const response = await withTimeout(fetch(CDP_LIST_URL), 'CDP target list');
  if (!response.ok) throw new Error(`CDP target list failed: HTTP ${response.status}`);
  const targets = await response.json();
  const pages = targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  return pages.find((target) => /RemNote|app\.asar|file:\/\//i.test(`${target.title || ''} ${target.url || ''}`)) || pages[0];
}

async function evaluate(target, expression) {
  if (!target) throw new Error('No RemNote CDP page target was found.');
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
  const send = (method, params = {}) => withTimeout(new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  }), method);
  try {
    await send('Runtime.enable');
    const response = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result?.value;
  } finally {
    ws.close();
  }
}

const expression = `(async () => {
  const state = window[${JSON.stringify(STATE_KEY)}];
  if (!state?.installed || typeof state.getMnemonicPrefetchKey !== 'function'
    || typeof state.prefetchMnemonicCandidates !== 'function') {
    return { ok: false, error: 'active early-prefetch overlay was not found' };
  }
  const nonce = Date.now();
  const capture = {
    selectedText: 'slump',
    contextText: 'Will some of the Earth slump into the void when the core burns itself out? Verification ' + nonce
  };
  const core = {
    selectionMode: 'term',
    targetText: 'slump into',
    directTranslation: 'çökerek boşluğa düşmek',
    generalMeanings: '1) fiil: çökmek, aşağı sarkmak 2) fiil: bir boşluğa doğru düşmek',
    contextualMeaning: 'Bir kara parcasinin aniden bosluga dogru cokmesi',
    partial: true,
    detailStatus: 'core_complete',
    translationSections: [
      { key: 'directTranslation', label: 'Direkt çeviri', value: 'çökerek boşluğa düşmek' },
      { key: 'contextualMeaning', label: 'Bu bağlamda anlamı', value: 'boşluğa doğru çökmek' }
    ]
  };
  const detailed = {
    ...core,
    partial: false,
    detailStatus: 'complete',
    naturalPatterns: 'slump into a chair = koltuğa yığılmak',
    etymology: 'slump|çökmek|İskandinav köken olasılığı',
    translationSections: [
      ...core.translationSections,
      { key: 'naturalPatterns', label: 'Doğal kalıplar', value: 'slump into a chair = koltuğa yığılmak' }
    ]
  };
  const coreKey = state.getMnemonicPrefetchKey(capture, core);
  const detailKey = state.getMnemonicPrefetchKey(capture, detailed);
  const startedAt = performance.now();
  const firstPromise = state.prefetchMnemonicCandidates(capture, core);
  const statusAfterCore = state.mnemonicPrefetchStatus;
  const secondPromise = state.prefetchMnemonicCandidates(capture, detailed);
  const samePromise = firstPromise === secondPromise;
  const candidates = await firstPromise;
  return {
    ok: Boolean(coreKey) && coreKey === detailKey && samePromise
      && statusAfterCore === 'running' && state.mnemonicPrefetchStatus === 'ok'
      && Array.isArray(candidates) && candidates.length === 3,
    stateKey: ${JSON.stringify(STATE_KEY)},
    coreKeyEqualsDetailKey: coreKey === detailKey,
    samePromise,
    statusAfterCore,
    finalStatus: state.mnemonicPrefetchStatus,
    candidateCount: Array.isArray(candidates) ? candidates.length : 0,
    durationMs: Math.round(performance.now() - startedAt),
  };
})()`;

(async () => {
  const target = await getRemNoteTarget();
  const result = await evaluate(target, expression);
  const report = { target: { id: target.id, title: target.title, url: target.url }, result };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!result?.ok) process.exitCode = 1;
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
