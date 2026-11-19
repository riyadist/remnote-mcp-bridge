'use strict';
// Birleşik eklentinin bölüm kayıt sistemi: varsayılanlar, telefonda yerel bağlantıların
// başlamaması, ad önekleri ve çakışmasızlık. Sahte nesnelerle; RemNote'a bağlanmaz.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { buildSync } = require('esbuild');

function load(file) {
  const bundle = buildSync({
    entryPoints: [path.join(__dirname, 'src', 'features', file)],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['@remnote/plugin-sdk'],
  }).outputFiles[0].text;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', bundle)(mod, mod.exports, require);
  return mod.exports;
}
const C = load('catalog.ts');
const R = load('registry.ts');
const P = load('platform.ts');

function fakeRuntimes(calls) {
  return C.FEATURES.map((f) => ({
    id: f.id,
    activate: async () => { calls.push(`on:${f.id}`); },
    deactivate: async () => { calls.push(`off:${f.id}`); },
  }));
}

// ---------- Varsayılanlar ----------

test('varsayılan: yalnız köprü açık, diğer her bölüm kapalı', () => {
  const on = C.FEATURES.filter((f) => f.defaultOn).map((f) => f.id);
  assert.deepEqual(on, ['kopru']);
  assert.equal(C.FEATURES.length, 8);
});

test('ayar hiç kaydedilmemişse (masaüstü) yalnız köprü etkinleşir; kapalılar ilk eşitlemede bir kez temizlenir', async () => {
  const calls = [];
  const c = new R.FeatureController(fakeRuntimes(calls), { isMobile: false, getSetting: async () => undefined });
  await c.sync();
  const offIds = C.FEATURES.filter((f) => !f.defaultOn).map((f) => `off:${f.id}`);
  assert.deepEqual(calls.filter((x) => x.startsWith('on:')), ['on:kopru']);
  assert.deepEqual(calls.filter((x) => x.startsWith('off:')), offIds);
  assert.deepEqual(c.activeIds(), ['kopru']);
  calls.length = 0;
  await c.sync();
  assert.deepEqual(calls, [], 'ikinci eşitlemede temizlik tekrarlanmamalı');
});

// ---------- Telefon ----------

test('telefonda hepsi açık olsa bile yalnız bilgisayar bölümleri (köprü dahil) hiç başlamaz', async () => {
  const calls = [];
  const logs = [];
  const c = new R.FeatureController(fakeRuntimes(calls), {
    isMobile: true,
    getSetting: async () => true,
    log: (m, level) => logs.push({ m, level: level || 'info' }),
  });
  const decisions = await c.sync();
  calls.splice(0, calls.length, ...calls.filter((x) => x.startsWith('on:')));
  const desktopOnly = C.FEATURES.filter((f) => f.desktopOnly).map((f) => f.id);
  assert.deepEqual(desktopOnly.sort(), ['alarm', 'ceviri', 'kopru', 'mydrive']);
  for (const id of desktopOnly) assert.ok(!calls.includes(`on:${id}`), `${id} telefonda başladı`);
  assert.deepEqual(calls.sort(), ['on:eisenhower', 'on:nobullet', 'on:ogren', 'on:pdfdark']);
  // Hata ya da uyarı yok: yalnız bilgi kaydı.
  assert.equal(logs.filter((l) => l.level !== 'info').length, 0);
  assert.deepEqual(decisions.filter((d) => d.skippedOnMobile).map((d) => d.id).sort(), desktopOnly.sort());
});

test('telefonda varsayılanlarla hiçbir bölüm başlamaz (köprü telefonda bağlantı kurmaz); yalnız temizlik', async () => {
  const calls = [];
  const c = new R.FeatureController(fakeRuntimes(calls), { isMobile: true, getSetting: async () => undefined });
  await c.sync();
  assert.deepEqual(calls.filter((x) => x.startsWith('on:')), []);
  assert.equal(calls.filter((x) => x.startsWith('off:')).length, C.FEATURES.length);
  assert.deepEqual(c.activeIds(), []);
});

test('platform: işletim sistemi bilgisi önce, yoksa userAgent', () => {
  assert.equal(P.decideMobile('android', ''), true);
  assert.equal(P.decideMobile('ios', ''), true);
  assert.equal(P.decideMobile('windows', 'Mozilla/5.0 (Linux; Android 14)'), false);
  assert.equal(P.decideMobile(undefined, 'Mozilla/5.0 (Linux; Android 14; Pixel)'), true);
  assert.equal(P.decideMobile(undefined, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), false);
});

// ---------- Aç/kapa ----------

test('ayar değişince bölüm kapanır/açılır; aynı durumda ikinci eşitleme hiçbir şey yapmaz', async () => {
  const calls = [];
  const settings = { 'feature.pdfdark': true };
  const c = new R.FeatureController(fakeRuntimes(calls), { isMobile: false, getSetting: async (id) => settings[id] });
  await c.sync();
  await c.sync();
  calls.splice(0, calls.length, ...calls.filter((x) => x.startsWith('on:')));
  assert.deepEqual(calls, ['on:kopru', 'on:pdfdark']);
  settings['feature.pdfdark'] = false;
  settings['feature.kopru'] = false;
  await c.sync();
  assert.deepEqual(calls.slice(2), ['off:kopru', 'off:pdfdark']);
  await c.stopAll();
  assert.deepEqual(c.activeIds(), []);
});

test('eşzamanlı eşitlemeler sıraya girer, bölüm iki kez açılmaz', async () => {
  const calls = [];
  const c = new R.FeatureController(fakeRuntimes(calls), { isMobile: false, getSetting: async () => undefined });
  await Promise.all([c.sync(), c.sync(), c.sync()]);
  assert.deepEqual(calls.filter((x) => x.startsWith('on:')), ['on:kopru']);
  assert.equal(calls.filter((x) => x === 'off:pdfdark').length, 1);
});

test('açılırken hata veren bölüm etkin sayılmaz ve diğerlerini durdurmaz', async () => {
  const calls = [];
  const runtimes = fakeRuntimes(calls).map((r) => (r.id === 'kopru' ? { ...r, activate: async () => { throw new Error('boom'); } } : r));
  const logs = [];
  const c = new R.FeatureController(runtimes, { isMobile: false, getSetting: async (id) => (id === 'feature.nobullet' ? true : undefined), log: (m, l) => logs.push(l) });
  await c.sync();
  assert.deepEqual(c.activeIds(), ['nobullet']);
  assert.ok(logs.includes('error'));
});

// ---------- Adlar ----------

test('taşınan bölümlerin bütün adları bölüm önekiyle başlar', () => {
  const kinds = ['widgets', 'commands', 'menuItems', 'css', 'settings', 'storage', 'powerups'];
  for (const f of C.FEATURES.filter((x) => !x.legacy)) {
    assert.match(f.prefix, /^[a-z]+_$/);
    for (const kind of kinds) for (const name of f.ids[kind]) assert.ok(name.startsWith(f.prefix), `${f.id}.${kind}: ${name}`);
  }
});

test('bölümler arasında widget, komut, kısa kod, menü, CSS ve ayar adı çakışması yok', () => {
  for (const kind of ['widgets', 'commands', 'quickCodes', 'menuItems', 'css', 'settings', 'storage', 'powerups']) {
    const seen = new Map();
    for (const f of C.FEATURES) for (const name of f.ids[kind]) {
      assert.ok(!seen.has(name), `${kind} '${name}' hem ${seen.get(name)} hem ${f.id}`);
      seen.set(name, f.id);
    }
  }
  const settingIds = C.FEATURES.map((f) => C.featureSettingId(f.id));
  assert.equal(new Set(settingIds).size, settingIds.length);
  for (const f of C.FEATURES) for (const s of f.ids.settings) assert.ok(!settingIds.includes(s));
});

test('her widget adının webpack girişi var (src/widgets/<ad>.tsx) ve adlar kaynakta kayıtlı', () => {
  const src = path.join(__dirname, 'src');
  const all = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx|cjs)$/.test(e.name)) all.push(fs.readFileSync(p, 'utf8')); } };
  walk(src);
  all.push(fs.readFileSync(path.join(__dirname, 'selection-assistant-sdk.cjs'), 'utf8'));
  const text = all.join('\n');
  for (const f of C.FEATURES) {
    for (const w of f.ids.widgets) assert.ok(fs.existsSync(path.join(src, 'widgets', `${w}.tsx`)), `widget dosyası yok: ${w}`);
    for (const kind of ['commands', 'menuItems', 'css']) for (const name of f.ids[kind]) {
      if (f.id === 'ceviri' || f.id === 'eisenhower') continue; // sabit adlarla kayıtlı (eski sürüm), ayrıca aşağıda
      assert.ok(text.includes(`'${name}'`), `kaynakta yok: ${f.id}.${kind} ${name}`);
    }
  }
  // Eski (taşınmış) eklenti kimlikleri birleşik kaynakta kayıt adı olarak kalmamalı.
  for (const old of ["'remnote-todo-alarm-local-dev.open'", "'pdf-dark-open'", "'mydrive.upload.command'", "registerCSS('noBullet'", "'pdf-dark-display'", "'mydrive-file'"]) {
    assert.ok(!text.includes(old), `eski ad kaldı: ${old}`);
  }
});

test('pazar yeri manifesti onaylı ilan kimliğini ve telefon iznini taşır', () => {
  const mk = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'manifest.marketplace.json'), 'utf8'));
  const local = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'manifest.json'), 'utf8'));
  assert.equal(mk.id, 'remnote-mcp-bridge-y-edition-dev');
  assert.equal(mk.enableOnMobile, true);
  assert.equal(mk.requestNative, false);
  assert.deepEqual(mk.version, { major: 2, minor: 61, patch: 0 });
  assert.deepEqual(mk.requiredScopes, local.requiredScopes);
  assert.equal(local.id, 'remnote-mcp-bridge-y-edition-dev-2');
  assert.ok(fs.existsSync(path.join(__dirname, 'public', 'logo.png')));
});

test('kaynakta kişisel kimlik yok (Eisenhower belgesi ve 4 etiketi, MyDrive klasörü); değerler yalnız local-defaults.json içinde', () => {
  const hits = [];
  // Aranacak değerler depoya girmeyen local-defaults.json'dan okunur; dosya yoksa (başka makine) tarama atlanır.
  const ldPath = path.join(__dirname, 'local-defaults.json');
  const ld = fs.existsSync(ldPath) ? JSON.parse(fs.readFileSync(ldPath, 'utf8')) : {};
  const secretIds = [ld.eisenhowerDocId, ld.mydriveFolderId, ...Object.values(ld.eisenhowerTagIds || {})].filter((x) => typeof x === 'string' && x.length > 5);
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx|cjs|js|json|css)$/.test(e.name)) { const s = fs.readFileSync(p, 'utf8'); if (secretIds.some((id) => s.includes(id))) hits.push(p); } } };
  walk(path.join(__dirname, 'src'));
  walk(path.join(__dirname, 'public'));
  assert.deepEqual(hits, []);
  const cfg = fs.readFileSync(path.join(__dirname, 'webpack.config.js'), 'utf8');
  assert.match(cfg, /REMNOTE_BUILD_TARGET === 'marketplace'\) return null/);
  assert.match(cfg, /endsWith\('-dev-2'\)/);
});
