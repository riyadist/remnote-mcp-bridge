'use strict';
// OpenAI (Codex) dusunce kopru Claude Sonnet ile devam eder; sure dolunca OpenAI yeniden denenir.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createModelRoute, runClaudeCli } = require('./model-route.cjs');

function routeFixture(overrides = {}) {
  const calls = { claude: [] };
  let now = 1000;
  const route = createModelRoute({
    cooldownMs: 600000,
    now: () => now,
    runClaude: async (prompt, options) => { calls.claude.push({ prompt, options }); return 'sonnet cevabi'; },
    ...overrides,
  });
  return { route, calls, advance: (ms) => { now += ms; } };
}
const fails = (code) => async () => { throw Object.assign(new Error('codex hatasi'), code ? { code } : {}); };

test('OpenAI calisiyorsa Claude cagrilmaz', async () => {
  const { route, calls } = routeFixture();
  assert.equal(await route.run(async () => 'gpt cevabi', 'p', 42000, {}), 'gpt cevabi');
  assert.equal(calls.claude.length, 0);
});

test('OpenAI duserse ayni istek Sonnet ile cevaplanir', async () => {
  const { route, calls } = routeFixture();
  assert.equal(await route.run(fails(), 'p', 42000, { reasoningEffort: 'medium' }), 'sonnet cevabi');
  assert.equal(calls.claude[0].prompt, 'p');
  assert.equal(calls.claude[0].options.timeoutMs, 42000);
  assert.equal(calls.claude[0].options.reasoningEffort, 'medium');
});

test('OpenAI dustukten sonra bekleme suresince hic denenmez, sure dolunca yeniden denenir', async () => {
  const { route, advance } = routeFixture();
  await route.run(fails(), 'p', 42000, {});
  let primaryCalls = 0;
  const primary = async () => { primaryCalls += 1; return 'gpt cevabi'; };
  assert.equal(await route.run(primary, 'p', 42000, {}), 'sonnet cevabi');
  assert.equal(primaryCalls, 0);
  advance(600001);
  assert.equal(await route.run(primary, 'p', 42000, {}), 'gpt cevabi');
  assert.equal(primaryCalls, 1);
});

test('zaman asimi ve iptal Claude a gecmez', async () => {
  const { route, calls } = routeFixture();
  await assert.rejects(route.run(fails('CODEX_TIMEOUT'), 'p', 1000, {}), { code: 'CODEX_TIMEOUT' });
  await assert.rejects(route.run(fails('CODEX_CANCELLED'), 'p', 1000, {}), { code: 'CODEX_CANCELLED' });
  assert.equal(calls.claude.length, 0);
});

test('gorsel, web arama ve isinma istekleri Claude a gecmez', async () => {
  for (const options of [{ imagePath: 'a.png' }, { webSearchTelemetry: {} }, { warmup: true }]) {
    const { route, calls } = routeFixture();
    await assert.rejects(route.run(fails(), 'p', 1000, options), /codex hatasi/);
    assert.equal(calls.claude.length, 0);
  }
});

test('isinma hatasi OpenAI yi bekleme suresine alir, sonraki gercek istek dogrudan Sonnet e gider', async () => {
  const { route, calls } = routeFixture();
  await assert.rejects(route.run(fails(), 'OK', 1000, { warmup: true }));
  let primaryCalls = 0;
  await route.run(async () => { primaryCalls += 1; return 'x'; }, 'p', 1000, {});
  assert.equal(primaryCalls, 0);
  assert.equal(calls.claude.length, 1);
});

test('iki saglayici da duserse hata acik ve kisadir', async () => {
  const { route } = routeFixture({ runClaude: async () => { throw new Error('claude yok'); } });
  await assert.rejects(route.run(fails(), 'p', 1000, {}), /OpenAI ve Claude yanit vermedi/);
});

function fakeClaude(stdout, code = 0) {
  const seen = {};
  const spawnImpl = (exe, args, options) => {
    Object.assign(seen, { exe, args, options, input: '' });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => { seen.killed = true; };
    child.stdin = {
      on() {}, write: (text) => { seen.input += text; },
      end: () => queueMicrotask(() => {
        if (stdout !== null) { child.stdout.emit('data', Buffer.from(stdout)); child.emit('close', code); }
      }),
    };
    return child;
  };
  return { seen, spawnImpl };
}

test('Claude komutu araçsiz, ayarsiz ve Sonnet ile calisir; istek stdin den gider', async () => {
  const { seen, spawnImpl } = fakeClaude(JSON.stringify({ is_error: false, result: ' {"candidates":[]} ' }));
  const text = await runClaudeCli('istek', { timeoutMs: 1000, reasoningEffort: 'minimal', executable: 'claude.exe', spawnImpl });
  assert.equal(text, '{"candidates":[]}');
  assert.equal(seen.input, 'istek');
  assert.equal(seen.options.windowsHide, true);
  assert.ok(!seen.args.includes('istek'), 'istek komut satirina yazilmaz');
  for (const flag of ['--print', '--tools=', '--strict-mcp-config', '--setting-sources=', '--no-session-persistence']) assert.ok(seen.args.includes(flag), flag);
  assert.equal(seen.args[seen.args.indexOf('--model') + 1], 'sonnet');
  assert.equal(seen.args[seen.args.indexOf('--effort') + 1], 'low');
});

test('Claude hata veya bos sonuc dondururse basari sayilmaz', async () => {
  const opts = { timeoutMs: 1000, executable: 'claude.exe' };
  await assert.rejects(runClaudeCli('x', { ...opts, spawnImpl: fakeClaude(JSON.stringify({ is_error: true, result: 'limit' })).spawnImpl }));
  await assert.rejects(runClaudeCli('x', { ...opts, spawnImpl: fakeClaude(JSON.stringify({ is_error: false, result: '  ' })).spawnImpl }));
  await assert.rejects(runClaudeCli('x', { ...opts, spawnImpl: fakeClaude('json degil').spawnImpl }));
  await assert.rejects(runClaudeCli('x', { ...opts, spawnImpl: fakeClaude('{}', 1).spawnImpl }));
});

test('Claude sure asiminda durdurulur', async () => {
  const { seen, spawnImpl } = fakeClaude(null);
  await assert.rejects(runClaudeCli('x', { timeoutMs: 20, executable: 'claude.exe', spawnImpl }), { code: 'CLAUDE_TIMEOUT' });
  assert.equal(seen.killed, true);
});
