'use strict';
// Eisenhower panosu yazma yolu: sahte SDK nesnesiyle RemNote'a giden
// çağrıların sırası ve argümanları doğrulanır. Canlı RemNote'a yazmaz.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildSync } = require('esbuild');

function load() {
  const bundle = buildSync({
    entryPoints: [path.join(__dirname, 'src', 'eisenhower', 'core.ts')],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['@remnote/plugin-sdk'],
  }).outputFiles[0].text;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', bundle)(mod, mod.exports, require);
  return mod.exports;
}
const core = load();
const { groupTasks, leadingEmoji, QUADRANTS, EISENHOWER_DOC_STORAGE_KEY, EISENHOWER_TAGS_STORAGE_KEY, resolveQuadrants, moveTask, completeTask, addTask, loadBoard, richTextHasImage, plainFromRichText } = core;
// Pano belgesi artık kullanıcı seçimi; testte sahte bir kimlik.
const TODO_DOC_ID = 'DOC_TODO_TEST';
// Etiket kimlikleri artık kodda yok; testte sahte kimlikler ve çözülmüş kutular.
const CRIT = 'TAG_CRIT', HIGH = 'TAG_HIGH', MED = 'TAG_MED', LOW = 'TAG_LOW';
const Q = QUADRANTS.map((q, i) => ({ ...q, tagId: [CRIT, HIGH, MED, LOW][i] }));

function fakeApi(opts = {}) {
  const calls = [];
  const rems = new Map();
  function mkRem(id, extra = {}) {
    const r = {
      _id: id, text: extra.text || ['x'], _todo: extra.todo, _status: extra.status, _parent: extra.parent,
      _doc: !!extra.doc, _tagged: extra.tagged || [],
      async addTag(t) { calls.push(['addTag', id, t]); if (opts.failAdd) throw new Error('addTag fail'); },
      async removeTag(t, p) { calls.push(['removeTag', id, t, p]); if (opts.failRemove && t === opts.failRemove) throw new Error('removeTag fail'); },
      async isTodo() { calls.push(['isTodo', id]); return !!r._todo; },
      async setIsTodo(v) { calls.push(['setIsTodo', id, v]); r._todo = v; },
      async getTodoStatus() { return r._todo ? r._status : undefined; },
      async setTodoStatus(s) { calls.push(['setTodoStatus', id, s]); if (opts.failStatus) throw new Error('status fail'); r._status = s; },
      async setText(t) { calls.push(['setText', id, t]); },
      async setParent(p) { calls.push(['setParent', id, p]); },
      async getParentRem() { return r._parent ? rems.get(r._parent) : undefined; },
      async isDocument() { return r._doc; },
      async taggedRem() { return r._tagged.map((x) => rems.get(x)); },
      async getChildrenRem() { calls.push(['getChildrenRem', id]); return (extra.kids || []).map((x) => rems.get(x)); },
      _icon: extra.icon,
      children: extra.kids || [],
    };
    rems.set(id, r);
    return r;
  }
  const api = {
    calls, rems, mkRem,
    async findOne(id) { return rems.get(id); },
    async createRem() { calls.push(['createRem']); return mkRem('NEW1'); },
    async toString(rt) { return rt.filter((x) => typeof x === 'string').join(''); },
    async docIcon(rem) { return rem._icon || ''; },
  };
  return api;
}

test('dört kutu doğru etiket ve sırada', () => {
  assert.equal(EISENHOWER_DOC_STORAGE_KEY, 'eisenhower_doc_id');
  assert.deepEqual(QUADRANTS.map((q) => q.tagId), ['', '', '', '']);
  assert.deepEqual(QUADRANTS.map((q) => q.tagName), ['Critical', 'High', 'Medium', 'Low']);
  assert.equal(EISENHOWER_TAGS_STORAGE_KEY, 'eisenhower_tag_ids');
  assert.deepEqual(QUADRANTS.map((q) => q.roman), ['I', 'II', 'III', 'IV']);
});

test('taşıma: önce yeni etiket eklenir, sonra eski etiket özellikleri korunarak kaldırılır', async () => {
  const api = fakeApi(); api.mkRem('T1');
  const r = await moveTask(api, 'T1', HIGH, CRIT);
  assert.equal(r, 'moved');
  assert.deepEqual(api.calls, [['addTag', 'T1', CRIT], ['removeTag', 'T1', HIGH, false]]);
});

test('aynı kutuya bırakma hiçbir şey yazmaz', async () => {
  const api = fakeApi(); api.mkRem('T1');
  assert.equal(await moveTask(api, 'T1', MED, MED), 'noop');
  assert.deepEqual(api.calls, []);
});

test('taşımada eski etiket kaldırılamazsa yeni etiket geri alınır ve hata fırlar', async () => {
  const api = fakeApi({ failRemove: HIGH }); api.mkRem('T1');
  await assert.rejects(moveTask(api, 'T1', HIGH, LOW));
  assert.deepEqual(api.calls, [['addTag', 'T1', LOW], ['removeTag', 'T1', HIGH, false], ['removeTag', 'T1', LOW, false]]);
});

test('tamamlama: todo değilse önce todo yapılır, sonra Finished', async () => {
  const api = fakeApi(); api.mkRem('T1', { todo: false });
  await completeTask(api, 'T1');
  assert.deepEqual(api.calls, [['isTodo', 'T1'], ['setIsTodo', 'T1', true], ['setTodoStatus', 'T1', 'Finished']]);
});

test('tamamlama: zaten todo ise yalnız Finished; silme çağrısı yok', async () => {
  const api = fakeApi(); api.mkRem('T1', { todo: true, status: 'Unfinished' });
  await completeTask(api, 'T1');
  assert.deepEqual(api.calls, [['isTodo', 'T1'], ['setTodoStatus', 'T1', 'Finished']]);
  assert.ok(!api.calls.some((c) => /remove$|delete/i.test(c[0])));
});

test('tamamlama hatasında todo yapılan rem eski haline döner', async () => {
  const api = fakeApi({ failStatus: true }); api.mkRem('T1', { todo: false });
  await assert.rejects(completeTask(api, 'T1'));
  assert.deepEqual(api.calls.at(-1), ['setIsTodo', 'T1', false]);
});

test('görev ekleme: oluştur, metin, To-Do List altına, kutu etiketi', async () => {
  const api = fakeApi();
  const id = await addTask(api, '  Yeni iş  ', MED, TODO_DOC_ID);
  assert.equal(id, 'NEW1');
  assert.deepEqual(api.calls, [['createRem'], ['setText', 'NEW1', ['Yeni iş']], ['setParent', 'NEW1', TODO_DOC_ID], ['addTag', 'NEW1', MED]]);
});

test('boş metinle görev eklenmez', async () => {
  const api = fakeApi();
  await assert.rejects(addTask(api, '   ', MED, TODO_DOC_ID));
  await assert.rejects(addTask(api, 'iş', MED, ''));
  assert.deepEqual(api.calls, []);
});

test('pano: tamamlananlar gizlenir, görsel işareti ve kaynak belge adı', async () => {
  const api = fakeApi();
  api.mkRem(TODO_DOC_ID, { text: ['To-Do List'], doc: true });
  api.mkRem('A', { text: ['Workbench göstergeleri'], parent: TODO_DOC_ID });
  api.mkRem('B', { text: ['bunu daha estetik ', { i: 'i', url: 'x.png' }], parent: TODO_DOC_ID });
  api.mkRem('C', { text: ['bitti'], todo: true, status: 'Finished', parent: TODO_DOC_ID });
  api.mkRem(CRIT, { tagged: [] });
  api.mkRem(HIGH, { tagged: ['A', 'C'] });
  api.mkRem(MED, { tagged: ['B'] });
  api.mkRem(LOW, {});
  const board = await loadBoard(api, Q);
  assert.deepEqual(board.map((q) => q.tasks.map((t) => t.id)), [[], ['A'], ['B'], []]);
  assert.equal(board[1].tasks[0].source, 'To-Do List');
  assert.equal(board[2].tasks[0].hasImage, true);
  assert.equal(board[2].tasks[0].text, 'bunu daha estetik');
});

test('zengin metin yardımcıları', () => {
  assert.equal(richTextHasImage(['a', { i: 'i' }]), true);
  assert.equal(richTextHasImage(['a', { i: 'm', text: 'b' }]), false);
  assert.equal(plainFromRichText(['a', { i: 'm', text: 'b' }, { i: 'i' }]), 'ab');
});

test('pano: alt satır sayısı RemNote\'un hazır çocuk listesinden; alt ağaç okunmaz, yazma yok', async () => {
  const api = fakeApi();
  api.mkRem(TODO_DOC_ID, { text: ['To-Do List'], doc: true, icon: '🏷️' });
  api.mkRem('A', { text: ['Görev A'], parent: TODO_DOC_ID, kids: ['A1', 'A2'] });
  api.mkRem('A1', { text: ['not 1'], parent: 'A', kids: ['A11'] });
  api.mkRem('A11', { text: ['alt not'], parent: 'A1' });
  api.mkRem('A2', { text: [{ i: 'i', url: 'https://x/y.png' }], parent: 'A' });
  api.mkRem('B', { text: ['Görev B'], parent: TODO_DOC_ID });
  api.mkRem(CRIT, { tagged: ['A', 'B'] });
  api.mkRem(HIGH, {}); api.mkRem(MED, {}); api.mkRem(LOW, {});
  const board = await loadBoard(api, Q);
  const [a, b] = board[0].tasks;
  assert.equal(a.childCount, 2);
  assert.equal(b.childCount, 0);
  assert.ok(!api.calls.some((c) => c[0] === 'getChildrenRem'), 'alt ağaç RemHierarchyEditorTree\'ye bırakılır');
  assert.ok(!api.calls.some((c) => /^(add|remove|set|create)/.test(c[0])), 'okuma yazma yapmamalı');
});

test('pano: kaynak yolu ve belge ikonu', async () => {
  const api = fakeApi();
  api.mkRem('ROOT', { text: ['📈 Trading'], doc: true });
  api.mkRem('STR', { text: ['Stratejiler'], doc: true, parent: 'ROOT' });
  api.mkRem('T', { text: ['iş'], parent: 'STR' });
  api.mkRem(CRIT, { tagged: ['T'] }); api.mkRem(HIGH, {}); api.mkRem(MED, {}); api.mkRem(LOW, {});
  const t = (await loadBoard(api, Q))[0].tasks[0];
  assert.equal(t.groupId, 'STR');
  assert.deepEqual(t.path, ['Trading', 'Stratejiler']);
  assert.equal(t.icon, '📈');
});

test('gruplama: aynı belgedekiler bir başlık altında, ilk görülme sırasıyla', () => {
  const mk = (id, g) => ({ id, groupId: g, path: [g], icon: '', text: id, hasImage: false, source: g, childCount: 0 });
  const groups = groupTasks([mk('1', 'X'), mk('2', 'Y'), mk('3', 'X')]);
  assert.deepEqual(groups.map((g) => [g.id, g.tasks.map((t) => t.id)]), [['X', ['1', '3']], ['Y', ['2']]]);
});

test('baştaki emoji ayrılır', () => {
  assert.deepEqual(leadingEmoji('📈 Trading'), ['📈', 'Trading']);
  assert.deepEqual(leadingEmoji('🏷️ To-Do'), ['🏷️', 'To-Do']);
  assert.deepEqual(leadingEmoji('Düz'), ['', 'Düz']);
});

test('genişletme CSS: her kural yalnız pano iframe\'ini içeren öğeyi seçer', () => {
  const bundle = buildSync({ entryPoints: [path.join(__dirname, 'src', 'eisenhower', 'wide-css.ts')], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', bundle)(mod, mod.exports, require);
  const css = mod.exports.WIDE_CSS;
  const selectors = [...css.matchAll(/([^{}@]+)\{/g)].map((m) => m[1].trim()).filter((x) => x && !x.startsWith('container '));
  assert.ok(selectors.length >= 2);
  // Her seçici pano iframe'ini içeren öğeyle başlar (belge sarmalayıcısı ya da pano kabı).
  for (const sel of selectors.flatMap((x) => x.split(/,\s*/))) {
    assert.match(sel, /^(\.rn-document-wrapper|div\.fade-in-first-load):has\((> div > )?iframe\[src\*="widgetName=eisenhower_board"\]\)/, sel);
  }
  assert.match(css, /@container eh-doc \(min-width: 912px\)/);
});

// ---------- Etiket çözümleme (kimlik koda gömülü değil) ----------

test('etiketler: önce depodaki kimlik (Rem varsa), adla aramaya gerek kalmaz', async () => {
  const api = fakeApi();
  for (const id of [CRIT, HIGH, MED, LOW]) api.mkRem(id, {});
  const names = [];
  api.findByName = async (n) => { names.push(n); return undefined; };
  const r = await resolveQuadrants(api, { critical: CRIT, high: HIGH, medium: MED, low: LOW });
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.quadrants.map((q) => q.tagId), [CRIT, HIGH, MED, LOW]);
  assert.deepEqual(names, []);
});

test('etiketler: depoda yoksa ya da Rem silinmişse adla bulunur (büyük/küçük harf duyarsız)', async () => {
  const api = fakeApi();
  const byName = { critical: 'N_CRIT', HIGH: 'N_HIGH', Medium: 'N_MED', low: 'N_LOW' };
  for (const id of Object.values(byName)) api.mkRem(id, {});
  api.findByName = async (n) => (byName[n] ? api.rems.get(byName[n]) : undefined);
  const r = await resolveQuadrants(api, { critical: 'SILINMIS' });
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.quadrants.map((q) => q.tagId), ['N_CRIT', 'N_HIGH', 'N_MED', 'N_LOW']);
});

test('etiketler bulunamazsa eksikler listelenir; hiçbir şey oluşturulmaz ya da yazılmaz', async () => {
  const api = fakeApi();
  api.findByName = async () => undefined;
  const r = await resolveQuadrants(api, null);
  assert.deepEqual(r.missing, ['Critical', 'High', 'Medium', 'Low']);
  assert.deepEqual(r.quadrants, []);
  assert.deepEqual(api.calls, []);
});
