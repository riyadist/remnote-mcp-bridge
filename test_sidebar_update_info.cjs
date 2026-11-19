const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');
const ts = require('typescript');
const esbuild = require('esbuild');
const { chromium } = require('playwright');

const now = Date.parse('2026-10-13T12:00:00.000Z');
const record = { version: '2.59.37', updatedAt: '2026-10-13T08:25:00.000Z', verified: true };
function api() {
  const file = path.join(__dirname, 'src/api/plugin-update-info.ts');
  assert.ok(fs.existsSync(file), 'verified update formatter is not implemented');
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = module.paths;
  mod._compile(compiled, file);
  return mod.exports;
}

test('verified matching update is formatted with Istanbul date and minute precision', () => {
  const result = api().formatPluginUpdateInfo(record, '2.59.37', now);
  assert.equal(result.label, '13.10.2026 11:25');
  assert.ok(result.title.includes('Europe/Istanbul'));
  assert.ok(result.title.includes('2.59.37'));
});

test('unknown, unverified, wrong-version and malformed records cannot claim an update date', () => {
  const { formatPluginUpdateInfo } = api();
  for (const data of [null, {}, [], 'date', { ...record, verified: false },
    { ...record, verified: 'true' }, { ...record, version: '2.59.38' },
    { ...record, updatedAt: null }, { ...record, updatedAt: '2026-02-30T08:25:00Z' },
    { ...record, updatedAt: '2026-10-13T08:25:00' },
    { ...record, updatedAt: '2026-10-13T08:25:00+03:00' },
    { ...record, updatedAt: '2026-10-13T12:00:00.0000001Z' },
    { ...record, updatedAt: '2026-10-14T08:25:00Z' }]) {
    assert.equal(formatPluginUpdateInfo(data, '2.59.37', now).label, 'Tarih kaydı yok', JSON.stringify(data));
  }
});

test('UTC timestamp without fractional seconds and the exact-now boundary are accepted', () => {
  assert.equal(api().formatPluginUpdateInfo({ ...record, updatedAt: '2026-10-13T12:00:00Z' }, record.version, now).label,
    '13.10.2026 15:00');
  assert.equal(api().formatPluginUpdateInfo({ ...record, updatedAt: '2026-10-13T08:25:00.1234567Z' }, record.version, now).label,
    '13.10.2026 11:25');
});

test('version-specific fetch uses no cache and failed responses stay explicitly unknown', async () => {
  const { fetchPluginUpdateInfo } = api();
  const requests = [];
  const good = await fetchPluginUpdateInfo(record.version, async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => record };
  }, now);
  assert.equal(good.label, '13.10.2026 11:25');
  assert.deepEqual(requests, [{ url: 'http://127.0.0.1:8080/plugin-update-2.59.37.json', options: { cache: 'no-store' } }]);
  for (const fetcher of [async () => { throw Error('offline'); },
    async () => ({ ok: false }), async () => ({ ok: true, json: async () => { throw Error('invalid JSON'); } })]) {
    assert.equal((await fetchPluginUpdateInfo(record.version, fetcher, now)).label, 'Tarih kaydı yok');
  }
});

test('actual sidebar replaces PI OS with noninteractive info and preserves refresh/debug/stats at 320px', async t => {
  const version = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version;
  const componentRecord = { ...record, version };
  const bundle = await esbuild.build({
    entryPoints: [path.join(__dirname, 'src/widgets/right_sidebar.tsx')],
    bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'sdk-external-fixture', setup(build) {
      build.onResolve({ filter: /^@remnote\/plugin-sdk$/ }, () => ({ path: 'sdk', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        resolveDir: __dirname,
        contents: `import React from 'react'; import ReactDOM from 'react-dom';
          export const usePlugin = () => window.fixturePlugin;
          export const renderWidget = C => ReactDOM.render(React.createElement(C), document.getElementById('root'));`,
      }));
    } }],
  });
  const installedBrowser = [process.env.SIDEBAR_TEST_BROWSER,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
    .find(file => file && fs.existsSync(file));
  const browser = await chromium.launch({ headless: true, executablePath: installedBrowser });
  try {
    for (const location of [
      { page: 'http://127.0.0.1:8080/right_sidebar.html', manifest: 'http://127.0.0.1:8080/manifest.json' },
      { page: 'http://127.0.0.1:8080/releases/2.59.37-immutable/right_sidebar.html?widget=sidebar#status',
        manifest: 'http://127.0.0.1:8080/releases/2.59.37-immutable/manifest.json' },
    ]) {
    await t.test(location.page, async t => {
    const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/right_sidebar.html*', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
    await page.goto(location.page);
    await page.evaluate(({ record, now }) => {
      Date.now = () => now;
      window.updateRecord = record;
      window.updateMode = 'good';
      window.requests = [];
      window.manifestRequests = [];
      window.fixturePlugin = { storage: { getSynced: async () => null }, rem: {}, window: {} };
      window.fetch = async (url, options) => {
        window.requests.push(url);
        if (url.includes('/plugin-update-')) {
          if (window.updateMode === 'offline') throw Error('offline');
          if (window.updateMode === 'badJson') return { ok: true, json: async () => { throw Error('malformed'); } };
          return { ok: true, json: async () => window.updateRecord };
        }
        if (url.endsWith('/manifest.json')) {
          window.manifestRequests.push({ url, options });
          const [major, minor, patch] = record.version.split('.').map(Number);
          return { ok: true, json: async () => ({ version: { major, minor, patch } }) };
        }
        if (url.endsWith('/health')) return { ok: true, json: async () => ({ ok: true, pluginConnected: true, pending: 0 }) };
        return { ok: true, json: async () => ({ ok: true, stats: { calls: 1, created: 2, updated: 3, journal: 0, searches: 0, reads: 0, errors: 0 }, recentActions: [] }) };
      };
    }, { record: componentRecord, now });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    assert.equal(await page.getByRole('button', { name: 'Open PI OS', exact: true }).count(), 0);
    const info = page.getByLabel('Son eklenti güncellemesi', { exact: true });
    await info.waitFor();
    await page.waitForFunction(() => document.querySelector('[aria-label="Son eklenti güncellemesi"]').textContent.includes('11:25'));
    assert.ok((await info.textContent()).includes('13.10.2026 11:25'));
    assert.deepEqual(await page.evaluate(() => window.manifestRequests), [
      { url: location.manifest, options: undefined },
    ], `sidebar must poll its own release manifest at ${location.page}`);
    assert.equal(await page.getByText(location.manifest, { exact: true }).count(), 1,
      'visible manifest URL must identify the actual polled release');
    assert.equal(await info.evaluate(el => el.tagName), 'SPAN');
    assert.equal(await info.getAttribute('role'), null);
    assert.equal(await info.getAttribute('tabindex'), null);
    assert.ok((await info.getAttribute('title')).includes('Europe/Istanbul'));
    const bounds = await info.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320, JSON.stringify(bounds));
    for (const background of ['#ffffff', '#232329']) {
      await page.evaluate(color => { document.body.style.backgroundColor = color; }, background);
      const contrast = await info.evaluate(el => {
        const channels = value => value.match(/[\d.]+/g).map(Number);
        const text = channels(getComputedStyle(el).color);
        let ancestor = el;
        let backdrop;
        while (ancestor) {
          backdrop = channels(getComputedStyle(ancestor).backgroundColor);
          if (backdrop.length === 3 || backdrop[3] === 1) break;
          ancestor = ancestor.parentElement;
        }
        const luminance = rgb => {
          const linear = rgb.slice(0, 3).map(value => {
            const s = value / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
        };
        const first = luminance(text);
        const second = luminance(backdrop);
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
      });
      t.diagnostic(`info contrast on ${background}: ${contrast.toFixed(2)}:1`);
      assert.ok(contrast >= 4.5, `info contrast on ${background}: ${contrast.toFixed(2)}:1`);
      const themeBounds = await info.boundingBox();
      assert.ok(themeBounds.x >= 0 && themeBounds.x + themeBounds.width <= 320, JSON.stringify(themeBounds));
    }
    assert.equal(await page.getByRole('button', { name: 'Reload Plugin', exact: true }).count(), 1);
    assert.equal(await page.getByText('SESSION STATS', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: /TRANSLATE DEBUG/ }).getAttribute('aria-expanded'), 'false');
    for (const badRecord of [null, { ...componentRecord, version: 'failed-version' }, { ...componentRecord, verified: false }, { ...componentRecord, updatedAt: '2999-01-01T00:00:00Z' }]) {
      await page.evaluate(value => { window.updateRecord = value; }, componentRecord);
      await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[aria-label="Son eklenti güncellemesi"]').textContent.includes('11:25'));
      await page.evaluate(value => { window.updateRecord = value; }, badRecord);
      await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[aria-label="Son eklenti güncellemesi"]').textContent.includes('Tarih kaydı yok'));
    }
    for (const mode of ['offline', 'badJson']) {
      await page.evaluate(value => { window.updateMode = 'good'; window.updateRecord = value; }, componentRecord);
      await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[aria-label="Son eklenti güncellemesi"]').textContent.includes('11:25'));
      await page.evaluate(mode => { window.updateMode = mode; }, mode);
      await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[aria-label="Son eklenti güncellemesi"]').textContent.includes('Tarih kaydı yok'));
      assert.ok((await info.textContent()).includes('Tarih kaydı yok'));
    }
    const loadedVersion = await page.locator('h3').textContent();
    assert.equal(loadedVersion, `MCP Bridge v${version}`);
    assert.ok((await page.evaluate(() => window.requests)).includes(`http://127.0.0.1:8080/plugin-update-${version}.json`));
    assert.deepEqual(errors, []);
    await page.close();
    });
    }
  } finally {
    await browser.close();
  }
});
