'use strict';
// read_subtree_raw / core.readTreeRaw: whole subtree with raw rich text in one call.
// Parity: the parish card captured row by row with debug_rem_raw_text
// (C:\PS6\docs\project_notes\remnote-kelime-sablonu-parish-ham-20261116b.json)
// is rebuilt as an in-memory RemNote; the one-call reader must give back the
// same rows (remId, depth, raw text, back text) in the same order.
// Note: this proves the walk and the untouched pass-through of raw text; it is
// not a live comparison against RemNote.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');

function load(entry) {
  const bundle = buildSync({
    entryPoints: [path.join(__dirname, 'src', 'core', entry)],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['@remnote/plugin-sdk'], loader: { '.json': 'json' },
  }).outputFiles[0].text;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', bundle)(mod, mod.exports, require);
  return mod.exports;
}
const { readSubtreeRaw } = load('subtree-raw.ts');
const { CoreExecutor } = load('executor.ts');

const EVIDENCE = process.env.PARISH_EVIDENCE
  || 'C:\\PS6\\docs\\project_notes\\remnote-kelime-sablonu-parish-ham-20261116b.json';
const PARISH_ROOT = 'e1ANVvM3ZDMPAKSqM';

// rows: [{remId, depth, raw, back}] in pre-order. Parent and sibling order
// follow from the depth sequence.
function fromRows(rows, { asyncText = false } = {}) {
  const store = new Map();
  const stack = [];
  const expected = [];
  for (const row of rows) {
    stack.length = row.depth;
    const parentId = row.depth === 0 ? null : stack[row.depth - 1];
    const siblings = parentId ? store.get(parentId).children : [];
    expected.push({ remId: row.remId, parentId, depth: row.depth, order: parentId ? siblings.length : 0 });
    if (parentId) siblings.push(row.remId);
    store.set(row.remId, { text: row.raw, backText: row.back === null ? undefined : row.back, children: [] });
    stack[row.depth] = row.remId;
  }
  let calls = 0;
  class Rem {
    constructor(id) { this._id = id; }
    get text() { const t = store.get(this._id).text; return asyncText ? Promise.resolve(t) : t; }
    get backText() { return store.get(this._id).backText; }
    async getChildrenRem() { calls += 1; return store.get(this._id).children.map((c) => new Rem(c)); }
    async getParentRem() { return undefined; }
  }
  const plugin = {
    rem: { findOne: async (id) => (store.has(id) ? new Rem(id) : undefined) },
    card: { findOne: async () => undefined },
    richText: { toMarkdown: async () => '' },
  };
  return { plugin, store, expected, calls: () => calls };
}

const parishRows = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'));

test('parish card: one call gives the same 38 rows as the per-Rem debug_rem_raw_text walk', async () => {
  assert.equal(parishRows.length, 38);
  assert.equal(parishRows[0].remId, PARISH_ROOT);
  const { plugin, expected } = fromRows(parishRows);
  const out = await readSubtreeRaw(plugin, PARISH_ROOT, {});
  assert.equal(out.readOnly, true);
  assert.equal(out.truncated, false);
  assert.equal(out.count, 38);
  assert.deepEqual(out.nodes.map((n) => n.remId), parishRows.map((r) => r.remId), 'same order');
  out.nodes.forEach((n, i) => {
    const row = parishRows[i];
    assert.equal(n.depth, row.depth, `depth ${row.remId}`);
    assert.deepEqual(n.rawText, row.raw, `rawText ${row.remId}`);
    assert.deepEqual(n.backText, row.back, `backText ${row.remId}`);
    assert.equal(n.parentId, expected[i].parentId, `parentId ${row.remId}`);
    assert.equal(n.order, expected[i].order, `order ${row.remId}`);
  });
  // Formatting survives untouched (bold + red colour inside the sentence row).
  const sentence = out.nodes.find((n) => n.remId === 'TqUpOPKW8qW3553IF');
  assert.deepEqual(sentence.rawText[1], { i: 'm', text: 'KÖYÜN', b: true, tc: 3 });
});

test('rich text given as a promise is awaited like debug_rem_raw_text does', async () => {
  const { plugin } = fromRows(parishRows, { asyncText: true });
  const out = await readSubtreeRaw(plugin, PARISH_ROOT, {});
  assert.deepEqual(out.nodes.map((n) => n.rawText), parishRows.map((r) => r.raw));
});

test('back text is returned raw; missing back text is null', async () => {
  const rows = [
    { remId: 'root000001', depth: 0, raw: ['word'], back: null },
    { remId: 'card000001', depth: 1, raw: ['front'], back: [{ i: 'm', text: 'arka', l: true, tc: '#acbfc5' }] },
  ];
  const { plugin } = fromRows(rows);
  const out = await readSubtreeRaw(plugin, 'root000001', {});
  assert.equal(out.nodes[0].backText, null);
  assert.deepEqual(out.nodes[1].backText, rows[1].back);
});

test('undefined fields inside rich text: both paths give the same JSON (no stray nulls)', async () => {
  const rows = [
    { remId: 'root000002', depth: 0, raw: [{ i: 'm', text: 'x', b: true, tc: undefined, l: undefined }, 'y'], back: [{ i: 'm', text: 'z', h: undefined }] },
  ];
  const { plugin } = fromRows(rows);
  const direct = await readSubtreeRaw(plugin, 'root000002', {});
  assert.deepEqual(direct.nodes[0].rawText, [{ i: 'm', text: 'x', b: true }, 'y']);
  assert.deepEqual(direct.nodes[0].backText, [{ i: 'm', text: 'z' }]);
  const ex = new CoreExecutor(plugin);
  const viaCore = await ex.handle('core.execute', { op: { target: 'core', method: 'readTreeRaw', args: ['root000002'] }, approved: false });
  assert.deepEqual(viaCore.result.nodes, direct.nodes);
});

test('maxDepth stops the walk and marks truncated', async () => {
  const { plugin } = fromRows(parishRows);
  const out = await readSubtreeRaw(plugin, PARISH_ROOT, { maxDepth: 1 });
  assert.ok(out.nodes.every((n) => n.depth <= 1));
  assert.deepEqual(out.nodes.map((n) => n.remId), parishRows.filter((r) => r.depth <= 1).map((r) => r.remId));
  assert.equal(out.truncated, true);
  assert.deepEqual(out.truncatedBy, ['maxDepth']);
  const full = await readSubtreeRaw(plugin, PARISH_ROOT, { maxDepth: 10 });
  assert.equal(full.truncated, false);
});

test('maxNodes caps the list, keeps document order and marks truncated', async () => {
  const { plugin } = fromRows(parishRows);
  const out = await readSubtreeRaw(plugin, PARISH_ROOT, { maxNodes: 5 });
  assert.equal(out.count, 5);
  assert.equal(out.truncated, true);
  assert.ok(out.truncatedBy.includes('maxNodes'));
  // Every returned row's parent is also returned, and order is pre-order.
  const ids = new Set(out.nodes.map((n) => n.remId));
  assert.ok(out.nodes.every((n) => n.parentId === null || ids.has(n.parentId)));
  const fullOrder = parishRows.map((r) => r.remId).filter((id) => ids.has(id));
  assert.deepEqual(out.nodes.map((n) => n.remId), fullOrder);
});

test('bad input: missing remId and unknown Rem are refused; limits are clamped', async () => {
  const { plugin } = fromRows(parishRows);
  await assert.rejects(readSubtreeRaw(plugin, '', {}), (e) => e.code === 'BAD_ARGUMENT');
  await assert.rejects(readSubtreeRaw(plugin, 'nope000000000', {}), (e) => e.code === 'NOT_FOUND');
  const out = await readSubtreeRaw(plugin, PARISH_ROOT, { maxDepth: 999, maxNodes: 999999 });
  assert.equal(out.maxDepth, 50);
  assert.equal(out.maxNodes, 2000);
  const defaults = await readSubtreeRaw(plugin, PARISH_ROOT);
  assert.equal(defaults.maxDepth, 10);
  assert.equal(defaults.maxNodes, 2000);
});

test('control core: readTreeRaw is a read method and returns the same rows over core.execute', async () => {
  const { plugin } = fromRows(parishRows);
  const ex = new CoreExecutor(plugin);
  const info = ex.describe().targets['ns:core'].methods.readTreeRaw;
  assert.ok(info, 'readTreeRaw is registered');
  assert.equal(info.class, 'read');
  assert.equal(ex.classOf({ target: 'core', method: 'readTreeRaw', args: [PARISH_ROOT] }), 'read');
  const reply = await ex.handle('core.execute', { op: { target: 'core', method: 'readTreeRaw', args: [PARISH_ROOT, 10, 2000] }, approved: false });
  // Reads report no capture/journal fields.
  assert.equal(reply.after, undefined);
  const out = reply.result;
  assert.equal(out.count, 38);
  assert.deepEqual(out.nodes.map((n) => n.rawText), parishRows.map((r) => r.raw));
  assert.deepEqual(out.nodes.map((n) => n.backText), parishRows.map((r) => r.back));
  // JSON round trip (what the link sends) keeps it identical.
  assert.deepEqual(JSON.parse(JSON.stringify(out)).nodes.map((n) => n.rawText), parishRows.map((r) => r.raw));
  await assert.rejects(
    ex.handle('core.execute', { op: { target: 'core', method: 'readTreeRaw', args: ['nope000000000'] }, approved: false }),
    (e) => e.code === 'NOT_FOUND'
  );
});
