#!/usr/bin/env node
'use strict';

const CDP_LIST_URL = process.env.REMNOTE_CDP_LIST_URL || 'http://127.0.0.1:9233/json/list';
const HOST_CALL_URL = process.env.REMNOTE_HOST_CALL_URL || 'http://127.0.0.1:3400/call';
const STATE_KEY = '__mcpRemNoteCevirOverlay25930AppSchemeToolbarV6Live';
const TEST_PARENT_ID = process.env.REMNOTE_FORMAT_TEST_PARENT_ID || '7EzVHNSExGiYbG6Cr';
const TIMEOUT_MS = 20000;

function withTimeout(promise, label, timeoutMs = TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function callHost(action, payload = {}) {
  const response = await withTimeout(fetch(HOST_CALL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  }), action);
  const json = await response.json();
  if (!response.ok || json?.ok === false) {
    throw new Error(json?.error || json?.result?.error || `${action} failed: HTTP ${response.status}`);
  }
  return json?.result?.result || json?.result || json;
}

async function getRemNoteTarget() {
  const response = await withTimeout(fetch(CDP_LIST_URL), 'CDP target list');
  const targets = await response.json();
  const pages = targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  return pages.find((target) => /RemNote|app\.asar|file:\/\//i.test(`${target.title || ''} ${target.url || ''}`)) || pages[0];
}

async function connect(target) {
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

function hasBoldText(value, expectedText) {
  if (Array.isArray(value)) return value.some((item) => hasBoldText(item, expectedText));
  if (!value || typeof value !== 'object') return false;
  if (value.b === true && String(value.text || '').trim() === expectedText) return true;
  return Object.values(value).some((item) => hasBoldText(item, expectedText));
}

function plain(value) {
  if (Array.isArray(value)) return value.map(plain).join('');
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value : '';
  return `${value.text || ''}${Object.values(value).map(plain).join('')}`;
}

(async () => {
  const target = await getRemNoteTarget();
  const cdp = await connect(target);
  let remId = '';
  try {
    const expression = `(() => {
      const state = window[${JSON.stringify(STATE_KEY)}];
      if (!state?.installed || typeof state.buildFlashcardPayload !== 'function') {
        return { ok: false, error: 'V5 overlay is not active' };
      }
      const capture = {
        selectedText: '__CTX_LIVE_FORMAT_PROBE__',
        contextText: 'The speaker used the selected expression in this scene.'
      };
      const result = {
        selectionMode: 'term',
        targetText: '__CTX_LIVE_FORMAT_PROBE__',
        directTranslation: 'canli baglam bicim testi',
        contextualMeaning: 'Bu yalnizca gecici bicim dogrulamasidir.',
        translationSections: [
          { key: 'sentenceTranslation', label: 'Cümle çevirisi', value: 'Bu bir canlı kart biçim testidir.' },
          { key: 'contextualMeaning', label: 'Bağlamdaki anlamı', value: 'Geçici doğrulama.' },
          { key: 'explanation', label: 'Açıklama', value: 'Başlıkların kalın aktarılması gerekir.' }
        ]
      };
      return { ok: true, payload: state.buildFlashcardPayload(capture, result, ${JSON.stringify(TEST_PARENT_ID)}) };
    })()`;
    const evaluated = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
    if (evaluated.exceptionDetails) throw new Error(JSON.stringify(evaluated.exceptionDetails));
    const live = evaluated.result?.value;
    if (!live?.ok) throw new Error(live?.error || 'Live payload could not be built.');

    const payload = live.payload;
    const created = await callHost('create_flashcard', payload);
    remId = created.remId;
    const note = await callHost('read_note', { remId, depth: 2 });
    const detailRoot = (note.children || []).find((child) => child.text === 'Detaylar');
    const detailChildren = detailRoot?.children || [];
    const rawRows = await Promise.all([
      detailRoot ? callHost('debug_rem_raw_text', { remId: detailRoot.remId }) : null,
      ...detailChildren.map((child) => callHost('debug_rem_raw_text', { remId: child.remId })),
    ]);
    const queue = await callHost('export_practice_queue', {
      parentId: TEST_PARENT_ID,
      includeBackText: true,
      limit: 100,
      maxScan: 200,
    });
    const cardRow = (queue.rows || []).find((row) => row.remId === remId);
    const backRaw = cardRow?.backTextRaw;
    const sectionLabels = ['Cümle çevirisi', 'Bağlamdaki anlamı', 'Açıklama'];
    const report = {
      ok: Boolean(
        payload.back === '**Bağlam:** canli baglam bicim testi'
        && payload.detailToggles?.[0]?.title === '**Detaylar**'
        && hasBoldText(backRaw, 'Bağlam:')
        && rawRows[0] && hasBoldText(rawRows[0].rawText, 'Detaylar')
        && sectionLabels.every((label, index) => hasBoldText(rawRows[index + 1]?.rawText, label))
      ),
      overlayStateKey: STATE_KEY,
      createdRemId: remId,
      payloadBack: payload.back,
      payloadRootTitle: payload.detailToggles?.[0]?.title || '',
      payloadSectionTitles: (payload.detailToggles?.[0]?.children || []).map((child) => child.title),
      backPlain: cardRow?.backTextPlain || plain(backRaw),
      nativeBold: {
        backLabel: hasBoldText(backRaw, 'Bağlam:'),
        detailRoot: rawRows[0] ? hasBoldText(rawRows[0].rawText, 'Detaylar') : false,
        sectionLabels: sectionLabels.map((label, index) => ({
          label,
          bold: hasBoldText(rawRows[index + 1]?.rawText, label),
        })),
      },
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) process.exitCode = 1;
  } finally {
    cdp.close();
    if (remId) await callHost('delete_note', { remId }).catch(() => undefined);
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
