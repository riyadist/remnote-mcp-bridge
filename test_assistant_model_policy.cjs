'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { EventEmitter } = require('node:events');

// Execute only the actual assistant wiring and CLI runner; never import the
// auto-starting HTTP/WebSocket bridge. Fake only process and output-file I/O.
function fixture({ failure = false } = {}) {
  const source = fs.readFileSync(path.join(__dirname, 'bridge-host.cjs'), 'utf8');
  const policy = source.match(/const assistantModelOptions = require\([^\n]+;/)?.[0]
    || source.match(/function assistantModelOptions\(\) \{[^\n]+\}/)?.[0];
  const wiring = source.slice(source.indexOf('const selectionAssistantHost ='), source.indexOf('const readRemNotePdf ='));
  const runner = source.slice(source.indexOf('function runCodexTranslation('), source.indexOf('function shouldRetryCodexTranslation('));
  assert.ok(policy && wiring && runner, 'Expected bounded source sections');
  const spawns = [], pluginCalls = [];
  let prompt = '', output = '';
  const context = vm.createContext({modelRoute:{run:(primary)=>primary()},
    require, process: { env: { REMNOTE_TRANSLATE_TOPIC_CHAT_MODEL: 'other-topic-model' } },
    TRANSLATE_TOPIC_CHAT_MODEL: 'other-topic-model', TRANSLATE_SELECTION_MODEL: 'other-translation-model',
    TRANSLATE_SELECTION_TIMEOUT_MS: 100, CODEX_DISABLED_FEATURES: ['multi_agent'],
    compactText: (value, limit) => String(value).slice(0, limit),
    startTranslateStage: () => ({}), finishTranslateStage: () => {}, getTraceTextMeta: () => ({}),
    classifyTranslateError: () => ({ errorClass: 'HOST_ACTION_FAILED' }),
    resolveCodexExecutable: () => 'mock-codex.exe', path,
    os: { tmpdir: () => 'mock-temp' }, randomUUID: () => 'mock-id',
    setTimeout, clearTimeout, WebSocket: { OPEN: 1 }, getPrimaryClient: () => ({ readyState: 1 }),
    callPlugin: async (action, payload) => {
      pluginCalls.push({ action, payload });
      if (action === 'assistant_capture') return { captureId: 'capture', segments: [['text']] };
      throw new Error('Unexpected plugin call: ' + action);
    },
    fs: { existsSync: () => !failure, readFileSync: () => output, rmSync: () => {} },
    spawn: (exe, args, options) => {
      spawns.push({ exe, args, options });
      const child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
      child.stdin = {
        write: value => { prompt = value; },
        end: () => queueMicrotask(() => {
          output = prompt.includes('selected-text editing assistant') ? '{"segments":[["edited"]]}'
            : prompt.includes('restricted host adapter') ? '{"answer":"RemNote answer"}' : 'OK';
          if (failure) child.stderr.emit('data', 'Unsupported model: gpt-6.1-sol');
          child.emit('close', failure ? 1 : 0);
        })
      };
      return child;
    }
  });
  vm.runInContext(policy + '\n' + runner + '\n' + wiring + '\nglobalThis.handler = selectionAssistantHost;', context);
  return { host: context.handler, spawns, pluginCalls };
}
function assertAssistantSpawn(call) {
  assert.equal(call.args[call.args.indexOf('-m') + 1], 'gpt-6.1-sol');
  assert.ok(call.args.includes('model_reasoning_effort="medium"'));
  assert.equal(call.args[call.args.indexOf('-s') + 1], 'read-only');
  assert.ok(call.args.includes('web_search="disabled"'));
  assert.ok(call.args.includes('shell_tool'));
  assert.equal(call.options.windowsHide, true);
}
test('status and connection check use assistant policy, not translation environment', async () => {
  const f = fixture();
  const before = await f.host('host_assistant_status');
  assert.equal(before.model, 'gpt-6.1-sol');
  assert.equal(before.reasoningEffort, 'medium');
  assert.equal(before.connection, null); assert.equal(f.spawns.length, 0);
  const after = await f.host('host_assistant_status', { check: true });
  assert.equal(after.connection.ok, true); assert.equal(f.spawns.length, 1);
  assertAssistantSpawn(f.spawns[0]);
});
test('edit, question and RemNote MCP generation reach the exact CLI model/effort without writes', async () => {
  const f = fixture();
  await f.host('host_assistant_capture');
  const edit = await f.host('host_assistant_preview', { captureId: 'capture', command: 'Correct text' });
  assert.equal(edit.segments[0][0], 'edited'); assert.equal(edit.mutationApplied, false);
  const chat = await f.host('host_assistant_chat', { question: 'Explain' });
  assert.equal(chat.answer, 'OK'); assert.equal(chat.model, 'gpt-6.1-sol'); assert.equal(chat.reasoningEffort, 'medium');
  const agent = await f.host('host_assistant_remnote_chat', { question: 'Find note' });
  assert.equal(agent.answer, 'RemNote answer'); assert.equal(agent.mutationApplied, false);
  assert.equal(f.spawns.length, 3); f.spawns.forEach(assertAssistantSpawn);
  assert.deepEqual(f.pluginCalls.map(x => x.action), ['assistant_capture']);
});
test('unsupported assistant model rejects and is never retried with another model', async () => {
  const f = fixture({ failure: true });
  await assert.rejects(f.host('host_assistant_chat', { question: 'Explain' }), /Unsupported model/);
  assert.equal(f.spawns.length, 1); assertAssistantSpawn(f.spawns[0]);
  const status = await f.host('host_assistant_status');
  assert.equal(status.connection.ok, false); assert.equal(status.model, 'gpt-6.1-sol');
  assert.equal(f.pluginCalls.length, 0);
});
