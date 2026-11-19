'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateBridgeRequest } = require('./bridge-request-policy.cjs');

function request(headers = {}, extra = {}) {
  return { method: 'GET', url: '/health', headers: { host: '127.0.0.1:3400', ...headers }, ...extra };
}
const check = (req, options = {}) => evaluateBridgeRequest(req, { port: 3400, ...options });

test('accepts native loopback clients without inventing CORS permission', () => {
  for (const host of ['127.0.0.1:3400', 'localhost:3400', 'LOCALHOST:3400', '[::1]:3400']) {
    const result = check(request({ host }));
    assert.equal(result.allowed, true, host);
    assert.deepEqual(result.corsHeaders, {});
  }
});

test('rejects foreign, missing, ambiguous and malformed Host headers', () => {
  for (const host of [undefined, '', 'evil.example:3400', '127.0.0.1:9999', 'localhost',
    'localhost:03400', 'localhost:3400.evil', 'localhost.evil:3400', '127.1:3400',
    '2130706433:3400', '0x7f000001:3400', '127.0.0.2:3400', 'localhost.:3400',
    'user@localhost:3400', ' localhost:3400', 'localhost:3400 ', 'localhost:3400/path',
    'localhost:3400,evil:3400', ['localhost:3400'], 'localhost:3400\r\nX: y']) {
    const result = check(request({ host }));
    assert.equal(result.allowed, false, String(host));
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.corsHeaders, {});
  }
});

test('accepts only exact known plugin origins and desktop app origin', () => {
  const origins = ['app://js'];
  for (const host of ['localhost', '127.0.0.1']) {
    for (const port of [8080, 8082, 8083, 8084, 8085]) origins.push(`http://${host}:${port}`);
  }
  for (const origin of origins) {
    const result = check(request({ origin }));
    assert.equal(result.allowed, true, origin);
    assert.equal(result.corsHeaders['Access-Control-Allow-Origin'], origin);
    assert.equal(result.corsHeaders.Vary, 'Origin');
    assert.equal(Object.values(result.corsHeaders).includes('*'), false);
  }
});

test('rejects opaque, foreign, malformed and near-match origins', () => {
  for (const origin of ['null', '', 'https://www.remnote.com', 'https://remnote.com',
    'https://evil.example', 'http://localhost:8081', 'http://localhost:3400',
    'http://localhost:8080/', 'http://localhost:8080/path', 'http://localhost:8080?x',
    'http://localhost:8080#x', 'http://localhost:8080.evil', 'http://localhost.evil:8080',
    'http://user@localhost:8080', 'http://127.1:8080', 'http://2130706433:8080',
    'http://[::1]:8080', 'https://localhost:8080', 'app://js/', 'app://js.evil',
    ' app://js', 'app://js ', 'app://js\r\nX: y', ['app://js'], 'app://js http://evil.example']) {
    const result = check(request({ origin }));
    assert.equal(result.allowed, false, String(origin));
    assert.deepEqual(result.corsHeaders, {});
  }
});

test('rejects duplicate security headers even if Node collapsed their values', () => {
  for (const header of ['Host', 'Origin', 'Content-Type']) {
    const result = check(request({}, { rawHeaders: [header, 'a', header.toLowerCase(), 'b'] }));
    assert.equal(result.allowed, false, header);
  }
});

test('requires JSON for native and browser POST /call including query strings', () => {
  for (const origin of [undefined, 'app://js']) {
    for (const contentType of [undefined, '', 'text/plain', 'application/x-www-form-urlencoded',
      'multipart/form-data', 'application/jsonp', 'text/json', ['application/json'], 'application/json, text/plain']) {
      const result = check(request({ ...(origin ? { origin } : {}), 'content-type': contentType },
        { method: 'POST', url: '/call?trace=1' }));
      assert.equal(result.allowed, false, String(contentType));
      assert.equal(result.statusCode, 415);
    }
    for (const contentType of ['application/json', 'application/json; charset=utf-8', 'Application/JSON; charset=UTF-8']) {
      assert.equal(check(request({ ...(origin ? { origin } : {}), 'content-type': contentType },
        { method: 'POST', url: '/call' })).allowed, true);
    }
  }
});

test('does not require JSON for read endpoints or preflight', () => {
  assert.equal(check(request()).allowed, true);
  const result = check(request({ origin: 'app://js', 'access-control-request-method': 'POST',
    'access-control-request-headers': 'content-type' }, { method: 'OPTIONS', url: '/call' }));
  assert.equal(result.allowed, true);
  assert.equal(result.preflight, true);
  assert.equal(result.statusCode, 204);
  assert.equal(result.corsHeaders['Access-Control-Allow-Headers'], 'Content-Type, X-RemNote-Key');
  assert.equal(result.corsHeaders['Access-Control-Allow-Methods'], 'GET,POST,OPTIONS');
});

test('preflight rejects unsupported methods and headers without reflecting them', () => {
  for (const method of ['DELETE', 'PUT', 'PATCH', 'post', '', undefined, ['POST']]) {
    assert.equal(check(request({ origin: 'app://js', 'access-control-request-method': method },
      { method: 'OPTIONS' })).allowed, false, String(method));
  }
  for (const headers of ['authorization', 'x-unreviewed', 'content-type, authorization', '*',
    ['content-type'], 'content-type\r\nx-bad', 'content-type,']) {
    const result = check(request({ origin: 'app://js', 'access-control-request-method': 'POST',
      'access-control-request-headers': headers }, { method: 'OPTIONS' }));
    assert.equal(result.allowed, false, String(headers));
    assert.equal(result.corsHeaders['Access-Control-Allow-Headers'], undefined);
  }
  assert.equal(check(request({ 'access-control-request-method': 'POST' }, { method: 'OPTIONS' })).allowed, false);
});

test('preflight permits absent header lists and case-insensitive Content-Type', () => {
  for (const headers of [undefined, '', 'Content-Type', 'content-TYPE', ' content-type ']) {
    assert.equal(check(request({ origin: 'http://localhost:8080', 'access-control-request-method': 'GET',
      ...(headers === undefined ? {} : { 'access-control-request-headers': headers }) },
    { method: 'OPTIONS' })).allowed, true, String(headers));
  }
});

test('WebSocket handshake uses the same Host and Origin boundary and its own port', () => {
  const options = { port: 3401, websocket: true };
  assert.equal(check(request({ host: '127.0.0.1:3401', origin: 'app://js' }), options).allowed, true);
  assert.equal(check(request({ host: '127.0.0.1:3401' }), options).allowed, true);
  assert.equal(check(request({ origin: 'app://js' }), options).allowed, false);
  assert.equal(check(request({ host: '127.0.0.1:3401', origin: 'https://evil.example' }), options).allowed, false);
  assert.equal(check(request({ host: '127.0.0.1:3401' }, { method: 'POST' }), options).allowed, false);
});

const KEY = 'a'.repeat(64);
const verifyPluginKey = (key) => key === KEY;

test('sandboxed Origin null WebSocket needs the paired key and loopback', () => {
  const ws = { port: 3401, websocket: true, verifyPluginKey };
  const keyed = `/?key=${KEY}`;
  for (const remoteAddress of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    const result = check(request({ host: '127.0.0.1:3401', origin: 'null' }, { socket: { remoteAddress }, url: keyed }), ws);
    assert.equal(result.allowed, true, remoteAddress);
    assert.deepEqual(result.corsHeaders, {});
  }
  const loopback = { socket: { remoteAddress: '127.0.0.1' } };
  // Without or with a wrong key, any web page could open this socket: refused.
  assert.equal(check(request({ host: '127.0.0.1:3401', origin: 'null' }, loopback), ws).allowed, false);
  assert.equal(check(request({ host: '127.0.0.1:3401', origin: 'null' }, { ...loopback, url: `/?key=${'b'.repeat(64)}` }), ws).allowed, false);
  assert.equal(check(request({ host: '127.0.0.1:3401', origin: 'null' }, { ...loopback, url: keyed }), { port: 3401, websocket: true }).allowed, false, 'no verifier = closed');
  // Missing socket metadata, foreign peers, wrong Host, other ports and non-GET stay rejected.
  assert.equal(check(request({ host: '127.0.0.1:3401', origin: 'null' }, { url: keyed }), ws).allowed, false);
  assert.equal(check(request({ host: '127.0.0.1:3401', origin: 'null' }, { socket: { remoteAddress: '192.168.1.5' }, url: keyed }), ws).allowed, false);
  assert.equal(check(request({ host: 'evil.example:3401', origin: 'null' }, { ...loopback, url: keyed }), ws).allowed, false);
  assert.equal(check(request({ host: '127.0.0.1:3402', origin: 'null' }, { ...loopback, url: keyed }), { port: 3402, websocket: true, verifyPluginKey }).allowed, true, 'configured ports work with the key');
  assert.equal(check(request({ host: '127.0.0.1:3402', origin: 'null' }, loopback), { port: 3402, websocket: true, verifyPluginKey }).allowed, false);
  assert.equal(check(request({ host: '127.0.0.1:3401', origin: 'null' }, { ...loopback, url: keyed, method: 'POST' }), ws).allowed, false);
  for (const origin of ['NULL', ' null', 'null ', ['null']]) {
    assert.equal(check(request({ host: '127.0.0.1:3401', origin }, { ...loopback, url: keyed }), ws).allowed, false, String(origin));
  }
});

test('sandboxed Origin null HTTP needs X-RemNote-Key on /health, /events and JSON /call', () => {
  const loopback = { socket: { remoteAddress: '127.0.0.1' } };
  const opts = { verifyPluginKey };
  const nullCors = { 'Access-Control-Allow-Origin': 'null', Vary: 'Origin' };
  for (const url of ['/health', '/events', '/health?x=1']) {
    const result = check(request({ origin: 'null', 'x-remnote-key': KEY }, { ...loopback, url }), opts);
    assert.equal(result.allowed, true, url);
    assert.deepEqual(result.corsHeaders, nullCors);
    assert.equal(check(request({ origin: 'null' }, { ...loopback, url }), opts).allowed, false, `${url} without key`);
    assert.equal(check(request({ origin: 'null', 'x-remnote-key': 'b'.repeat(64) }, { ...loopback, url }), opts).allowed, false, `${url} wrong key`);
  }
  const call = check(request({ origin: 'null', 'content-type': 'application/json', 'x-remnote-key': KEY }, { ...loopback, method: 'POST', url: '/call' }), opts);
  assert.equal(call.allowed, true);
  assert.deepEqual(call.corsHeaders, nullCors);
  assert.equal(check(request({ origin: 'null', 'content-type': 'application/json' }, { ...loopback, method: 'POST', url: '/call' }), opts).allowed, false, 'call without key');
  assert.equal(check(request({ origin: 'null', 'content-type': 'application/json', 'x-remnote-key': KEY }, { ...loopback, method: 'POST', url: '/call' })).allowed, false, 'no verifier = closed');
  // POST /call still requires JSON.
  const plain = check(request({ origin: 'null', 'content-type': 'text/plain', 'x-remnote-key': KEY }, { ...loopback, method: 'POST', url: '/call' }), opts);
  assert.equal(plain.allowed, false);
  assert.equal(plain.statusCode, 415);
  // Preflights carry no custom header; they are answered but never run an action.
  for (const url of ['/call', '/health', '/events']) {
    const preflight = check(request({ origin: 'null', 'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type, x-remnote-key' }, { ...loopback, method: 'OPTIONS', url }), opts);
    assert.equal(preflight.allowed, true, url);
    assert.equal(preflight.statusCode, 204);
    assert.equal(preflight.preflight, true);
    assert.equal(preflight.corsHeaders['Access-Control-Allow-Origin'], 'null');
    assert.match(preflight.corsHeaders['Access-Control-Allow-Headers'], /X-RemNote-Key/);
  }
  assert.equal(check(request({ origin: 'null', 'access-control-request-method': 'DELETE' },
    { ...loopback, method: 'OPTIONS', url: '/call' }), opts).allowed, false);
  assert.equal(check(request({ origin: 'null', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' },
    { ...loopback, method: 'OPTIONS', url: '/call' }), opts).allowed, false);
  // Other routes, methods, ports, missing/foreign peers and wrong Host stay rejected even with the key.
  for (const [method, url] of [['GET', '/events/stream'], ['GET', '/local-file'], ['GET', '/call'],
    ['POST', '/health'], ['GET', '/'], ['GET', '/healthz']]) {
    assert.equal(check(request({ origin: 'null', 'content-type': 'application/json', 'x-remnote-key': KEY },
      { ...loopback, method, url }), opts).allowed, false, `${method} ${url}`);
  }
  assert.equal(check(request({ origin: 'null', 'x-remnote-key': KEY }), opts).allowed, false);
  assert.equal(check(request({ origin: 'null', 'x-remnote-key': KEY }, { socket: { remoteAddress: '192.168.1.5' } }), opts).allowed, false);
  assert.equal(check(request({ host: 'evil.example:3400', origin: 'null', 'x-remnote-key': KEY }, loopback), opts).allowed, false);
  assert.equal(check(request({ host: '127.0.0.1:3402', origin: 'null', 'x-remnote-key': KEY }, loopback), { port: 3402, verifyPluginKey }).allowed, true, 'configured ports work with the key');
  assert.equal(check(request({ host: '127.0.0.1:3402', origin: 'null' }, loopback), { port: 3402, verifyPluginKey }).allowed, false);
  for (const origin of ['NULL', ' null', 'null ', ['null']]) {
    assert.equal(check(request({ origin, 'x-remnote-key': KEY }, loopback), opts).allowed, false, String(origin));
  }
});

test('requests without Origin (local programs) do not need the plugin key', () => {
  assert.equal(check(request({}, { socket: { remoteAddress: '127.0.0.1' } })).allowed, true);
  assert.equal(check(request({ 'content-type': 'application/json' }, { method: 'POST', url: '/call' })).allowed, true);
});

test('rejects foreign network peers when socket metadata is provided', () => {
  for (const remoteAddress of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    assert.equal(check(request({}, { socket: { remoteAddress } })).allowed, true);
  }
  for (const remoteAddress of ['192.168.1.5', '8.8.8.8', '::ffff:8.8.8.8']) {
    assert.equal(check(request({}, { socket: { remoteAddress } })).allowed, false);
  }
});

test('rejects malformed request targets and invalid configured ports without throwing', () => {
  for (const url of ['http://evil.example/call', '//evil.example/call', '/\\evil/call', '/call\r\nX: y', 'call']) {
    assert.equal(check(request({}, { url })).allowed, false, url);
  }
  for (const port of [undefined, 0, -1, 65536, NaN, '3400', 3400.5]) {
    assert.equal(evaluateBridgeRequest(request(), { port }).allowed, false, String(port));
  }
});
