#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CDP_LIST_URL = process.env.REMNOTE_CDP_LIST_URL || 'http://127.0.0.1:9233/json/list';
const HOST_CALL_URL = process.env.REMNOTE_HOST_CALL_URL || 'http://127.0.0.1:3400/call';
const STATE_KEY = '__mcpRemNoteCevirOverlay25930AppSchemeToolbarV6Live';
const OUTPUT_PATH = process.env.REMNOTE_TARGET_PREVIEW_PATH || path.resolve(
  __dirname,
  '../../Temp/remnote_translate_target_expression_preview.png'
);
const TIMEOUT_MS = Number(process.env.REMNOTE_CDP_TIMEOUT_MS || 15000);
const SELECTED_TEXT = 'end';
const CONTEXT_TEXT = 'How did we end up with a Sun in the middle of our planet?';

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function requestCoreResult() {
  const response = await withTimeout(fetch(HOST_CALL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      action: 'host_translate_selection_core',
      payload: {
        selectedText: SELECTED_TEXT,
        contextText: CONTEXT_TEXT,
        source: 'target_expression_live_verifier',
      },
    }),
  }), 'host translation core');
  const envelope = await response.json();
  if (!response.ok || !envelope?.result) {
    throw new Error(envelope?.error || `Host call failed: HTTP ${response.status}`);
  }
  return envelope.result;
}

async function getRemNoteTarget() {
  const response = await withTimeout(fetch(CDP_LIST_URL), 'CDP target list');
  if (!response.ok) throw new Error(`CDP target list failed: HTTP ${response.status}`);
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
    close() {
      ws.close();
    },
  };
}

(async () => {
  const coreResult = await requestCoreResult();
  if (coreResult.targetText !== 'end up') {
    throw new Error(`Expected targetText=end up, received ${JSON.stringify(coreResult.targetText)}`);
  }

  const target = await getRemNoteTarget();
  const client = await connect(target);
  const expression = `(() => {
    document.querySelector('[data-mcp-target-expression-probe]')?.remove();
    const state = window[${JSON.stringify(STATE_KEY)}];
    if (!state?.installed || typeof state.renderTranslationPopupContent !== 'function') {
      return { ok: false, error: 'active overlay state not found' };
    }
    const host = document.createElement('div');
    host.dataset.mcpTargetExpressionProbe = 'true';
    host.style.position = 'fixed';
    host.style.left = '32px';
    host.style.top = '32px';
    host.style.zIndex = '2147483647';
    host.style.width = '640px';
    host.style.padding = '12px';
    host.style.background = '#181824';
    host.style.border = '1px solid #4f5b93';
    const content = state.renderTranslationPopupContent(
      ${JSON.stringify(coreResult)},
      { selectedText: ${JSON.stringify(SELECTED_TEXT)}, contextText: ${JSON.stringify(CONTEXT_TEXT)} }
    );
    if (!content) return { ok: false, error: 'popup content was not created' };
    host.appendChild(content);
    document.body.appendChild(host);
    const banner = host.querySelector('.mcp-cdp-cevir-target-expression');
    const label = banner?.querySelector('.mcp-cdp-cevir-target-label')?.textContent?.trim() || '';
    const value = banner?.querySelector('.mcp-cdp-cevir-target-value')?.textContent?.trim() || '';
    const meta = banner?.querySelector('.mcp-cdp-cevir-target-meta')?.textContent?.trim() || '';
    const rect = banner?.getBoundingClientRect();
    return {
      ok: Boolean(banner) && label === 'ÇEVRİLEN İFADE' && value === 'end up'
        && meta === 'Tıklanan: end · Otomatik kalıp'
        && banner.scrollWidth <= banner.clientWidth,
      stateKey: ${JSON.stringify(STATE_KEY)},
      label,
      value,
      meta,
      noHorizontalOverflow: Boolean(banner) && banner.scrollWidth <= banner.clientWidth,
      rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
    };
  })()`;

  try {
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    const evaluation = await client.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (evaluation.exceptionDetails) throw new Error(JSON.stringify(evaluation.exceptionDetails));
    const result = evaluation.result?.value;
    if (!result?.rect) throw new Error(result?.error || 'Target expression banner was not rendered.');
    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      clip: { ...result.rect, scale: 1 },
    });
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, Buffer.from(screenshot.data, 'base64'));
    await client.send('Runtime.evaluate', {
      expression: `document.querySelector('[data-mcp-target-expression-probe]')?.remove()`,
    });
    const report = {
      target: { id: target.id, title: target.title, url: target.url },
      host: { selectedText: SELECTED_TEXT, targetText: coreResult.targetText },
      result,
      screenshot: OUTPUT_PATH,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } finally {
    client.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
