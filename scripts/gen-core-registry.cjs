#!/usr/bin/env node
// Generates src/core/sdk-registry.generated.json from the installed
// @remnote/plugin-sdk type declarations, so the control core always exposes
// exactly the SDK it was built against. Each method gets a safety class:
//   read        - no change
//   ui          - changes only what is on screen
//   write       - changes notes or cards
//   destructive - deletes or merges data (needs plan + approval)
//   blocked     - never callable remotely (plugin internals, secrets, callbacks)
// Run: node scripts/gen-core-registry.cjs
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const sdkDir = path.join(__dirname, '..', 'node_modules', '@remnote', 'plugin-sdk');
const nsDir = path.join(sdkDir, 'dist', 'name_spaces');
const sdkVersion = JSON.parse(fs.readFileSync(path.join(sdkDir, 'package.json'), 'utf8')).version;

// class name -> registry key ("ns:<plugin property>" or "obj:<kind>")
const CLASSES = {
  RemObject: 'obj:rem', Card: 'obj:card',
  AppNamespace: 'ns:app', EditorNamespace: 'ns:editor', EventNamespace: 'ns:event',
  MessagingNamespace: 'ns:messaging', FocusNamespace: 'ns:focus', DateNamespace: 'ns:date',
  WidgetNamespace: 'ns:widget', WindowNamespace: 'ns:window', PowerupNamespace: 'ns:powerup',
  RichTextNamespace: 'ns:richText', RemNamespace: 'ns:rem', CardNamespace: 'ns:card',
  StorageNamespace: 'ns:storage', SettingsNamespace: 'ns:settings', SearchNamespace: 'ns:search',
  KnowledgeBaseNamespace: 'ns:kb', SchedulerNamespace: 'ns:scheduler', QueueNamespace: 'ns:queue',
  ReaderNamespace: 'ns:reader',
};

// Whole namespaces that must never be driven remotely: they expose the plugin's
// own secrets/settings or need JavaScript callbacks that cannot cross the wire.
const BLOCKED_NAMESPACES = new Set(['ns:storage', 'ns:settings', 'ns:event', 'ns:messaging', 'ns:widget', 'ns:scheduler']);
const UI_NAMESPACES = new Set(['ns:window', 'ns:editor', 'ns:focus', 'ns:reader']);
const DESTRUCTIVE = new Set(['obj:rem.remove', 'obj:rem.merge', 'obj:rem.mergeAndSetAlias', 'obj:card.remove']);
const OVERRIDES = {
  // app: registering widgets/commands/CSS from outside would rewrite this plugin.
  'ns:app.toast': 'ui',
  'ns:app.getVersion': 'read',
  'ns:queue.showAnswer': 'ui',
  'ns:queue.goBackToPreviousCard': 'ui',
  'ns:queue.rateCurrentCard': 'write',
  'ns:queue.removeCurrentCardFromQueue': 'ui',
  'ns:richText.parseAndInsertHtml': 'write',
  'obj:rem.openRemAsPage': 'ui',
  'obj:rem.openRemInContext': 'ui',
  'obj:rem.expand': 'ui',
  'obj:rem.collapse': 'ui',
  'obj:rem.scrollToReaderHighlight': 'ui',
  'obj:rem.copyReferenceToClipboard': 'ui',
  'obj:rem.copyTagReferenceToClipboard': 'ui',
  'obj:rem.copyPortalReferenceToClipboard': 'ui',
  'obj:rem.setIsCollapsed': 'ui',
  // Creates an alias Rem only when missing; undo cannot tell which, so it is not undoable.
  'obj:rem.getOrCreateAliasWithText': 'write',
  'ns:reader.addHighlight': 'write', // creates a highlight Rem
  'ns:queue.inLookbackMode': 'read',
  'ns:kb.call': 'blocked', // opaque internal call surface
  'ns:window.stealKeys': 'blocked', // could lock the user's keyboard in RemNote
  'ns:window.releaseKeys': 'blocked',
  // Editor commands that change the focused note's text are real writes.
  'ns:editor.setText': 'write',
  'ns:editor.cut': 'write',
  'ns:editor.delete': 'write',
  'ns:editor.deleteCharacters': 'write',
  'ns:editor.insertPlainText': 'write',
  'ns:editor.insertRichText': 'write',
  'ns:editor.insertMarkdown': 'write',
  'ns:editor.undo': 'write',
  'ns:editor.redo': 'write',
};
const READ_PREFIX = /^(get|is|has|find|search|to|parse|all|ancestor|descendant|tagged|sibling|visible|position|remsBeing|remsReferencing|deepRems|portalsAndDocuments|timesSelected|embeddedQueue|current|empty|length|split|indexOf|substring|replace|trim|normalize|deepEqual|deepEquals|applyTextFormat|getFormat|concat|charAt|format|count|textContains)/;

// How completely the journal can undo a write. Writes that cannot be undone are
// treated as destructive (plan + approval), so nothing irreversible runs silently.
//   full    - every effect is captured and restored
//   partial - restored except for the listed effects (reported in the journal)
//   none    - not restorable
const UNDO = {
  'obj:rem.setText': 'full', 'obj:rem.setBackText': 'full', 'obj:rem.setParent': 'full',
  'obj:rem.addTag': 'full', 'obj:rem.removeTag': 'full', 'obj:rem.indent': 'full', 'obj:rem.outdent': 'full',
  'obj:rem.setIsDocument': 'full', 'obj:rem.setIsFolder': 'full', 'obj:rem.setEnablePractice': 'full',
  'obj:rem.setPracticeDirection': 'full', 'obj:rem.setIsTodo': 'full', 'obj:rem.setTodoStatus': 'full',
  'obj:rem.setFontSize': 'full', 'obj:rem.setHighlightColor': 'full', 'obj:rem.setIsListItem': 'full',
  'obj:rem.setIsQuote': 'full', 'obj:rem.setIsCode': 'full', 'obj:rem.setIsCardItem': 'full',
  'obj:rem.setType': 'full', 'obj:rem.addSource': 'full', 'obj:rem.removeSource': 'full',
  'obj:rem.setIsSlot': 'full', 'obj:rem.setIsProperty': 'full',
  'ns:rem.moveRems': 'full', 'ns:rem.createRem': 'full', 'ns:rem.createSingleRemWithMarkdown': 'full',
  'ns:rem.createTreeWithMarkdown': 'full', 'ns:rem.createPortal': 'full', 'ns:rem.createLinkRem': 'partial',
  'ns:rem.createTable': 'full', 'ns:core.writeMarkdown': 'full',
  // A removed Rem comes back as a new Rem (new id) with text, back text, tags and
  // structure; flashcard history, properties and links to the old id are lost.
  'obj:rem.remove': 'partial',
  // Restoring tags removes the powerup tag; its slot values are not restored.
  'obj:rem.addPowerup': 'partial',
  // Portal membership, table filters and hidden-include state are not captured,
  // so addToPortal, removeFromPortal, setTableFilter and
  // setHiddenExplicitlyIncludedState stay "none" (plan + approval, no undo).
};
// Arguments that turn an otherwise reversible write into data loss. The SDK treats
// any truthy value as "on", so the rule is truthiness, not strict equality.
const DESTRUCTIVE_WHEN_ARG = {
  'obj:rem.removeTag': { index: 1, truthy: true }, // removeProperties deletes property children
};

function classify(key, method) {
  const id = `${key}.${method}`;
  if (OVERRIDES[id]) return OVERRIDES[id];
  if (BLOCKED_NAMESPACES.has(key)) return 'blocked';
  if (key === 'ns:app') return /^(get|is)/.test(method) ? 'read' : 'blocked';
  if (DESTRUCTIVE.has(id)) return 'destructive';
  if (key === 'ns:richText') return 'read'; // pure text helpers
  if (READ_PREFIX.test(method)) return 'read';
  if (UI_NAMESPACES.has(key)) return 'ui';
  return 'write';
}

function parseClasses(text) {
  const out = {};
  const re = /export declare class (\w+)[^{]*\{([\s\S]*?)\n\}/g;
  let match;
  while ((match = re.exec(text))) {
    const [, name, body] = match;
    if (!CLASSES[name]) continue;
    const methods = {};
    for (const line of body.split('\n')) {
      const m = /^\s{4}(?!private|protected|constructor|\/\*|\*)(?:readonly\s+)?(\w+)(\??)\s*(?::\s*(.+?);?\s*$|(\(.*))/.exec(line);
      if (!m) continue;
      const [, member, , typeSig, methodSig] = m;
      const signature = (typeSig || methodSig || '').trim();
      // Only callable members: arrow-function types, overload aliases or methods.
      if (!methodSig && !/=>|Overload|^\(/.test(signature)) continue;
      if (member.startsWith('_')) continue;
      methods[member] = { signature: signature.length > 300 ? `${signature.slice(0, 297)}...` : signature };
    }
    out[CLASSES[name]] = methods;
  }
  return out;
}

const targets = {};
for (const file of fs.readdirSync(nsDir).filter((f) => f.endsWith('.d.ts'))) {
  const parsed = parseClasses(fs.readFileSync(path.join(nsDir, file), 'utf8'));
  for (const [key, methods] of Object.entries(parsed)) {
    targets[key] = targets[key] || { methods: {} };
    for (const [method, info] of Object.entries(methods)) {
      const id = `${key}.${method}`;
      let cls = classify(key, method);
      let undo;
      if (cls === 'write' || cls === 'destructive') {
        undo = UNDO[id] || 'none';
        if (cls === 'write' && undo === 'none') cls = 'destructive';
      }
      targets[key].methods[method] = {
        class: cls,
        ...(undo ? { undo } : {}),
        ...(DESTRUCTIVE_WHEN_ARG[id] ? { destructiveWhenArg: DESTRUCTIVE_WHEN_ARG[id] } : {}),
        ...info,
      };
    }
  }
}

const missing = Object.values(CLASSES).filter((k) => !targets[k]);
if (missing.length) {
  console.error(`Registry incomplete, classes not found: ${missing.join(', ')}`);
  process.exit(1);
}

const out = path.join(__dirname, '..', 'src', 'core', 'sdk-registry.generated.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ sdkVersion, targets }, null, 1)}\n`);
const counts = {};
for (const t of Object.values(targets)) for (const m of Object.values(t.methods)) counts[m.class] = (counts[m.class] || 0) + 1;
console.log(`sdk ${sdkVersion}: ${Object.keys(targets).length} targets`, counts);
