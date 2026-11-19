const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const path = require('node:path');

// Execute the real client; only the browser transport and clock are replaced.
function setup() {
  const sockets = [];
  const timers = new Map();
  const logs = [];
  let nextTimer = 0;
  class Socket {
    static CONNECTING = 0;
    static OPEN = 1;
    constructor() { this.readyState = 0; this.sent = []; sockets.push(this); }
    open() { this.readyState = 1; this.onopen?.({}); }
    close() { this.readyState = 3; }
    send(data) {
      this.sendAttempts = (this.sendAttempts || 0) + 1;
      if (this.failSend) throw new Error('transport send failed');
      assert.equal(this.readyState, 1);
      this.sent.push(JSON.parse(data));
    }
    message(value) { return this.onmessage?.({ data: JSON.stringify(value) }); }
  }
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, 'src/bridge/websocket-client.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(compiled, {
    exports, Error, WebSocket: Socket,
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const client = new exports.WebSocketClient({ url: 'ws://test.invalid', onLog: (...entry) => logs.push(entry) });
  client.connect(); sockets[0].open();
  return { client, sockets, timers, logs };
}

test('late events from the replaced socket cannot alter the new connection or dispatch work', async () => {
  const { client, sockets, timers } = setup();
  let calls = 0;
  client.setMessageHandler(async () => ++calls);
  client.reconnect(); sockets[1].open();
  sockets[0].onclose({ code: 1006, reason: 'late' });
  assert.equal(client.getStatus(), 'connected');
  assert.equal(timers.size, 0);
  await sockets[0].message({ id: 1, action: 'create_note' });
  await sockets[0].message({ type: 'ping' });
  assert.equal(calls, 0);
  assert.equal(sockets[1].sent.length, 0);
  client.disconnect();
  sockets[1].onopen({});
  assert.equal(client.getStatus(), 'disconnected');
});

for (const rpc of [false, true]) {
  for (const reject of [false, true]) {
    test(`${rpc ? 'JSONRPC' : 'custom'} late ${reject ? 'failure' : 'success'} stays off the replacement socket`, async () => {
      const { client, sockets } = setup();
      let finish;
      let calls = 0;
      client.setMessageHandler(() => { calls++; return new Promise((resolve, fail) => { finish = reject ? () => fail(new Error('handler failed')) : () => resolve('done'); }); });
      const pending = sockets[0].message(rpc ? { jsonrpc: '2.0', id: 9, method: 'create_note' } : { id: 9, action: 'create_note' });
      client.reconnect(); sockets[1].open(); finish(); await pending;
      assert.equal(sockets[0].sent.length, 0);
      assert.equal(sockets[1].sent.length, 0);
      assert.equal(calls, 1, 'mutation must not be replayed');
      client.disconnect();
    });
  }
  test(`${rpc ? 'JSONRPC' : 'custom'} send failure is contained without a second response or mutation retry`, async () => {
    const { client, sockets, logs } = setup();
    let calls = 0;
    client.setMessageHandler(async () => { calls++; return 'ok'; });
    sockets[0].failSend = true;
    await sockets[0].message(rpc ? { jsonrpc: '2.0', id: 3, method: 'create_note' } : { id: 3, action: 'create_note' });
    assert.equal(calls, 1);
    assert.equal(sockets[0].sendAttempts, 1);
    assert.ok(logs.some(([message, level]) => level === 'error' && message.includes('send')));
    client.disconnect();
  });
}

test('active request formats, errors, notifications and ping preserve their wire protocol', async () => {
  const { client, sockets } = setup();
  client.setMessageHandler(async request => { if (request.action === 'fail') throw new Error('no'); return request.payload; });
  await sockets[0].message({ id: 0, action: 'read', payload: { x: 1 } });
  await sockets[0].message({ jsonrpc: '2.0', id: 2, method: 'read', params: { y: 2 } });
  await sockets[0].message({ id: 3, action: 'fail' });
  await sockets[0].message({ jsonrpc: '2.0', id: 4, method: 'fail' });
  await sockets[0].message({ action: 'read' });
  await sockets[0].message({ jsonrpc: '2.0', method: 'read' });
  await sockets[0].message({ type: 'ping' });
  assert.deepEqual(sockets[0].sent, [
    { id: 0, result: { x: 1 } }, { jsonrpc: '2.0', id: 2, result: { y: 2 } },
    { id: 3, error: 'no' }, { jsonrpc: '2.0', id: 4, error: { code: -32000, message: 'no' } }, { type: 'pong' }
  ]);
  client.disconnect();
});

test('reconnection has a single timer, clears it on manual connect and clears fired timer ownership', () => {
  const { client, sockets, timers } = setup();
  sockets[0].readyState = 3;
  sockets[0].onclose({ code: 1006, reason: '' });
  sockets[0].onclose({ code: 1006, reason: '' });
  assert.equal(timers.size, 1);
  client.connect();
  assert.equal(timers.size, 0);
  sockets[1].open(); sockets[1].readyState = 3;
  sockets[1].onclose({ code: 1006, reason: '' });
  const [id, callback] = [...timers][0]; timers.delete(id); callback();
  assert.equal(client.reconnectTimeout, null);
  sockets[2].open();
  client.disconnect();
  assert.equal(timers.size, 0);
  sockets[2].onclose({ code: 1000, reason: '' });
  assert.equal(timers.size, 0);
});

test('disconnect drops an in-flight response and ping send exceptions do not escape', async () => {
  const { client, sockets } = setup();
  let finish;
  client.setMessageHandler(() => new Promise(resolve => { finish = resolve; }));
  const pending = sockets[0].message({ id: 1, action: 'create_note' });
  client.disconnect(); finish('done'); await pending;
  assert.equal(sockets[0].sent.length, 0);
  client.connect(); sockets[1].open(); sockets[1].failSend = true;
  await sockets[1].message({ type: 'ping' });
  assert.equal(sockets[1].sendAttempts, 1);
  client.disconnect();
});
