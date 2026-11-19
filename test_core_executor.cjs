'use strict';
// Behaviour tests for the control core executor against an in-memory RemNote model.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildSync } = require('esbuild');

const bundle = buildSync({
  entryPoints: [path.join(__dirname, 'src', 'core', 'executor.ts')],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['@remnote/plugin-sdk'], loader: { '.json': 'json' },
}).outputFiles[0].text;
const mod = { exports: {} };
new Function('module', 'exports', 'require', bundle)(mod, mod.exports, require);
const { CoreExecutor } = mod.exports;

function makeRemNote() {
  const store = new Map();
  let next = 1;
  const rootOrder = [];
  const childrenOf = (id) => (id === null ? rootOrder : store.get(id).children);
  const add = (text, parentId = null, extra = {}) => {
    const id = `rem${String(next++).padStart(6, '0')}`;
    store.set(id, { id, text: [text], backText: undefined, parentId, children: [], tags: [], isDocument: false, ...extra });
    childrenOf(parentId).push(id);
    return id;
  };
  const detach = (id) => {
    const list = childrenOf(store.get(id).parentId);
    list.splice(list.indexOf(id), 1);
  };
  const flags = { brokenDescendants: false };
  class Rem {
    constructor(id) { this._id = id; }
    get d() { const d = store.get(this._id); if (!d) throw new Error(`gone ${this._id}`); return d; }
    get text() { return this.d.text; }
    get backText() { return this.d.backText; }
    async getChildrenRem() { return this.d.children.map((c) => new Rem(c)); }
    async getParentRem() { return this.d.parentId ? new Rem(this.d.parentId) : undefined; }
    async getTagRems() { return this.d.tags.map((t) => new Rem(t)); }
    async positionAmongstSiblings() { return childrenOf(this.d.parentId).indexOf(this._id); }
    async isDocument() { return this.d.isDocument; }
    async setIsDocument(v) { this.d.isDocument = v; }
    async getType() { return 'concept'; }
    async setText(t) { this.d.text = t; }
    // Like RemNote: the back text parameter is required (undefined is refused).
    async setBackText(t) { if (t === undefined) throw new Error('backText parameter: Required'); this.d.backText = t; }
    async addTag(t) { const id = typeof t === 'string' ? t : t._id; if (!this.d.tags.includes(id)) this.d.tags.push(id); }
    async removeTag(id) { this.d.tags = this.d.tags.filter((x) => x !== id); }
    async setParent(parent, position) {
      const pid = parent === null ? null : (typeof parent === 'string' ? parent : parent._id);
      detach(this._id);
      this.d.parentId = pid;
      const list = childrenOf(pid);
      list.splice(position === undefined ? list.length : position, 0, this._id);
    }
    async getDescendants() {
      if (flags.brokenDescendants) throw new Error('SDK hiccup');
      const out = [];
      const walk = (id) => store.get(id).children.forEach((c) => { out.push(new Rem(c)); walk(c); });
      walk(this._id);
      return out;
    }
    async remove() {
      const kill = (id) => { store.get(id).children.slice().forEach(kill); store.delete(id); };
      detach(this._id);
      kill(this._id);
    }
    // merge(otherId): moves the other Rem's children here and deletes it.
    async merge(otherId) {
      const other = new Rem(otherId);
      for (const c of other.d.children.slice()) await new Rem(c).setParent(this._id);
      await other.remove();
    }
  }
  const plugin = {
    rem: {
      findOne: async (id) => (store.has(id) ? new Rem(id) : undefined),
      createRem: async () => new Rem(add('')),
      createTreeWithMarkdown: async (md, parentId) => md.split('\n').filter(Boolean).map((line) => new Rem(add(line.replace(/^[-*]\s*/, ''), parentId))),
    },
    card: { findOne: async () => undefined },
    richText: { toMarkdown: async (rt) => rt.join(''), parseFromMarkdown: async (md) => [md] },
    search: { search: async () => [] },
    storage: { getLocal: async () => 'secret' },
  };
  return { plugin, store, add, Rem, flags };
}

async function change(ex, op, approved = false) {
  const { before } = await ex.capture(op);
  const out = await ex.execute(op, approved);
  return { before, ...out };
}

test('registry: classes, undo coverage and argument rules are present', () => {
  const { plugin } = makeRemNote();
  const ex = new CoreExecutor(plugin);
  const d = ex.describe();
  assert.equal(d.targets['ns:storage'].methods.getLocal.class, 'blocked');
  assert.equal(d.targets['obj:rem'].methods.remove.class, 'destructive');
  assert.equal(d.targets['obj:rem'].methods.merge.undo, 'none');
  assert.equal(d.targets['ns:editor'].methods.delete.class, 'destructive', 'non-undoable writes need approval');
  assert.equal(d.targets['obj:rem'].methods.setText.class, 'write');
  assert.equal(ex.classOf({ target: 'rem:x', method: 'removeTag', args: ['t'] }), 'write');
  assert.equal(ex.classOf({ target: 'rem:x', method: 'removeTag', args: ['t', true] }), 'destructive');
  assert.equal(ex.classOf({ target: 'rem:x', method: 'removeTag', args: ['t', 1] }), 'destructive', 'any truthy value counts');
  assert.equal(ex.classOf({ target: 'rem:x', method: 'removeTag', args: ['t', 0] }), 'write');
  assert.throws(() => ex.classOf({ target: 'rem:x', method: 'constructor' }), (e) => e.code === 'UNKNOWN_METHOD');
  for (const t of Object.values(d.targets)) for (const m of Object.values(t.methods)) {
    assert.ok(['read', 'ui', 'write', 'destructive', 'blocked'].includes(m.class));
    if (m.class === 'write') assert.ok(['full', 'partial'].includes(m.undo), 'every plain write is undoable');
  }
});

test('blocked, unknown, and batches containing them are refused before anything runs', async () => {
  const { plugin, store, add } = makeRemNote();
  const a = add('keep');
  const ex = new CoreExecutor(plugin);
  await assert.rejects(ex.execute({ target: 'storage', method: 'getLocal', args: ['k'] }, false), (e) => e.code === 'BLOCKED');
  await assert.rejects(ex.execute({ target: 'rem', method: 'evilMethod', args: [] }, false), (e) => e.code === 'UNKNOWN_METHOD');
  await assert.rejects(ex.execute({ batch: [
    { target: `rem:${a}`, method: 'setText', args: [['changed']] },
    { target: 'storage', method: 'getLocal', args: ['k'] },
  ] }, false), (e) => e.code === 'BLOCKED');
  assert.deepEqual(store.get(a).text, ['keep'], 'first step never ran');
});

test('setText is captured before, then undone exactly', async () => {
  const { plugin, store, add } = makeRemNote();
  const a = add('old text');
  const ex = new CoreExecutor(plugin);
  const out = await change(ex, { target: `rem:${a}`, method: 'setText', args: [['new text']] });
  assert.deepEqual(out.before[0].text, ['old text']);
  assert.deepEqual(out.after[0].text, ['new text']);
  const rep = await ex.restore(out.before, out.created, out.after);
  assert.deepEqual(store.get(a).text, ['old text']);
  assert.deepEqual(rep.problems, []);
  assert.deepEqual(rep.conflicts, []);
});

test('undo leaves alone a field edited again after the change and reports a conflict', async () => {
  const { plugin, store, add } = makeRemNote();
  const a = add('v1');
  const ex = new CoreExecutor(plugin);
  const out = await change(ex, { target: `rem:${a}`, method: 'setText', args: [['v2 by AI']] });
  store.get(a).text = ['v3 by the user'];
  const rep = await ex.restore(out.before, out.created, out.after);
  assert.deepEqual(store.get(a).text, ['v3 by the user'], 'user edit preserved');
  assert.match(rep.conflicts.join(' '), /changed again/);
});

test('move with setParent is undone to the same parent and position', async () => {
  const { plugin, store, add } = makeRemNote();
  const p1 = add('p1'); const p2 = add('p2');
  const a = add('a', p1); const b = add('b', p1);
  const ex = new CoreExecutor(plugin);
  const out = await change(ex, { target: `rem:${a}`, method: 'setParent', args: [{ $rem: p2 }] });
  assert.equal(store.get(a).parentId, p2);
  await ex.restore(out.before, out.created, out.after);
  assert.equal(store.get(a).parentId, p1);
  assert.deepEqual(store.get(p1).children, [a, b]);
});

test('a sibling added later is not a conflict; the text is still restored and the Rem stays put', async () => {
  const { plugin, store, add } = makeRemNote();
  const p = add('p'); const a = add('a', p); add('b', p);
  const ex = new CoreExecutor(plugin);
  const out = await change(ex, { target: `rem:${a}`, method: 'setText', args: [['A2']] });
  const newcomer = add('new first', p);
  await (await plugin.rem.findOne(newcomer)).setParent(p, 0);
  const rep = await ex.restore(out.before, out.created, out.after);
  assert.deepEqual(rep.conflicts, []);
  assert.deepEqual(store.get(a).text, ['a']);
  assert.equal(store.get(p).children[0], newcomer, 'the later sibling keeps its place');
});

test('a reorder inside the same parent is undone to the old position', async () => {
  const { plugin, store, add } = makeRemNote();
  const p = add('p'); const a = add('a', p); const b = add('b', p); const c = add('c', p);
  const ex = new CoreExecutor(plugin);
  const out = await change(ex, { target: `rem:${a}`, method: 'setParent', args: [{ $rem: p }, 2] });
  assert.deepEqual(store.get(p).children, [b, c, a]);
  await ex.restore(out.before, out.created, out.after);
  assert.deepEqual(store.get(p).children, [a, b, c]);
});

test('a failure while recording the state after a change never turns it into a failed change', async () => {
  const { plugin, store, add, Rem } = makeRemNote();
  const a = add('x');
  const ex = new CoreExecutor(plugin);
  const findOne = plugin.rem.findOne;
  let broken = false;
  plugin.rem.findOne = async (id) => { if (broken) throw new Error('SDK hiccup'); return findOne(id); };
  const setText = Rem.prototype.setText;
  Rem.prototype.setText = async function (t) { await setText.call(this, t); broken = true; };
  const out = await ex.execute({ target: `rem:${a}`, method: 'setText', args: [['y']] }, false);
  assert.deepEqual(store.get(a).text, ['y']);
  assert.equal(out.afterComplete, false);
  assert.equal(out.errors, undefined, 'the change itself succeeded');
});

test('siblings moved away together come back in their old order', async () => {
  const { plugin, store, add } = makeRemNote();
  const p = add('p'); const n = add('n');
  const a = add('a', p); const b = add('b', p); const c = add('c', p);
  const ex = new CoreExecutor(plugin);
  const out = await change(ex, { batch: [
    { target: `rem:${a}`, method: 'setParent', args: [{ $rem: n }] },
    { target: `rem:${b}`, method: 'setParent', args: [{ $rem: n }] },
  ] });
  assert.deepEqual(store.get(p).children, [c]);
  await ex.restore(out.before, out.created, out.after);
  assert.deepEqual(store.get(p).children, [a, b, c]);
});

test('a sibling deleted and restored by the same undo does not shift the others', async () => {
  const { plugin, store, add } = makeRemNote();
  const p = add('p'); const y = add('y', p); const a = add('a', p); const z = add('z', p);
  const ex = new CoreExecutor(plugin);
  const out = await change(ex, { batch: [
    { target: `rem:${y}`, method: 'remove', args: [] },
    { target: `rem:${a}`, method: 'setText', args: [['A2']] },
  ] }, true);
  const rep = await ex.restore(out.before, out.created, out.after);
  const order = store.get(p).children.map((id) => store.get(id).text[0]);
  assert.deepEqual(order, ['y', 'a', 'z']);
  assert.ok(store.has(z));
  assert.deepEqual(rep.problems, []);
});

test('a parent and its child deleted together come back once, child inside parent', async () => {
  const { plugin, store, add } = makeRemNote();
  const home = add('home'); const p = add('p', home); const c = add('c', p);
  const ex = new CoreExecutor(plugin);
  const out = await change(ex, { batch: [
    { target: `rem:${c}`, method: 'remove', args: [] },
    { target: `rem:${p}`, method: 'remove', args: [] },
  ] }, true);
  const rep = await ex.restore(out.before, out.created, out.after);
  const copies = [...store.values()].filter((d) => d.text[0] === 'c');
  assert.equal(copies.length, 1, 'the child is not recreated twice');
  const newP = store.get(home).children.map((id) => store.get(id)).find((d) => d.text[0] === 'p');
  assert.ok(newP && newP.children.includes(copies[0].id));
  assert.deepEqual(rep.problems, []);
});

test('moving a child out and then deleting its parent is undone without a duplicate', async () => {
  const { plugin, store, add } = makeRemNote();
  const home = add('home'); const n = add('n'); const p = add('p', home); const a = add('keep a', p); add('other', p);
  const ex = new CoreExecutor(plugin);
  const out = await change(ex, { batch: [
    { target: `rem:${a}`, method: 'setParent', args: [{ $rem: n }] },
    { target: `rem:${p}`, method: 'remove', args: [] },
  ] }, true);
  const rep = await ex.restore(out.before, out.created, out.after);
  assert.equal([...store.values()].filter((d) => d.text[0] === 'keep a').length, 1, 'no copy of the moved child');
  const newP = store.get(home).children.map((id) => store.get(id)).find((d) => d.text[0] === 'p');
  assert.deepEqual(newP.children.map((id) => store.get(id).text[0]), ['keep a', 'other']);
  assert.ok(newP.children.includes(a), 'the original Rem, not a copy, is back in place');
  assert.deepEqual(rep.problems, []);
});

test('a created Rem the user moved elsewhere is kept by undo', async () => {
  const { plugin, store, add } = makeRemNote();
  const home = add('home'); const mine = add('my page');
  const ex = new CoreExecutor(plugin);
  const out = await change(ex, { target: 'core', method: 'writeMarkdown', args: [home, '- keep this'] });
  await (await plugin.rem.findOne(out.created[0])).setParent(mine);
  const rep = await ex.restore(out.before, out.created, out.after);
  assert.ok(store.has(out.created[0]));
  assert.match(rep.conflicts.join(' '), /parentId changed after/);
});

test('a single "- item" line is written without its list dash', async () => {
  const { plugin, add } = makeRemNote();
  const home = add('home');
  const seen = [];
  const real = plugin.rem.createTreeWithMarkdown;
  plugin.rem.createTreeWithMarkdown = async (md, parentId) => { seen.push(md); return real(md, parentId); };
  const ex = new CoreExecutor(plugin);
  await change(ex, { target: 'core', method: 'writeMarkdown', args: [home, '  - A  \n'] });
  await change(ex, { target: 'core', method: 'writeMarkdown', args: [home, '- B\n  - C'] });
  assert.deepEqual(seen, ['A  ', '- B\n  - C']);
});

test('one capture budget covers the whole operation', async () => {
  const { plugin, store, add } = makeRemNote();
  const ids = [];
  for (let r = 0; r < 3; r += 1) { const top = add(`t${r}`); ids.push(top); for (let i = 0; i < 1900; i += 1) add(`n${i}`, top); }
  const ex = new CoreExecutor(plugin);
  await assert.rejects(ex.capture({ batch: ids.map((id) => ({ target: `rem:${id}`, method: 'remove', args: [] })) }), (e) => e.code === 'SUBTREE_TOO_LARGE');
  assert.ok(ids.every((id) => store.has(id)));
});

test('created Rems are recorded and removed on undo', async () => {
  const { plugin, store, add } = makeRemNote();
  const parent = add('parent');
  const ex = new CoreExecutor(plugin);
  const out = await change(ex, { target: 'core', method: 'writeMarkdown', args: [parent, '- one\n- two'] });
  assert.equal(out.created.length, 2);
  const rep = await ex.restore(out.before, out.created, out.after);
  assert.equal(store.get(parent).children.length, 0);
  assert.equal(rep.removed.length, 2);
});

test('undo never deletes a pre-existing Rem moved into a created Rem, nor when contents cannot be checked', async () => {
  const { plugin, store, add, flags } = makeRemNote();
  const home = add('home'); const a = add('keep me', home);
  const ex = new CoreExecutor(plugin);
  const created = await change(ex, { target: 'core', method: 'writeMarkdown', args: [home, '- box'] });
  const box = created.created[0];
  await change(ex, { target: `rem:${a}`, method: 'setParent', args: [{ $rem: box }] });
  const rep = await ex.restore(created.before, created.created, created.after);
  assert.ok(store.has(a) && store.has(box));
  assert.match(rep.problems.join(' '), /kept created/);
  const other = await change(ex, { target: 'core', method: 'writeMarkdown', args: [home, '- lonely'] });
  flags.brokenDescendants = true;
  const rep2 = await ex.restore(other.before, other.created, other.after);
  assert.ok(store.has(other.created[0]), 'kept when descendants cannot be read');
  assert.match(rep2.problems.join(' '), /could not be checked/);
});

test('a created Rem the user wrote into after the change is kept', async () => {
  const { plugin, store, add } = makeRemNote();
  const home = add('home');
  const ex = new CoreExecutor(plugin);
  const out = await change(ex, { target: 'core', method: 'writeMarkdown', args: [home, '- draft'] });
  store.get(out.created[0]).text = ['the user typed here'];
  const rep = await ex.restore(out.before, out.created, out.after);
  assert.ok(store.has(out.created[0]));
  assert.match(rep.conflicts.join(' '), /text changed after/);
});

test('destructive remove needs approval; undo recreates the subtree with tags', async () => {
  const { plugin, store, add } = makeRemNote();
  const tag = add('tag'); const home = add('home'); const doomed = add('chapter', home, { tags: [tag] });
  add('child 1', doomed); add('child 2', doomed);
  const ex = new CoreExecutor(plugin);
  const op = { target: `rem:${doomed}`, method: 'remove', args: [] };
  await assert.rejects(ex.execute(op, false), (e) => e.code === 'APPROVAL_REQUIRED');
  assert.ok(store.has(doomed));
  const preview = await ex.preview(op);
  assert.equal(preview.items[0].affected[0].descendants, 2);
  assert.match(preview.items[0].warnings.join(' '), /new id/);
  const out = await change(ex, op, true);
  assert.ok(!store.has(doomed));
  const rep = await ex.restore(out.before, out.created, out.after);
  const newId = rep.recreated[0].newId;
  assert.deepEqual(store.get(newId).text, ['chapter']);
  assert.deepEqual(store.get(newId).tags, [tag]);
  assert.equal(store.get(newId).parentId, home);
  assert.deepEqual(store.get(newId).children.map((c) => store.get(c).text[0]), ['child 1', 'child 2']);
});

test('merge given a plain string id captures and previews the Rem that disappears', async () => {
  const { plugin, store, add } = makeRemNote();
  const keep = add('keep'); const gone = add('gone'); add('gone child', gone);
  const ex = new CoreExecutor(plugin);
  const op = { target: `rem:${keep}`, method: 'merge', args: [gone] };
  const preview = await ex.preview(op);
  assert.deepEqual(preview.items[0].affected.map((a) => a.remId).sort(), [gone, keep].sort());
  const out = await change(ex, op, true);
  assert.ok(!store.has(gone));
  const captured = out.before.find((s) => s.remId === gone);
  assert.ok(captured && captured.subtree.children.length === 1, 'merged-away Rem captured with its subtree');
});

test('a subtree too large to restore is refused before deleting', async () => {
  const { plugin, store, add } = makeRemNote();
  const big = add('big');
  for (let i = 0; i < 2001; i += 1) add(`n${i}`, big);
  const ex = new CoreExecutor(plugin);
  await assert.rejects(ex.capture({ target: `rem:${big}`, method: 'remove', args: [] }), (e) => e.code === 'SUBTREE_TOO_LARGE');
  assert.ok(store.has(big));
});

test('a failing single write still reports created ids and the state after', async () => {
  const { plugin, add } = makeRemNote();
  const a = add('x');
  const ex = new CoreExecutor(plugin);
  await assert.rejects(ex.execute({ target: `rem:${a}`, method: 'setParent', args: [{ $rem: 'missing000' }] }, false),
    (e) => e.code === 'BAD_ARGUMENT' && Array.isArray(e.details.after) && Array.isArray(e.details.created));
});

test('batch stops at the first failure and reports partial progress', async () => {
  const { plugin, store, add } = makeRemNote();
  const a = add('a'); const b = add('b');
  const ex = new CoreExecutor(plugin);
  const out = await ex.execute({ batch: [
    { target: `rem:${a}`, method: 'setText', args: [['A2']] },
    { target: 'rem:nope000000', method: 'setText', args: [['X']] },
    { target: `rem:${b}`, method: 'setText', args: [['B2']] },
  ] }, false);
  assert.equal(out.partial, true);
  assert.equal(out.errors[0].index, 1);
  assert.deepEqual(store.get(b).text, ['b'], 'third step never ran');
});

test('mutating calls run strictly one at a time', async () => {
  const { plugin, store, add } = makeRemNote();
  const a = add('0');
  const ex = new CoreExecutor(plugin);
  await Promise.all(Array.from({ length: 10 }, (_, i) => ex.execute({ target: `rem:${a}`, method: 'setText', args: [[String(i + 1)]] }, false)));
  assert.deepEqual(store.get(a).text, ['10'], 'last queued write wins, none interleaved');
});

test('results come back as references, never live objects', async () => {
  const { plugin, add } = makeRemNote();
  const p = add('p'); const c = add('c', p);
  const ex = new CoreExecutor(plugin);
  const out = await ex.execute({ target: `rem:${p}`, method: 'getChildrenRem', args: [] }, false);
  assert.deepEqual(out.result, [{ $rem: c }]);
  const tree = await ex.execute({ target: 'core', method: 'readTree', args: [p] }, false);
  assert.equal(tree.result.children[0].text, 'c');
});

test('addImage appends an image to one side, replaces by url, and undo restores the text', async () => {
  const { plugin, store, add } = makeRemNote();
  const rem = add('cat');
  store.get(rem).backText = ['kedi ', { i: 'i', url: 'https://upload.wikimedia.org/a.png', width: 100 }];
  const ex = new CoreExecutor(plugin);
  assert.equal(ex.describe().targets['ns:core'].methods.addImage.class, 'write');
  const out = await change(ex, { target: 'core', method: 'addImage', args: [rem, 'text', '%LOCAL_FILE%abc.png', { width: 64 }] });
  assert.deepEqual(store.get(rem).text, ['cat', { i: 'i', url: '%LOCAL_FILE%abc.png', width: 64 }]);
  assert.equal(out.result.replaced, false);
  await change(ex, { target: 'core', method: 'addImage', args: [rem, 'backText', 'https://remnote-user-data.s3.amazonaws.com/x.png', { replaceUrl: 'https://upload.wikimedia.org/a.png' }] });
  assert.deepEqual(store.get(rem).backText, ['kedi ', { i: 'i', url: 'https://remnote-user-data.s3.amazonaws.com/x.png', width: 100 }]);
  await assert.rejects(ex.execute({ target: 'core', method: 'addImage', args: [rem, 'backText', 'https://x/y.png', { replaceUrl: 'https://nope' }] }, false), (e) => e.code === 'NOT_FOUND');
  await assert.rejects(ex.execute({ target: 'core', method: 'addImage', args: [rem, 'side', 'https://x/y.png'] }, false), (e) => e.code === 'BAD_ARGUMENT');
  await assert.rejects(ex.execute({ target: 'core', method: 'addImage', args: [rem, 'text', 'javascript:alert(1)'] }, false), (e) => e.code === 'BAD_ARGUMENT');
  await ex.restore(out.before, out.created, out.after);
  assert.deepEqual(store.get(rem).text, ['cat']);
});

test('undo of a back text written on a Rem that had none clears it again', async () => {
  const { plugin, store, add } = makeRemNote();
  const rem = add('dog');
  const ex = new CoreExecutor(plugin);
  const out = await change(ex, { target: 'core', method: 'addImage', args: [rem, 'backText', '%LOCAL_FILE%dog.png'] });
  assert.deepEqual(store.get(rem).backText, [{ i: 'i', url: '%LOCAL_FILE%dog.png' }]);
  const rep = await ex.restore(out.before, out.created, out.after);
  assert.deepEqual(rep.problems, []);
  assert.deepEqual(store.get(rem).backText, []);
});

test('undo clears a field the Rem did not have before, such as a heading size', async () => {
  const { plugin, store, add, Rem } = makeRemNote();
  Rem.prototype.getFontSize = async function () { return this.d.fontSize; };
  Rem.prototype.setFontSize = async function (v) { this.d.fontSize = v; };
  try {
    const rem = add('dog');
    const ex = new CoreExecutor(plugin);
    const out = await change(ex, { target: `rem:${rem}`, method: 'setFontSize', args: ['H1'] });
    assert.equal(store.get(rem).fontSize, 'H1');
    const rep = await ex.restore(out.before, out.created, out.after);
    assert.deepEqual(rep.problems, []);
    assert.deepEqual(rep.conflicts ?? [], []);
    assert.equal(store.get(rem).fontSize, undefined);
  } finally {
    delete Rem.prototype.getFontSize;
    delete Rem.prototype.setFontSize;
  }
});

test('undo removes a highlight the Rem did not have; RemNote refuses an empty color', async () => {
  const { plugin, store, add, Rem } = makeRemNote();
  Rem.prototype.getHighlightColor = async function () { return this.d.highlight; };
  Rem.prototype.setHighlightColor = async function (v) {
    if (v === undefined || v === null) throw new Error('Invalid highlight color');
    this.d.highlight = v;
  };
  Rem.prototype.removePowerup = async function (code) { if (code === 'h') delete this.d.highlight; };
  try {
    const rem = add('dog');
    const ex = new CoreExecutor(plugin);
    const out = await change(ex, { target: `rem:${rem}`, method: 'setHighlightColor', args: ['Red'] });
    assert.equal(store.get(rem).highlight, 'Red');
    const rep = await ex.restore(out.before, out.created, out.after);
    assert.deepEqual(rep.problems, []);
    assert.equal(store.get(rem).highlight, undefined);
  } finally {
    delete Rem.prototype.getHighlightColor;
    delete Rem.prototype.setHighlightColor;
    delete Rem.prototype.removePowerup;
  }
});
