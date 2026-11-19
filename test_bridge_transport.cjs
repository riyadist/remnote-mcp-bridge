'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createBridgeTransport } = require('./bridge-transport.cjs');

// All transport clocks are controlled: CPU scheduling must not age sockets
// between an awaited assertion and the next healthy-client assertion.
beforeEach(t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: 0 });
});

class FakeSocket extends EventEmitter {
  readyState = 1;
  sent = [];
  send(raw, callback) {
    this.sent.push(JSON.parse(raw));
    callback?.();
  }
  receive(message) { this.emit('message', Buffer.from(JSON.stringify(message))); }
  terminate() { this.readyState = 3; this.emit('close'); }
}
function setup(t, options = {}) {
  const transport = createBridgeTransport({ heartbeatIntervalMs: 10000, heartbeatTimeoutMs: 20000, ...options });
  t.after(() => transport.dispose());
  const socket = new FakeSocket();
  transport.attach(socket, { path: '/bridge' });
  socket.receive({ type: 'pong' });
  return { transport, socket };
}
function lastRequest(socket) { return socket.sent.findLast(message => message.id); }

test('response is accepted only from the socket owning its request', async t => {
  const responses = [];
  const { transport, socket } = setup(t, { onResponse: entry => responses.push(entry) });
  const other = new FakeSocket(); transport.attach(other); other.receive({ type: 'pong' });
  const result = transport.request('read_note', { remId: 'test' });
  const { id } = lastRequest(socket);
  other.receive({ id, result: 'spoof' });
  assert.equal(transport.getHealth().pending, 1);
  socket.receive({ id, result: 'correct' });
  assert.equal(await result, 'correct');
  assert.deepEqual(responses, [{ action: 'read_note', payload: { remId: 'test' }, result: 'correct', error: null }]);
});
for (const event of ['close', 'error']) {
  test(`${event} rejects owned pending immediately without retry`, async t => {
    const { transport, socket } = setup(t);
    const other = new FakeSocket(); transport.attach(other); other.receive({ type: 'pong' });
    const promise = transport.request('update_note', {});
    const rejection = assert.rejects(promise, error => error.code === 'BRIDGE_OUTCOME_UNKNOWN');
    socket.emit(event, new Error('dropped'));
    await rejection;
    assert.equal(transport.getHealth().pending, 0);
    assert.equal(other.sent.filter(message => message.id).length, 0);
    assert.equal(transport.getPrimaryClient(), other);
  });
}
test('request timeout is bounded and reports unknown outcome', async t => {
  const { transport, socket } = setup(t, { requestTimeoutMs: 15 });
  const rejection = assert.rejects(transport.request('update_note', {}), error => error.code === 'BRIDGE_OUTCOME_UNKNOWN');
  t.mock.timers.tick(14);
  assert.equal(transport.getHealth().pending, 1);
  t.mock.timers.tick(1);
  await rejection;
  assert.equal(transport.getHealth().pending, 0);
  assert.equal(socket.sent.filter(message => message.id).length, 1);
});
test('an open socket without application pong is not healthy', t => {
  const transport = createBridgeTransport(); t.after(() => transport.dispose());
  const socket = new FakeSocket(); transport.attach(socket);
  socket.emit('pong');
  assert.equal(transport.getPrimaryClient(), null);
  assert.equal(transport.getHealth().pluginConnected, false);
  socket.receive({ type: 'pong' });
  assert.equal(transport.getPrimaryClient(), socket);
});
test('missing application pong expires a socket and fails its pending call', async t => {
  const { transport, socket } = setup(t, { heartbeatIntervalMs: 5, heartbeatTimeoutMs: 15, requestTimeoutMs: 200 });
  socket.on('pong', () => {});
  const rejection = assert.rejects(transport.request('read_note', {}), error => error.code === 'BRIDGE_OUTCOME_UNKNOWN' && /heartbeat/i.test(error.message));
  assert.equal(socket.sent.filter(message => message.type === 'ping').length, 1);
  t.mock.timers.tick(5);
  assert.equal(socket.sent.filter(message => message.type === 'ping').length, 2);
  assert.equal(transport.getHealth().pending, 1);
  assert.equal(transport.getHealth().pluginConnected, true);
  // WebSocket protocol pongs cannot refresh application-level freshness.
  socket.emit('pong');
  t.mock.timers.tick(5);
  assert.equal(socket.sent.filter(message => message.type === 'ping').length, 3);
  assert.equal(transport.getHealth().pending, 1);
  assert.equal(transport.getHealth().pluginConnected, true);
  t.mock.timers.tick(5);
  await rejection;
  assert.equal(transport.getHealth().pluginConnected, false);
  assert.equal(transport.getHealth().pending, 0);
  assert.equal(socket.sent.filter(message => message.type === 'ping').length, 3);
});
test('send callback failure is unknown and removes the unhealthy client', async t => {
  const { transport, socket } = setup(t);
  socket.send = (_raw, callback) => callback(new Error('send failed'));
  await assert.rejects(transport.request('create_note', {}), error => error.code === 'BRIDGE_OUTCOME_UNKNOWN');
  assert.equal(transport.getHealth().pending, 0);
  assert.equal(transport.getPrimaryClient(), null);
});
test('plugin error remains a plugin error and callback records its action', async t => {
  const responses = [];
  const { transport, socket } = setup(t, { onResponse: value => responses.push(value) });
  const promise = transport.request('read_note', {});
  socket.receive({ id: lastRequest(socket).id, error: 'not found' });
  await assert.rejects(promise, /not found/);
  assert.equal(responses[0].error, 'not found');
});
test('dispose rejects pending without closing externally owned sockets and guards errors until close', async t => {
  let disconnects = 0;
  const { transport, socket } = setup(t, { onDisconnect() { disconnects += 1; } });
  const promise = transport.request('read_note', {});
  const rejection = assert.rejects(promise, error => error.code === 'BRIDGE_OUTCOME_UNKNOWN');
  transport.dispose(); await rejection;
  assert.equal(socket.listenerCount('message'), 0);
  assert.equal(socket.readyState, 1);
  assert.equal(disconnects, 0);
  assert.doesNotThrow(() => socket.emit('error', new Error('late after disposal')));
  socket.terminate();
  for (const event of ['message', 'error', 'close']) assert.equal(socket.listenerCount(event), 0);
  assert.deepEqual(transport.getHealth(), { pluginConnected: false, connectedClients: 0, healthyClients: 0, pending: 0 });
  await assert.rejects(transport.request('read_note', {}), error => error.code === 'BRIDGE_DISPOSED');
});
test('queue and per-request timeout are bounded without sending rejected calls', async t => {
  const { transport, socket } = setup(t, { maxPending: 1 });
  const first = transport.request('read_note', {});
  await assert.rejects(transport.request('read_note', {}), error => error.code === 'BRIDGE_BUSY');
  assert.equal(socket.sent.filter(message => message.id).length, 1);
  socket.receive({ id: lastRequest(socket).id, result: null }); await first;
  await assert.rejects(transport.request('read_note', {}, { timeoutMs: Infinity }), /timeoutMs/);
});
test('late send callback after disposal cannot throw or settle twice', async t => {
  const { transport, socket } = setup(t);
  let callback;
  socket.send = (_raw, cb) => { callback = cb; };
  const promise = transport.request('read_note', {});
  const rejection = assert.rejects(promise, error => error.code === 'BRIDGE_OUTCOME_UNKNOWN');
  transport.dispose(); await rejection;
  assert.doesNotThrow(() => callback(new Error('late failure')));
});
test('malformed input, duplicates and observer failures do not strand calls', async t => {
  const { transport, socket } = setup(t, { onResponse() { throw new Error('observer'); } });
  socket.emit('message', Buffer.from('not json')); socket.receive(null);
  const promise = transport.request('read_note', {});
  const response = { id: lastRequest(socket).id, result: 42 };
  socket.receive(response); socket.receive(response);
  assert.equal(await promise, 42);
  assert.equal(transport.getHealth().pending, 0);
});
test('a previous attachment send callback cannot evict a reattached socket', async t => {
  const { transport, socket } = setup(t);
  let callback;
  const send = socket.send;
  socket.send = (_raw, cb) => { callback = cb; };
  const promise = transport.request('read_note', {});
  const rejection = assert.rejects(promise, error => error.code === 'BRIDGE_OUTCOME_UNKNOWN');
  socket.emit('close'); await rejection;
  socket.send = send; transport.attach(socket); socket.receive({ type: 'pong' });
  callback(new Error('old send failure'));
  assert.equal(transport.getPrimaryClient(), socket);
});
test('heartbeat failure notifies socket owner so a plugin can close and reconnect', async t => {
  const disconnected = [];
  let replacement;
  const { transport, socket } = setup(t, {
    heartbeatIntervalMs: 5, heartbeatTimeoutMs: 15, requestTimeoutMs: 200,
    onDisconnect(ws, reason) {
      disconnected.push(reason);
      assert.doesNotThrow(() => ws.emit('error', new Error('late before close')));
      ws.terminate();
      replacement = new FakeSocket();
      transport.attach(replacement); replacement.receive({ type: 'pong' });
    }
  });
  const rejection = assert.rejects(transport.request('read_note', {}), error => error.code === 'BRIDGE_OUTCOME_UNKNOWN');
  t.mock.timers.tick(5);
  t.mock.timers.tick(5);
  assert.equal(transport.getHealth().pending, 1);
  assert.equal(transport.getPrimaryClient(), socket);
  t.mock.timers.tick(5);
  await rejection;
  assert.equal(socket.readyState, 3);
  assert.equal(socket.listenerCount('error'), 0);
  assert.deepEqual(disconnected, ['heartbeat expired']);
  assert.equal(transport.getPrimaryClient(), replacement);
  const result = transport.request('read_note', {});
  replacement.receive({ id: lastRequest(replacement).id, result: 'recovered' });
  assert.equal(await result, 'recovered');
});
test('error detach retains a safe sink until actual close and disconnects once', t => {
  let disconnects = 0;
  const { transport, socket } = setup(t, { onDisconnect() { disconnects += 1; } });
  socket.emit('error', new Error('initial'));
  assert.doesNotThrow(() => socket.emit('error', new Error('late')));
  assert.equal(disconnects, 1);
  assert.equal(transport.getHealth().connectedClients, 0);
  socket.terminate();
  assert.equal(socket.listenerCount('error'), 0);
  assert.equal(socket.listenerCount('close'), 0);
});
