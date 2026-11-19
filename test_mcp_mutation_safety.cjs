'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
// Baseline adapter SHA256 C283ADE2C57CFCB113D0918546876344DDA273C23594A9E4CA6C436FD5237386
// Baseline widget SHA256 79E35369F5499578E3DC15674FAB7DFB1AD1330A371D3D562A4206A54CC6A86C
// Execute actual production methods; replace only the external SDK boundary.
const adapterSource = fs.readFileSync(process.env.MCP_SAFETY_ADAPTER_SOURCE || path.join(__dirname, 'src/api/rem-adapter.ts'), 'utf8');
const widgetSource = fs.readFileSync(process.env.MCP_SAFETY_WIDGET_SOURCE || path.join(__dirname, 'src/widgets/index.tsx'), 'utf8');
function compile(source, globals = {}) {
  const context = { exports: {}, console, Set, ...globals };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context;
}
const ast = ts.createSourceFile('adapter.ts', adapterSource, ts.ScriptTarget.Latest, true);
const classNode = ast.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'RemAdapter');
const { RemAdapter } = compile(classNode.getText(ast), { BRIDGE_PLUGIN_VERSION: 'fixture', EXTRA_CARD_DETAIL_POWERUP_CODE: 'x' }).exports;
function adapter(plugin) {
  const instance = Object.create(RemAdapter.prototype);
  instance.plugin = plugin;
  instance.settings = { autoTagEnabled: false };
  instance.textToRichText = async text => [text];
  instance.getRemText = async rem => rem.text.join('');
  instance.richTextFromParams = async params => params.richText || [params.text];
  instance.summarizeRichText = async text => ({ text });
  instance.inspectEditorContext = async () => ({ readOnly: true });
  instance.serializeForBridge = async value => value;
  return instance;
}
function child(kind) {
  return { _id: kind, text: kind === 'ref' ? [{ i: 'q', _id: 'target' }] : ['before'], backText: kind === 'back' ? ['answer'] : [],
    removed: false, getChildrenRem: async () => [], remove: async function() { this.removed = true; },
    isSlot: async () => { if (kind === 'structural-error') throw Error('SDK unavailable'); return false; } };
}
for (const kind of ['old-child', 'back', 'ref', 'structural-error']) {
  test(`create never implicitly removes SDK child ${kind}`, async () => {
    const c = child(kind);
    c.text = [];
    const rem = { _id: 'new', getChildrenRem: async () => [c], setText: async () => {} };
    const a = adapter({ rem: { createRem: async () => rem } });
    const result = await a.createNote({ title: 'created' });
    assert.equal(result.remId, 'new');
    assert.equal(c.removed, false);
  });
  for (const operation of ['rename', 'tag', 'powerup', 'heading']) {
    test(`${operation} never removes ${kind} after SDK empties its visible title`, async () => {
      const c = child(kind);
      const rem = { _id: 'r', text: ['original'], getChildrenRem: async () => [c], getFontSize: async () => 'H1',
        setFontSize: async () => { c.text = []; }, setText: async () => { c.text = []; },
        addPowerup: async () => { c.text = []; }, getParentRem: async () => ({ getChildrenRem: async () => [c] }),
        setPowerupProperty: async () => {}, call: async () => {} };
      const a = adapter({ rem: { findOne: async () => rem }, powerup: { getPowerupSlotByCode: async () => undefined } });
      a.addTagToRem = async () => { c.text = []; };
      if (operation === 'powerup') await a.addPowerup({ remId: 'r', powerup: 'todo' });
      else await a.updateNote({ remId: 'r', ...(operation === 'rename' ? { title: 'new' } : operation === 'tag' ? { addTags: ['tag'] } : { headingLevel: 1 }) });
      assert.equal(c.removed, false);
    });
  }
}
function widgetFunctions(names, globals) {
  const ast = ts.createSourceFile('widget.tsx', widgetSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name.text));
  return compile(functions.map(n => n.getText(ast)).join('\n') + '\n' + names.map(n => `exports.${n}=${n};`).join('\n'), globals).exports;
}
for (const method of ['setNoteHeadingLevel', 'setNoteHighlightColor']) {
  test(`widget ${method} preserves children and siblings`, async () => {
    const c = child('old-child');
    const rem = { _id: 'r', getChildrenRem: async () => [c], getParentRem: async () => ({ getChildrenRem: async () => [c] }),
      setFontSize: async () => { c.text = []; }, setHighlightColor: async () => { c.text = []; }, addPowerup: async () => {}, setPowerupProperty: async () => {} };
    const helpers = ['getBlankDirectChildIds', 'removeNewBlankDirectChildren', 'isStructuralRem', 'getRemObjectText', 'extractPlainText'].filter(n => widgetSource.includes(`function ${n}(`));
    const f = widgetFunctions([...helpers, method], { BuiltInPowerupCodes: { Header: 'r' }, inspectNoteStyle: async () => ({}), resolveHeaderSizeOptionRemId: async () => undefined, setRawPowerupProperty: async () => {} });
    await f[method]({ rem: { findOne: async () => rem } }, { remId: 'r', headingLevel: 1, highlightColor: 'Red' });
    assert.equal(c.removed, false);
  });
}
function editorFixture(selection = { type: 'Text', remId: 'r', richText: ['abc'], isReverse: false, range: { start: 0, end: 3 } }) {
  const calls = [];
  const editor = { getSelection: async () => selection, setText: async value => calls.push(['setText', value]), selectText: async value => calls.push(['selectText', value]) };
  return { a: adapter({ editor }), calls };
}
for (const range of [[], {}, { start: -1, end: 2 }, { start: 3, end: 2 }, { start: 0.5, end: 2 }, { start: 0, end: Infinity }, { start: NaN, end: 2 }, { start: '0', end: 2 }, { start: 0, end: Number.MAX_SAFE_INTEGER + 1 }]) {
  test(`reject invalid editor range ${JSON.stringify(range)}`, async () => {
    const { a, calls } = editorFixture();
    await assert.rejects(a.controlEditor({ operation: 'selectText', range, confirm: 'CONTROL_EDITOR' }));
    assert.equal(calls.length, 0);
  });
}
test('valid UTF-16 emoji offsets are forwarded unchanged', async () => {
  const { a, calls } = editorFixture();
  const result = await a.controlEditor({ operation: 'selectText', range: { start: 1, end: 3 }, confirm: 'CONTROL_EDITOR' });
  assert.equal(result.success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['selectText', { start: 1, end: 3 }]]);
});
for (const selection of [null, undefined, { type: 'Rem', remIds: ['r'] }, { type: 'Rem', remIds: ['r', 's'] }, { type: 'Text', remId: 'wrong' }]) {
  test(`setText refuses unsafe selection ${JSON.stringify(selection)}`, async () => {
    const { a, calls } = editorFixture(selection === undefined ? null : selection);
    const result = await a.controlEditor({ operation: 'setText', text: 'new', expectedRemId: 'r', confirm: 'CONTROL_EDITOR' });
    assert.equal(result.success, false);
    assert.equal(result.mutationApplied, false);
    assert.equal(calls.length, 0);
  });
}
test('setText refuses unreadable selection', async () => {
  const { a, calls } = editorFixture();
  a.plugin.editor.getSelection = async () => { throw Error('offline'); };
  const result = await a.controlEditor({ operation: 'setText', text: 'new', confirm: 'CONTROL_EDITOR' });
  assert.equal(result.success, false);
  assert.equal(calls.length, 0);
});
test('setText previews without confirmation or with dryRun even when selection is null', async () => {
  const { a, calls } = editorFixture(null);
  for (const params of [{}, { dryRun: true, confirm: 'CONTROL_EDITOR' }]) {
    const result = await a.controlEditor({ operation: 'setText', text: 'new', ...params });
    assert.ok(result.preview);
    assert.equal(result.mutationApplied, false);
  }
  assert.equal(calls.length, 0);
});
test('setText SDK completion is explicitly not persistence verification', async () => {
  const { a, calls } = editorFixture();
  const result = await a.controlEditor({ operation: 'setText', text: 'new', expectedRemId: 'r', confirm: 'CONTROL_EDITOR' });
  assert.equal(result.success, true);
  assert.equal(calls.length, 1);
  assert.ok(result.verification, 'SDK completion must carry explicit persistence verification status');
  assert.equal(result.verification.persisted, false);
  assert.equal(result.verification.status, 'unverified');
});
test('widget forwards expectedRemId to editor target guard', async () => {
  const block = widgetSource.slice(widgetSource.indexOf("    case 'control_editor':", widgetSource.indexOf('case \'control_editor\':') + 1));
  const expression = block.slice(block.indexOf('return '), block.indexOf("    case 'control_practice_queue':"));
  const ctx = compile(`async function invoke(payload) { ${expression} } exports.invoke=invoke;`, { remAdapter: { controlEditor: async params => params } });
  const result = await ctx.exports.invoke({ operation: 'setText', expectedRemId: 'r' });
  assert.equal(result.expectedRemId, 'r');
});
