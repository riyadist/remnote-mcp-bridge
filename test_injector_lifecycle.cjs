'use strict';
// Run: NODE_PATH=<bundled dependencies> node --test test_injector_lifecycle.cjs
// Chromium fixtures are isolated: no connection to RemNote, no note mutations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const net = require('node:net');
const { createRequire } = require('node:module');
const { test, before, after } = require('node:test');
const { chromium } = require('playwright');
const file = path.join(__dirname, 'remnote-cdp-toolbar-injector.cjs');
let source = fs.readFileSync(file, 'utf8');
// Optional negative controls reconstruct the old failure semantics in memory only.
// These are controlled-preimage RED runs, NOT an unchanged historical-source run.
const negativeControl = process.env.REMNOTE_TEST_PREIMAGE;
if (negativeControl) {
  const replacements = {
    guard: ["window[STATE_KEY].revision !== revision", 'true'],
    scheduler: ['if (!state.installed || scanTimers.size) return;', 'if (!state.installed) return;'],
    session: ['let session = targetSessions.get(target.id);', 'let session = null;'],
  };
  assert.ok(replacements[negativeControl], 'unknown negative-control variant');
  const [from, to] = replacements[negativeControl];
  assert.ok(source.includes(from), 'negative-control anchor must exist in production');
  source = source.replace(from, to);
}
const STATE = '__mcpRemNoteSelectionAssistantV7';
const localRequire = createRequire(file);
let browser, page, endpoint;

function loadProduction(overrides = {}) {
  const context = vm.createContext({
    require: (name) => name === 'node:fs' ? { ...fs, mkdirSync() {}, writeFileSync() {} } : localRequire(name),
    __dirname, process: { argv: ['node', file], env: {}, pid: process.pid },
    console: { log() {} }, WebSocket, fetch, AbortController, setTimeout, clearTimeout,
    ...overrides,
  });
  const end = source.indexOf("\nlog('started',");
  assert.ok(end > 0, 'production startup boundary must remain explicit');
  vm.runInContext(source.slice(0, end) + `\nthis.production = {
    overlaySource, injectedOverlay, assistantFactorySource, overlayRevision,
    injectTarget, tick, targetSessions, injectedTargets,
    status: () => runtimeStatus, stop: () => clearTimeout(tickTimer),
    setConnector: (fn) => { connectWebSocket = fn; },
    setTargets: (items) => { fetchJson = async () => items; }
  };`, context, { filename: file });
  return context.production;
}

before(async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  endpoint = `http://127.0.0.1:${port}`;
  browser = await chromium.launch({
    executablePath: process.env.REMNOTE_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: [`--remote-debugging-port=${port}`],
  });
  page = await browser.newPage();
  await page.route('**/call', (route) => route.fulfill({ json: { ok: true, result: { selectedText: 'fixture', capabilities: [] } } }));
});
after(async () => { if (browser) await browser.close(); });

const note = '<div data-cy="selected-text-menu" style="width:300px;height:40px"><button>Explain</button></div>';
const pdf = '<div class="rn-drawing-pdf-selected-text-menu" style="width:400px;height:40px"><button>AI Cards</button><button>Highlight</button><button>Explain</button></div>';
async function install(html = note, expression = loadProduction().overlaySource) {
  await page.goto('about:blank');
  await page.setContent(html);
  await page.evaluate(expression);
  await page.waitForFunction(() => document.querySelectorAll('.mcp-cdp-cevir-button').length === 1);
}

test('same revision retains real assistant popup draft and listener identity', async () => {
  const p = loadProduction();
  await install();
  await page.locator('.mcp-cdp-cevir-button').click();
  await page.locator('.mcp-selection-assistant textarea').first().fill('korunan taslak');
  await page.evaluate((key) => {
    window.savedState = window[key];
    window.savedPopup = document.querySelector('.mcp-cdp-cevir-popup');
  }, STATE);
  for (let i = 0; i < 8; i++) await page.evaluate(p.overlaySource);
  assert.deepEqual(await page.evaluate((key) => ({
    sameState: window.savedState === window[key],
    samePopup: window.savedPopup === document.querySelector('.mcp-cdp-cevir-popup'),
    draft: document.querySelector('.mcp-selection-assistant textarea')?.value ?? null,
    buttons: document.querySelectorAll('.mcp-cdp-cevir-button').length,
  }), STATE), { sameState: true, samePopup: true, draft: 'korunan taslak', buttons: 1 });
  const cdp = await page.context().newCDPSession(page);
  const object = await cdp.send('Runtime.evaluate', { expression: 'window' });
  const first = await cdp.send('DOMDebugger.getEventListeners', { objectId: object.result.objectId });
  await page.evaluate(p.overlaySource);
  const second = await cdp.send('DOMDebugger.getEventListeners', { objectId: object.result.objectId });
  assert.equal(second.listeners.length, first.listeners.length);
  assert.ok(first.listeners.some((listener) => listener.type === 'keydown'));
  await cdp.detach();
});

test('canonical hot deploy can extract the production overlay without running live deployment', () => {
  const deploy = fs.readFileSync(path.join(__dirname, 'deploy_selection_assistant_ui.cjs'), 'utf8');
  const extraction = deploy.split(/\r?\n/).find((line) => line.trim().startsWith('const fn = '));
  assert.ok(extraction, 'canonical deploy extraction must remain discoverable');
  // Evaluate its exact production extraction expression, not a reimplemented parser.
  const fn = Function('source', 'vm', `${extraction}; return fn;`)(source, vm);
  assert.equal(typeof fn, 'function');
  assert.equal(fn.name, 'injectedOverlay');
});

test('default hot-deploy call converges with helper revision without replacing popup draft', async () => {
  const p = loadProduction();
  await install();
  await page.evaluate((key) => window[key].cleanup(), STATE);
  // Canonical deployment calls the function with only the assistant factory.
  await page.evaluate(`(${p.injectedOverlay.toString()})(${p.assistantFactorySource})`);
  await page.waitForFunction(() => document.querySelector('.mcp-cdp-cevir-button'));
  await page.locator('.mcp-cdp-cevir-button').click();
  await page.locator('.mcp-selection-assistant textarea').first().fill('hot-deploy taslak');
  await page.evaluate((key) => { window.hotState = window[key]; }, STATE);
  await page.evaluate(p.overlaySource);
  assert.equal(await page.evaluate((key) => window.hotState === window[key], STATE), true,
    'helper poll must not replace the default hot-deployed state');
  assert.equal(await page.locator('.mcp-selection-assistant textarea').first().inputValue(), 'hot-deploy taslak');
});

test('changed serialized assistant factory replaces obsolete state and click behavior', async () => {
  const p = loadProduction();
  await install();
  await page.evaluate((key) => { window.savedState = window[key]; }, STATE);
  // Runtime-only alternate factory; production source is not changed.
  const factory = function (_api, surface) { window.changedFactorySurface = surface; };
  await page.evaluate(`(${p.injectedOverlay.toString()})(${factory.toString()},"different-factory-revision")`);
  await page.waitForFunction(() => document.querySelector('.mcp-cdp-cevir-button'));
  await page.locator('.mcp-cdp-cevir-button').click();
  assert.deepEqual(await page.evaluate((key) => ({ oldDisposed: !window.savedState.installed,
    replaced: window.savedState !== window[key], surface: window.changedFactorySurface,
    buttons: document.querySelectorAll('.mcp-cdp-cevir-button').length }), STATE),
  { oldDisposed: true, replaced: true, surface: 'note', buttons: 1 });
});

test('cleanup cancels pending scans and cannot recreate the removed button', async () => {
  await install();
  await page.evaluate((key) => {
    document.dispatchEvent(new Event('selectionchange'));
    window[key].cleanup();
  }, STATE);
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.mcp-cdp-cevir-button').count(), 0);
  assert.equal(await page.evaluate((key) => window[key].installed, STATE), false);
});

test('100 selection events create bounded scan timers', async () => {
  await install();
  await page.waitForTimeout(350);
  const timers = await page.evaluate(() => {
    const original = window.setTimeout;
    let count = 0;
    window.setTimeout = function (fn, delay, ...args) { count++; return original(fn, delay, ...args); };
    for (let i = 0; i < 100; i++) document.dispatchEvent(new Event('selectionchange'));
    window.setTimeout = original;
    return count;
  });
  assert.ok(timers > 0 && timers <= 3, `burst allocated ${timers} timers, expected 1..3`);
});

test('note and PDF remounts retain exactly one button with the correct click surface', async () => {
  const p = loadProduction();
  const recorder = function (_api, surface) { window.clickedSurface = surface; };
  await install(note, `(${p.injectedOverlay.toString()})(${recorder.toString()},"surface-contract")`);
  for (const [html, surface] of [[pdf, 'pdf'], [note, 'note'], [pdf, 'pdf'], [note, 'note']]) {
    await page.evaluate((html) => { document.body.innerHTML = html; }, html);
    await page.waitForFunction(() => document.querySelectorAll('.mcp-cdp-cevir-button').length === 1);
    await page.locator('.mcp-cdp-cevir-button').click();
    assert.equal(await page.evaluate(() => window.clickedSurface), surface);
    assert.equal(await page.locator('.mcp-cdp-cevir-button').count(), 1);
  }
});

test('new-document preload installs after DOM readiness', async () => {
  const p = loadProduction();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  const script = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: p.overlaySource + '; window.wasWaitingForBody = Boolean(window.__mcpRemNoteAssistantBootstrap);',
  });
  try {
    await page.goto('data:text/html,' + encodeURIComponent(note));
    await page.waitForFunction((key) => window[key]?.installed, STATE);
    assert.equal(await page.evaluate(() => window.wasWaitingForBody), true);
    assert.equal(await page.evaluate(() => Boolean(window.__mcpRemNoteAssistantBootstrap)), false);
    assert.equal(await page.locator('.mcp-cdp-cevir-button').count(), 1);
  } finally { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script.identifier }); await cdp.detach(); }
});

test('real CDP keeps one socket/preload across eight polls and navigation then reconnects', async () => {
  const p = loadProduction();
  await page.goto('about:blank');
  await page.setContent(note);
  const targets = await (await fetch(endpoint + '/json/list')).json();
  const target = targets.find((item) => item.type === 'page');
  assert.ok(target?.webSocketDebuggerUrl, 'isolated Chromium must expose a CDP page');
  const first = await p.injectTarget(target);
  assert.equal(first.ok, true);
  const session = p.targetSessions.get(target.id);
  assert.ok(session.preloadIdentifier);
  let extraRegistrations = 0;
  const send = session.client.send.bind(session.client);
  session.client.send = (method, ...args) => {
    if (method === 'Page.addScriptToEvaluateOnNewDocument') extraRegistrations++;
    return send(method, ...args);
  };
  for (let i = 0; i < 8; i++) {
    assert.equal((await p.injectTarget(target)).alreadyInstalled, true);
    assert.equal(p.targetSessions.get(target.id), session);
  }
  await page.goto('data:text/html,' + encodeURIComponent(note));
  await page.waitForFunction((key) => window[key]?.installed, STATE);
  await p.injectTarget(target);
  assert.equal(p.targetSessions.get(target.id), session);
  assert.equal(extraRegistrations, 0, 'retained session must not register duplicate preloads');
  assert.equal(await page.locator('.mcp-cdp-cevir-button').count(), 1);
  session.client.close();
  await new Promise((resolve) => setTimeout(resolve, 100));
  await p.injectTarget(target);
  const reconnected = p.targetSessions.get(target.id);
  assert.notEqual(reconnected, session);
  assert.ok(reconnected.client.isOpen);
  reconnected.client.close();
});

function protocolFixture() {
  const p = loadProduction();
  const clients = [];
  p.setConnector(async () => {
    const client = { isOpen: true, closed: false, fail: false,
      close() { this.closed = true; this.isOpen = false; },
      async send(method) {
        if (method === 'Page.addScriptToEvaluateOnNewDocument') return { identifier: 'fixture-preload' };
        if (method === 'Runtime.evaluate') return this.fail
          ? { exceptionDetails: { text: 'fixture evaluation failed' } }
          : { result: { value: { ok: true, buttons: 1, toolbarFound: true } } };
        return {};
      } };
    clients.push(client); return client;
  });
  const target = { id: 'isolated-boundary', title: 'RemNote', type: 'page', url: 'app://js/test', webSocketDebuggerUrl: 'ws://fixture' };
  return { p, clients, target };
}

test('CDP exceptionDetails disposes failed sessions and reports failure', async () => {
  const { p, clients, target } = protocolFixture();
  await p.injectTarget(target);
  clients[0].fail = true;
  await assert.rejects(p.injectTarget(target), /fixture evaluation failed/);
  assert.equal(clients[0].closed, true);
  assert.equal(p.targetSessions.size, 0);
});

test('missing targets prune retained sessions and injected-target records', async () => {
  const { p, clients, target } = protocolFixture();
  await p.injectTarget(target);
  p.setTargets([]);
  try { await p.tick(); } finally { p.stop(); }
  assert.equal(clients[0].closed, true);
  assert.equal(p.targetSessions.size, 0);
  assert.equal(p.injectedTargets.size, 0);
  assert.equal(p.status().state, 'waiting_for_page');
});

test('all failed evaluations reset old healthy counts to observable failure', async () => {
  const { p, clients, target } = protocolFixture();
  p.setTargets([target]);
  try {
    await p.tick(); p.stop();
    assert.equal(p.status().state, 'healthy');
    assert.equal(p.status().buttonCount, 1);
    clients[0].fail = true;
    await p.tick();
    assert.equal(p.status().state, 'injection_failed');
    assert.equal(p.status().successfulPages, 0);
    assert.equal(p.status().buttonCount, 0);
    assert.equal(p.status().toolbarFound, false);
    assert.match(p.status().lastError, /fixture evaluation failed/);
  } finally { p.stop(); }
});
