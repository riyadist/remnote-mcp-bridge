'use strict';
// Regression tests (2026-11-17):
//  1) {"$rem": id} given to a parameter that only takes an id (removeTag, merge,
//     findOne, parentId...) must reach the SDK as the plain id string. A live Rem
//     object there cannot be copied over postMessage and the SDK call never answers.
//  2) A call that never answers must not lock the change queue: after the call
//     time limit the queue is released, later changes are refused at once with
//     QUEUE_STALLED (naming the stuck method), and a successful read clears it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildSync } = require('esbuild');

function load(file) {
  const bundle = buildSync({
    entryPoints: [path.join(__dirname, 'src', 'core', file)],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['@remnote/plugin-sdk'], loader: { '.json': 'json' },
  }).outputFiles[0].text;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', bundle)(mod, mod.exports, require);
  return mod.exports;
}
const ex$ = load('executor.ts');
const marshal = load('marshal.ts');
const { CoreExecutor } = ex$;

const NEVER = new Promise(() => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms, 'SLEPT'));
// Fails (instead of hanging) when the promise does not settle in time.
async function settle(promise, ms) {
  const out = await Promise.race([promise.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e })), sleep(ms)]);
  assert.notEqual(out, 'SLEPT', `did not settle within ${ms} ms`);
  return out;
}

function makeRemNote() {
  const store = new Map();
  const seen = []; // [method, typeof each argument]
  const hang = { setText: false };
  let next = 1;
  const add = (text, parentId = null) => {
    const id = `rem${String(next++).padStart(6, '0')}`;
    store.set(id, { id, text: [text], parentId, children: [], tags: [] });
    if (parentId) store.get(parentId).children.push(id);
    return id;
  };
  const kind = (a) => (a && typeof a === 'object' && typeof a.getChildrenRem === 'function' ? 'Rem' : typeof a);
  class Rem {
    constructor(id) { this._id = id; }
    get d() { return store.get(this._id); }
    get text() { return this.d.text; }
    get backText() { return undefined; }
    async getChildrenRem() { return this.d.children.map((c) => new Rem(c)); }
    async getParentRem() { return this.d.parentId ? new Rem(this.d.parentId) : undefined; }
    async getTagRems() { return this.d.tags.map((t) => new Rem(t)); }
    async positionAmongstSiblings() { return 0; }
    async isDocument() { return false; }
    async getType() { return 'concept'; }
    async setText(t) { if (hang.setText) return NEVER; this.d.text = t; }
    async addTag(t) { seen.push(['addTag', kind(t)]); const id = typeof t === 'string' ? t : t._id; if (!this.d.tags.includes(id)) this.d.tags.push(id); }
    // Like the real SDK: only a plain id string can cross postMessage.
    async removeTag(tagId) { seen.push(['removeTag', kind(tagId)]); if (typeof tagId !== 'string') return NEVER; this.d.tags = this.d.tags.filter((x) => x !== tagId); }
    async setParent(parent) { seen.push(['setParent', kind(parent)]); }
    async getTagPropertyValue(propertyId) { seen.push(['getTagPropertyValue', kind(propertyId)]); return ['v']; }
  }
  const plugin = {
    rem: {
      findOne: async (id) => { seen.push(['findOne', kind(id)]); return typeof id === 'string' && store.has(id) ? new Rem(id) : undefined; },
      createSingleRemWithMarkdown: async (md, parentId) => { seen.push(['createSingleRemWithMarkdown', kind(parentId)]); return new Rem(add(md, parentId)); },
    },
    card: { findOne: async () => undefined },
    window: { openRem: async (rem) => { seen.push(['openRem', kind(rem)]); } },
    richText: { toMarkdown: async (rt) => rt.join(''), parseFromMarkdown: async (md) => [md] },
    search: { search: async () => [] },
  };
  return { plugin, store, add, seen, hang };
}
const last = (seen, method) => [...seen].reverse().find((s) => s[0] === method)?.[1];

test('parameter kinds come from the SDK signature in the registry', { timeout: 5000 }, () => {
  const { paramKinds } = marshal;
  assert.deepEqual(paramKinds('(tagId: RemId, removeProperties?: boolean) => Promise<void>'), ['id', 'id']);
  assert.deepEqual(paramKinds('(tag: RemId | RemObject) => Promise<void>'), ['object']);
  assert.deepEqual(paramKinds('(markdown: string, parentId?: RemId) => Promise<RemObject[]>'), ['id', 'id']);
  assert.deepEqual(paramKinds('(rems: RemId[] | RemObject[], newParent: RemId | RemObject, positionAmongstSiblings: number, portal?: RemId | RemObject) => Promise<void>'), ['object', 'object', 'id', 'object']);
  assert.deepEqual(paramKinds('(html: string, rem: PluginRem | RemId) => Promise<void>'), ['id', 'object']);
  assert.deepEqual(paramKinds('<T extends A | undefined = undefined>(callbackId: string, callback: (x: number) => void) => void'), ['id', 'id']);
  assert.deepEqual(paramKinds('() => Promise<RemObject[]>'), []);
  assert.equal(paramKinds('(args: {'), null, 'cut-off signature is unknown');
  assert.equal(paramKinds('GetPowerupSlotByCodeOverload'), null);
  assert.equal(paramKinds(undefined), null);
});

test('{$rem} reaches id-only SDK parameters as the plain id string', { timeout: 5000 }, async () => {
  const { plugin, store, add, seen } = makeRemNote();
  const tag = add('Low'); const a = add('task');
  store.get(a).tags.push(tag);
  const ex = new CoreExecutor(plugin);
  const out = await settle(ex.execute({ target: `rem:${a}`, method: 'removeTag', args: [{ $rem: tag }] }, false), 2000);
  assert.equal(last(seen, 'removeTag'), 'string', 'removeTag got a live Rem object');
  assert.ok(out.ok, String(out.e));
  assert.deepEqual(store.get(a).tags, []);
  await settle(ex.execute({ target: `rem:${a}`, method: 'getTagPropertyValue', args: [{ $rem: tag }] }, false), 2000);
  assert.equal(last(seen, 'getTagPropertyValue'), 'string');
  await settle(ex.execute({ target: 'rem', method: 'createSingleRemWithMarkdown', args: ['x', { $rem: a }] }, false), 2000);
  assert.equal(last(seen, 'createSingleRemWithMarkdown'), 'string');
  // A missing Rem is still refused as a bad argument.
  const missing = await settle(ex.execute({ target: `rem:${a}`, method: 'removeTag', args: [{ $rem: 'nope00000' }] }, false), 2000);
  assert.equal(missing.ok, false);
  assert.equal(missing.e.code, 'BAD_ARGUMENT');
});

test('parameters that take a Rem object still get the live object', { timeout: 5000 }, async () => {
  const { plugin, add, seen } = makeRemNote();
  const p = add('p'); const a = add('a'); const t = add('t');
  const ex = new CoreExecutor(plugin);
  await settle(ex.execute({ target: `rem:${a}`, method: 'setParent', args: [{ $rem: p }] }, false), 2000);
  assert.equal(last(seen, 'setParent'), 'Rem');
  await settle(ex.execute({ target: `rem:${a}`, method: 'addTag', args: [{ $rem: t }] }, false), 2000);
  assert.equal(last(seen, 'addTag'), 'Rem');
  await settle(ex.execute({ target: 'window', method: 'openRem', args: [{ $rem: a }] }, false), 2000);
  assert.equal(last(seen, 'openRem'), 'Rem');
});

test('core helpers accept {$rem} for their id parameters', { timeout: 5000 }, async () => {
  const { plugin, add } = makeRemNote();
  const a = add('hello');
  const ex = new CoreExecutor(plugin);
  const out = await settle(ex.execute({ target: 'core', method: 'getRem', args: [{ $rem: a }] }, false), 2000);
  assert.ok(out.ok, String(out.e?.message));
  assert.equal(out.v.result.remId, a);
});

test('a call that never answers releases the queue; later changes are refused at once until a read succeeds', { timeout: 5000 }, async () => {
  const { plugin, store, add, hang } = makeRemNote();
  const a = add('x');
  const ex = new CoreExecutor(plugin, { callTimeoutMs: 100, serialTimeoutMs: 1000 });
  hang.setText = true;
  const first = await settle(ex.execute({ target: `rem:${a}`, method: 'setText', args: [['y']] }, false), 2000);
  assert.equal(first.ok, false);
  assert.equal(first.e.code, 'SDK_TIMEOUT');
  hang.setText = false;

  const t0 = Date.now();
  const refused = await settle(ex.execute({ target: `rem:${a}`, method: 'setText', args: [['z']] }, false), 300);
  assert.equal(refused.ok, false);
  assert.equal(refused.e.code, 'QUEUE_STALLED');
  assert.ok(Date.now() - t0 < 100, 'refused at once, not after waiting');
  assert.match(refused.e.message, /rem\.setText/);
  assert.match(refused.e.message, /\d+ s/);
  assert.equal(refused.e.details.method, 'rem.setText');
  assert.equal(typeof refused.e.details.seconds, 'number');
  const cap = await settle(ex.capture({ target: `rem:${a}`, method: 'setText', args: [['z']] }), 300);
  assert.equal(cap.e?.code, 'QUEUE_STALLED', 'capture is refused too');
  assert.deepEqual(store.get(a).text, ['x'], 'nothing ran');

  const status = await settle(ex.execute({ target: 'core', method: 'status', args: [] }, false), 300);
  assert.ok(status.ok, String(status.e?.message));
  assert.equal(status.v.result.stalled.method, 'rem.setText');
  const stillRefused = await settle(ex.execute({ target: `rem:${a}`, method: 'setText', args: [['z']] }, false), 300);
  assert.equal(stillRefused.e?.code, 'QUEUE_STALLED', 'reading the status is not proof that RemNote answers');

  // A plain read that answers clears the stuck flag.
  const read = await settle(ex.execute({ target: 'rem', method: 'findOne', args: [a] }, false), 300);
  assert.ok(read.ok, String(read.e?.message));
  const again = await settle(ex.execute({ target: `rem:${a}`, method: 'setText', args: [['z']] }, false), 1000);
  assert.ok(again.ok, String(again.e?.message));
  assert.deepEqual(store.get(a).text, ['z']);
  const st = await settle(ex.execute({ target: 'core', method: 'status', args: [] }, false), 300);
  assert.equal(st.v.result.stalled, null);
  assert.equal(st.v.result.running, null);
});

test('time limits sit inside the gateway limits (plugin < gateway < client)', { timeout: 5000 }, () => {
  assert.equal(ex$.SDK_CALL_TIMEOUT_MS, 30000);
  assert.ok(ex$.SERIAL_TIMEOUT_MS < 180000, 'job limit below gateway MUTATION_TIMEOUT_MS (180 s)');
  assert.ok(ex$.SDK_CALL_TIMEOUT_MS < 60000, 'call limit below gateway default request timeout (60 s)');
});
