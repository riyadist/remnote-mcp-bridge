'use strict';
// Kanca kapisi: RemNote ceviri penceresinin urettigi kancalar da
// ContextTranslator/mnemonic_gate.py kurallarindan gecer. Gercek Python ve sozluk kullanilir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter, once } = require('node:events');
const { createHash, randomUUID } = require('node:crypto');
const WebSocket = require('ws');
const { createMnemonicGate, gateInputText } = require('./mnemonic-gate-client.cjs');

// Kirmizi kanit icin eski kopru MNEMONIC_TEST_BRIDGE_SOURCE ile verilebilir.
const source = fs.readFileSync(process.env.MNEMONIC_TEST_BRIDGE_SOURCE || path.join(__dirname, 'bridge-host.cjs'), 'utf8');
const BAD_ENACT = 'en+act = içine eylem koy = Meclis tasarıyı kanuna çeviriyor = enact; yürürlüğe koymak';
const BAD_PREDISPOSE = '“pri dis poz” = Aile hekimi kâğıda yazıyor = predispose; yatkın kılmak';
const GOOD_ENACT = '"in akit" = Meclis yeni akdi imzalayıp yasayı yürürlüğe koyuyor = enact; yürürlüğe koymak';
const GOOD_PREDISPOSE = '"priz bozuk" = Bozuk priz kıvılcım saçıyor, ev yangına yatkınlaşıyor = predispose; yatkın kılmak';

const gate = createMnemonicGate();
const deadGate = () => createMnemonicGate({ pythonPath: path.join(os.tmpdir(), 'olmayan-python.exe'), retryAfterMs: 0 });
test.after(() => gate.close());

function flashcard(front, body) {
  return {
    parentId: 'p', front, back: 'anlam', type: 'forward', tags: ['English'],
    detailToggles: [{ title: '**Detaylar**', collapsed: false, children: [
      { title: '**Etimoloji**', body: 'eski Fransızca', collapsed: false },
      { title: '**Mnemonic**', body, collapsed: false },
    ] }],
  };
}
const mnemonicRows = (payload) => payload.detailToggles[0].children.filter((row) => /mnemonic/i.test(row.title));

test('kapi kotu kancayi reddeder, iyi kancayi gecirir', async () => {
  const rows = await gate.checkMany('enact', [BAD_ENACT, GOOD_ENACT]);
  assert.equal(rows[0].ok, false, BAD_ENACT);
  assert.equal(rows[1].ok, true, JSON.stringify(rows[1]));
  const other = await gate.checkMany('predispose', [BAD_PREDISPOSE, GOOD_PREDISPOSE]);
  assert.equal(other[0].ok, false, BAD_PREDISPOSE);
  assert.equal(other[1].ok, true, JSON.stringify(other[1]));
});

test('ContextTranslator testindeki ornekler kopruden ayni sonucu verir', async () => {
  const bad = [
    ['ransom', '“rançom” = Kaçıranlar kapıya not bırakıp para istiyor = ransom; fidye'],
    ['reap', '"ripi" = Kadın orakla ürünü biçti = reap; ürününü toplamak'],
    ['stoked', '"Stokta var" = Çocuk "stokta var" diye zıplıyor = stoked; çok heyecanlı'],
    ['overrun', 'over + run = Fareler her yeri dolduruyor = overrun; istila etmek'],
    ['freeloaded', 'free + load = Sırtına bedava yükleniyor = freeloaded; bedavadan geçinmek'],
  ];
  const good = [
    ['daunting', '"dondun" = Soruları görünce kalem elinde dondun = daunting; göz korkutan'],
    ['vanity', '"Van iti" = Van iti aynaya hayran bakıyor = vanity; kendini beğenmişlik'],
    ['oppressed', 'press/basmak = ağır pres insanların üzerine iniyor = oppressed; ezilmiş'],
  ];
  for (const [word, text] of bad) assert.equal((await gate.checkMany(word, [text]))[0].ok, false, text);
  for (const [word, text] of good) assert.equal((await gate.checkMany(word, [text]))[0].ok, true, text);
});

test('Turkce harfsiz yazilan soyletme de yakalanir', async () => {
  const text = 'dondun = DONDUN yazili kart korkuyu tek resim gibi gosteriyor = daunting; göz korkutan';
  const row = (await gate.checkMany('daunting', [text]))[0];
  assert.equal(row.ok, false);
  assert.ok(row.reasons.includes('kanca_sahnede_soyletiliyor'), JSON.stringify(row));
});

test('kanca kapiya degismeden gider, yalniz sahne duzeltilir', () => {
  const sent = gateInputText('word', 'yazi bagir fisilda = yazili kart = word; anlam');
  assert.equal(sent, 'yazi bagir fisilda = yazıli kart = word; anlam');
});

test('sozluk yoksa kapi kapali kalir: aday yok, ceviriden kanca silinir, kancali kart yazilmaz', async () => {
  const dead = deadGate();
  await assert.rejects(dead.filterCandidates('enact', [GOOD_ENACT]), { code: 'MNEMONIC_GATE_UNAVAILABLE' });
  await assert.rejects(dead.enforceCardWrite(flashcard('enact', GOOD_ENACT)), { code: 'MNEMONIC_GATE_UNAVAILABLE' });
  const stripped = await dead.sanitizeTranslationResult('enact', {
    translation: 'yürürlüğe koymak', mnemonic: GOOD_ENACT,
    translationSections: [{ key: 'directTranslation', value: 'x' }, { key: 'mnemonic', value: GOOD_ENACT }],
  });
  assert.equal(stripped.mnemonic, '');
  assert.deepEqual(stripped.translationSections.map((row) => row.key), ['directTranslation']);
  assert.equal(stripped.mnemonicGate.status, 'unavailable');
  const plain = await dead.enforceCardWrite({ front: 'enact', back: 'x', detailToggles: [] });
  assert.deepEqual(plain.removed, [], 'kancasiz kart icin sozluk gerekmez');
});

test('ceviri sonucundaki kotu kanca silinir, iyi kanca kalir', async () => {
  const shape = (mnemonic) => ({ translation: 't', mnemonic, translationSections: [{ key: 'mnemonic', label: 'Mnemonic', value: mnemonic }] });
  const bad = await gate.sanitizeTranslationResult('enact', shape(BAD_ENACT));
  assert.equal(bad.mnemonic, '');
  assert.equal(bad.translationSections.length, 0);
  assert.equal(bad.translation, 't');
  const good = await gate.sanitizeTranslationResult('enact', shape(GOOD_ENACT));
  assert.equal(good.mnemonic, GOOD_ENACT);
  assert.equal(good.translationSections.length, 1);
});

test('kart yazimi: kotu kanca bolumu cikar, kartin geri kalani durur', async () => {
  const bad = await gate.enforceCardWrite(flashcard('enact', BAD_ENACT));
  assert.equal(mnemonicRows(bad.payload).length, 0);
  assert.equal(bad.payload.detailToggles[0].children.length, 1);
  assert.equal(bad.removed.length, 1);
  const good = await gate.enforceCardWrite(flashcard('enact', GOOD_ENACT));
  assert.equal(mnemonicRows(good.payload).length, 1);
  assert.deepEqual(good.removed, []);
});

test('ContextTranslator kart bicimi (renkli kanca, kelimesiz kuyruk) iyi kancayi silmez', async () => {
  const body = '[[Yellow:"priz bozuk"]] = *Bozuk priz kıvılcım saçıyor, ev yangına yatkınlaşıyor*; yatkın kılmak';
  const good = await gate.enforceCardWrite(flashcard('predispose', body));
  assert.deepEqual(good.removed, []);
  const badBody = '[[Yellow:"pri dis poz"]] = *Aile hekimi kâğıda yazıyor*; yatkın kılmak';
  const bad = await gate.enforceCardWrite(flashcard('predispose', badBody));
  assert.equal(bad.removed.length, 1);
});

test('kapi cokerse yeniden baslar', async () => {
  const local = createMnemonicGate();
  try {
    assert.equal((await local.checkMany('enact', [GOOD_ENACT]))[0].ok, true);
    await local.killWorkerForTest();
    assert.equal((await local.checkMany('enact', [GOOD_ENACT]))[0].ok, true);
  } finally { local.close(); }
});

function mnemonicFixture(modelCandidates, activeGate = gate) {
  const constants = source.slice(source.indexOf('const TRANSLATE_MNEMONIC_CANDIDATE_LIMIT ='), source.indexOf('const TRANSLATE_IMAGE_CANDIDATE_LIMIT ='));
  const helpers = source.slice(source.indexOf('function translationTargetFromPayload('), source.indexOf('function normalizeSearchTerm('));
  const runner = source.slice(source.indexOf('function runCodexTranslation('), source.indexOf('function shouldRetryCodexTranslation('));
  const files = new Map();
  const context = vm.createContext({modelRoute:{run:(primary)=>primary()},
    require, process: { env: {} }, Buffer, path, os, randomUUID, createHash, setTimeout, clearTimeout,
    TRANSLATE_SELECTION_MODEL: 'fixture', TRANSLATE_SELECTION_TIMEOUT_MS: 45000, CODEX_DISABLED_FEATURES: [],
    translationFormat: require('./translate-selection-format.cjs'), mnemonicGate: activeGate,
    translateMnemonicCache: new Map(), translateMnemonicInFlight: new Map(), translateMnemonicCacheRoot: 'fixture-cache',
    compactText: (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n),
    startTranslateStage: () => ({}), finishTranslateStage: () => {}, getTraceTextMeta: () => ({}),
    classifyTranslateError: () => ({ errorClass: 'ERROR' }), createTranslateTraceId: () => 'fixture', writeTranslateTrace: () => {},
    resolveCodexExecutable: () => 'fixture-codex.exe',
    fs: { existsSync: (p) => files.has(p), readFileSync: (p) => files.get(p), rmSync: (p) => files.delete(p), mkdirSync: () => {}, writeFileSync: (p, v) => files.set(p, v), readdirSync: () => [] },
    spawn: (_exe, args) => {
      const out = args[args.indexOf('--output-last-message') + 1];
      const child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
      child.stdin = { write: () => {}, end: () => queueMicrotask(() => {
        if (modelCandidates === 'MODEL_DUSTU') { child.stderr.emit('data', Buffer.from('uzun ham codex gunlugu')); child.emit('close', 1); return; }
        files.set(out, JSON.stringify({ candidates: modelCandidates }));
        child.emit('close', 0);
      }) };
      return child;
    },
  });
  vm.runInContext(`${constants}\n${runner}\n${helpers}\nglobalThis.generate=getTranslateMnemonicCandidates;`, context);
  return context.generate;
}

async function assertAllPass(word, candidates) {
  const failed = (await gate.checkMany(word, Array.from(candidates))).filter((row) => !row.ok);
  assert.equal(failed.length, 0, `pencereye kapidan gecmeyen aday geldi: ${JSON.stringify(failed.map((row) => [row.text, row.reasons]))}`);
}

test('aday hatti: kotu kanca da acil dolgu da pencereye gelmez', async () => {
  const generate = mnemonicFixture([BAD_ENACT, GOOD_ENACT]);
  const result = await generate({ selectedText: 'enact', contextText: 'They enact the law.', result: { directTranslation: 'yürürlüğe koymak', contextualMeaning: 'yasayı yürürlüğe koymak' } });
  assert.ok(result.candidates.some((text) => /in akit/.test(text)), JSON.stringify(result.candidates));
  await assertAllPass('enact', result.candidates);
  assert.ok(!result.candidates.some((text) => /alarmi calinca|dugmesine basinca|kapisi acilinca/.test(text)), JSON.stringify(result.candidates));
});

test('aday hatti: hepsi kotuyse uc aday tamamlanmaz', async () => {
  const generate = mnemonicFixture([BAD_PREDISPOSE]);
  const result = await generate({ selectedText: 'predispose', contextText: 'Genes predispose people.', result: { directTranslation: 'yatkın kılmak', contextualMeaning: 'yatkın kılmak' } });
  await assertAllPass('predispose', result.candidates);
});

test('aday hatti: sozluk yoksa aday uretilmez', async () => {
  const generate = mnemonicFixture([GOOD_ENACT], deadGate());
  await assert.rejects(generate({ selectedText: 'enact', contextText: 'They enact the law.', result: { directTranslation: 'yürürlüğe koymak' } }), { code: 'MNEMONIC_GATE_UNAVAILABLE' });
});

test('aday hatti: model duser ve gecen aday yoksa kisa hata verir, dolgu uretmez', async () => {
  const generate = mnemonicFixture('MODEL_DUSTU');
  await assert.rejects(
    generate({ selectedText: 'predispose', contextText: 'Genes predispose people.', result: { directTranslation: 'yatkın kılmak' } }),
    (error) => error.message === 'Mnemonic modeli yanit vermedi ve kapidan gecen hazir aday yok.'
  );
});

test('kopru baglantisi: butun cikis noktalari kapidan gecer', () => {
  assert.doesNotMatch(source, /buildEmergencyVisibleMnemonicCandidates/, 'ham parca dolgusu kalkmali');
  assert.match(source, /TRANSLATE_MNEMONIC_CACHE_VERSION\s*=\s*6/, 'eski kotu onbellek gecersiz olmali');
  assert.match(source, /require\('\.\/mnemonic-gate-client\.cjs'\)/);
  const routes = [
    "translateSelectionProgressive\\(payload, 'core'\\)",
    "translateSelectionProgressive\\(payload, 'details'\\)",
    'translateSelection\\(\\{ \\.\\.\\.payload, quick: true \\}\\)',
    'translateSelection\\(payload\\)',
  ];
  for (const route of routes) assert.match(source, new RegExp(`gateTranslationResult\\(payload, ${route}\\)`), route);
  assert.match(source, /sanitizeCandidateResponse\([^\n]*getTranslateMnemonicCandidates\(payload\)/);
});

async function freePort() {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function bridgeFixture(t, activeGate) {
  const HTTP_PORT = await freePort();
  const WS_PORT = await freePort();
  const code = source.slice(source.indexOf('function sendJson('));
  const c = { http, WebSocket, URL, JSON, Map, Set, Array, Error, Promise, Buffer, setTimeout, clearTimeout, setInterval, clearInterval,
    console: { log() {}, warn() {} }, process: { on() {} }, HTTP_PORT, WS_PORT, REQUEST_TIMEOUT_MS: 3000, startedAt: 'test',
    clients: new Map(), pending: new Map(), sseClients: new Set(), stats: {}, recentActions: [], HOST_ACTIONS: new Set(), mnemonicGate: activeGate,
    handleHostAction: async () => ({}), randomUUID, createBridgeTransport: require('./bridge-transport.cjs').createBridgeTransport,
    evaluateBridgeRequest: require('./bridge-request-policy.cjs').evaluateBridgeRequest, verifyPluginKey: () => false,
    recordAction() {}, broadcastEvent() {}, getRuntimeStatus: () => ({}), getTranslateDebugSnapshot: () => ({}), warmCodexTranslationModelAsync() {}, warmTopicChatModelAsync() {} };
  vm.runInNewContext(`${code}\nthis.servers={httpServer,wsServer,transport:typeof bridgeTransport==='undefined'?null:bridgeTransport};`, c);
  await Promise.all([
    c.servers.httpServer.listening ? null : once(c.servers.httpServer, 'listening'),
    c.servers.wsServer.address() ? null : once(c.servers.wsServer, 'listening'),
  ]);
  t.after(async () => {
    c.servers.transport?.dispose();
    for (const client of c.servers.wsServer.clients) client.terminate();
    await Promise.all([new Promise((r) => c.servers.httpServer.close(r)), new Promise((r) => c.servers.wsServer.close(r))]);
  });
  const received = [];
  const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`, { origin: 'http://localhost:8080' });
  t.after(() => ws.terminate());
  ws.on('message', (raw) => {
    const message = JSON.parse(raw);
    if (message.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    else if (message.action) {
      received.push(message);
      ws.send(JSON.stringify({ id: message.id, result: { remId: 'yeni' } }));
    }
  });
  await once(ws, 'open');
  await new Promise((resolve) => setTimeout(resolve, 40));
  const call = async (payload) => {
    const response = await fetch(`http://127.0.0.1:${HTTP_PORT}/call`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_flashcard', payload }),
    });
    return { status: response.status, body: await response.json() };
  };
  return { call, received };
}

test('gercek /call yolu: kotu kanca eklentiye ulasmaz', async (t) => {
  const f = await bridgeFixture(t, gate);
  const bad = await f.call(flashcard('enact', BAD_ENACT));
  assert.equal(bad.status, 200, JSON.stringify(bad.body));
  assert.equal(mnemonicRows(f.received[0].payload).length, 0);
  assert.equal(bad.body.result.mnemonicGate.removed.length, 1);
  const good = await f.call(flashcard('enact', GOOD_ENACT));
  assert.equal(good.status, 200);
  assert.equal(mnemonicRows(f.received[1].payload).length, 1);
});

test('gercek /call yolu: sozluk yoksa kancali kart eklentiye gitmez', async (t) => {
  const f = await bridgeFixture(t, deadGate());
  const blocked = await f.call(flashcard('enact', GOOD_ENACT));
  assert.equal(blocked.status, 503);
  assert.equal(blocked.body.code, 'MNEMONIC_GATE_UNAVAILABLE');
  assert.equal(f.received.length, 0);
});
