#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const HOST_CALL_URL = process.env.REMNOTE_HOST_CALL_URL || 'http://127.0.0.1:3400/call';
const CDP_LIST_URL = process.env.REMNOTE_CDP_LIST_URL || 'http://127.0.0.1:9233/json/list';
const STATE_KEY = '__mcpRemNoteCevirOverlay25930AppSchemeToolbarV6Live';
const OUTPUT_PATH = process.env.REMNOTE_CONTEXT_EXPLANATION_PREVIEW_PATH || path.resolve(
  __dirname,
  '../../Temp/remnote_context_explanation_preview.png'
);
const SELECTED_TEXT = 'mine';
const CONTEXT_TEXT = [
  'The science writers I admire never wrote a textbook I used.',
  'Sadly, none of them wrote any textbook I ever used.',
  'All mine were written by men, and it was always men, who made everything formulaic.',
  'The author is criticizing the dull textbooks from his school years.',
].join(' ');

function withTimeout(promise, label, timeoutMs = 120000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function callHost(action, payload) {
  const started = Date.now();
  const response = await withTimeout(fetch(HOST_CALL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ action, payload }),
  }), action);
  const envelope = await response.json();
  if (!response.ok || !envelope?.ok || !envelope?.result) {
    throw new Error(envelope?.error || `${action} failed: HTTP ${response.status}`);
  }
  return { result: envelope.result, elapsedMs: Date.now() - started };
}

async function getRemNoteTarget() {
  const response = await withTimeout(fetch(CDP_LIST_URL), 'CDP target list', 15000);
  if (!response.ok) throw new Error(`CDP target list failed: HTTP ${response.status}`);
  const pages = (await response.json()).filter((target) => target.type === 'page' && target.webSocketDebuggerUrl);
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
  }), 'CDP websocket', 15000);
  return {
    send(method, params = {}) {
      return withTimeout(new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      }), method, 15000);
    },
    close() {
      ws.close();
    },
  };
}

(async () => {
  const coreCall = await callHost('host_translate_selection_core', {
    selectedText: SELECTED_TEXT,
    contextText: CONTEXT_TEXT,
    source: 'context_explanation_live_verifier',
  });
  const detailCall = await callHost('host_translate_selection_details', {
    selectedText: SELECTED_TEXT,
    contextText: CONTEXT_TEXT,
    source: 'context_explanation_live_verifier',
    coreResult: coreCall.result,
  });

  const core = coreCall.result;
  const details = detailCall.result;
  const contextText = String(core.contextExplanation || '');
  const lexicalText = String(details.explanation || '');
  const keys = Array.isArray(details.translationSections)
    ? details.translationSections.map((section) => String(section?.key || ''))
    : [];
  const contextIndex = keys.indexOf('contextExplanation');
  const explanationIndex = keys.indexOf('explanation');
  if (!/kitap/i.test(contextText) || contextIndex < 0) {
    throw new Error(`Context explanation did not resolve the book reference: ${JSON.stringify(contextText)}`);
  }
  if (!lexicalText || lexicalText === contextText || explanationIndex <= contextIndex) {
    throw new Error('The existing lexical explanation was not preserved as a later, separate section.');
  }
  if (details.contextExplanation !== core.contextExplanation) {
    throw new Error('Detail enrichment replaced the quality-core context explanation.');
  }

  const client = await connect(await getRemNoteTarget());
  try {
    const expression = `(() => {
      document.querySelector('[data-mcp-context-explanation-probe]')?.remove();
      const state = window[${JSON.stringify(STATE_KEY)}];
      if (!state?.installed || typeof state.renderTranslationPopupContent !== 'function') {
        return { ok: false, error: 'active overlay state not found' };
      }
      const host = document.createElement('div');
      host.dataset.mcpContextExplanationProbe = 'true';
      Object.assign(host.style, {
        position: 'fixed', left: '24px', top: '24px', zIndex: '2147483647',
        width: '720px', maxHeight: '760px', overflow: 'auto', padding: '14px',
        color: '#f8fafc', background: '#181824', border: '1px solid #5967a5',
        borderRadius: '8px', boxSizing: 'border-box'
      });
      const content = state.renderTranslationPopupContent(
        ${JSON.stringify(details)},
        { selectedText: ${JSON.stringify(SELECTED_TEXT)}, contextText: ${JSON.stringify(CONTEXT_TEXT)} }
      );
      if (!content) return { ok: false, error: 'popup content was not created' };
      host.appendChild(content);
      document.body.appendChild(host);
      const rowElements = [...host.querySelectorAll('.mcp-cdp-cevir-section')];
      const rows = rowElements.map((row) => ({
        label: (row.querySelector('.mcp-cdp-cevir-label')?.textContent?.trim() || '').toLocaleUpperCase('tr-TR'),
        body: row.querySelector('.mcp-cdp-cevir-section-body')?.textContent?.trim() || '',
      }));
      const contextIndex = rows.findIndex((row) => row.label === 'BAĞLAMA GÖRE AÇIKLAMA');
      const explanationIndex = rows.findIndex((row) => row.label === 'AÇIKLAMA');
      const contextRow = rowElements[contextIndex];
      const explanationRow = rowElements[explanationIndex];
      if (contextRow && explanationRow) {
        host.replaceChildren(contextRow.cloneNode(true), explanationRow.cloneNode(true));
        host.style.maxHeight = 'none';
        host.style.overflow = 'visible';
      }
      const rect = host.getBoundingClientRect();
      return {
        ok: contextIndex >= 0 && explanationIndex > contextIndex
          && /kitap/i.test(rows[contextIndex]?.body || '')
          && Boolean(rows[explanationIndex]?.body)
          && host.scrollWidth <= host.clientWidth,
        stateKey: ${JSON.stringify(STATE_KEY)},
        contextIndex,
        explanationIndex,
        contextBody: rows[contextIndex]?.body || '',
        explanationBody: rows[explanationIndex]?.body || '',
        noHorizontalOverflow: host.scrollWidth <= host.clientWidth,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    })()`;
    const evaluated = await client.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    const ui = evaluated?.result?.value;
    if (!ui?.ok) throw new Error(`Live context explanation UI verification failed: ${JSON.stringify(ui)}`);
    const clip = ui.rect;
    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
      clip: { x: clip.x, y: clip.y, width: clip.width, height: Math.min(clip.height, 760), scale: 1 },
    });
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, Buffer.from(screenshot.data, 'base64'));
    await client.send('Runtime.evaluate', {
      expression: `(() => {
        document.querySelector('[data-mcp-context-explanation-probe]')?.remove();
        document.querySelector('[data-mcp-target-expression-probe]')?.remove();
        return true;
      })()`,
      returnByValue: true,
    });
    console.log(JSON.stringify({
      ok: true,
      coreMs: coreCall.elapsedMs,
      detailsMs: detailCall.elapsedMs,
      contextExplanation: core.contextExplanation,
      existingExplanationPreserved: true,
      sectionOrder: keys,
      ui,
      screenshotPath: OUTPUT_PATH,
    }, null, 2));
  } finally {
    client.close();
  }
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
