'use strict';

// This is a browser request boundary, not authentication against local processes.
// Keep the list exact: URL normalization must not turn a lookalike into permission.
const allowedOrigins = new Set(['app://js']);
for (const host of ['localhost', '127.0.0.1']) {
  for (const port of [8080, 8082, 8083, 8084, 8085]) {
    allowedOrigins.add(`http://${host}:${port}`);
  }
}
const securityHeaders = new Set([
  'host', 'origin', 'content-type', 'x-remnote-key',
  'access-control-request-method', 'access-control-request-headers'
]);
const loopbackPeers = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
// RemNote runs plugins in sandboxed iframes, so their requests carry `Origin: null`.
// Any web page can produce that origin too, so it is never trusted by itself:
// the request must also prove the plugin's pairing key (the same key the control
// core gateway paired with). The WebSocket handshake passes it as `?key=`, HTTP
// as the `X-RemNote-Key` header. Only a verified loopback socket, the exact Host
// and these routes are eligible; CORS then echoes `null`, never `*`.
// Preflights carry no custom headers, so they are answered without the key but
// never run an action. Eligibility depends on the listener role (WebSocket or
// these HTTP routes), not on fixed port numbers, so configured ports keep working.
const nullOriginHttpRoutes = new Set([
  'GET /health', 'GET /events', 'POST /call',
  'OPTIONS /health', 'OPTIONS /events', 'OPTIONS /call'
]);
const allowedPreflightHeaders = new Set(['content-type', 'x-remnote-key']);

function presentedKey(req, headers, websocket) {
  if (!websocket) return headers['x-remnote-key'];
  try {
    return new URL(req.url, 'http://127.0.0.1').searchParams.get('key') ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Evaluate before HTTP body parsing/dispatch or WebSocket upgrade.
 * `port` is the actual receiving listener port, not a caller-supplied Host value.
 * Apply corsHeaders to every response, but never add wildcard CORS elsewhere.
 * An allowed preflight must end with 204 without invoking the action handler.
 */
function evaluateBridgeRequest(req, { port, websocket = false, verifyPluginKey } = {}) {
  let corsHeaders = {};
  const reject = (statusCode, reason) => ({
    allowed: false, statusCode, reason, corsHeaders, preflight: false
  });
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return reject(403, 'Invalid listener port.');
  }
  const headers = req?.headers || {};
  const seen = new Set();
  if (Array.isArray(req?.rawHeaders)) {
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const name = String(req.rawHeaders[i]).toLowerCase();
      if (!securityHeaders.has(name)) continue;
      if (seen.has(name)) return reject(403, 'Duplicate security header.');
      seen.add(name);
    }
  }
  const peer = req?.socket?.remoteAddress;
  if (peer !== undefined && !loopbackPeers.has(peer)) {
    return reject(403, 'Loopback clients only.');
  }
  const host = headers.host;
  const hostMatch = typeof host === 'string'
    && /^(localhost|127\.0\.0\.1|\[::1\]):([1-9][0-9]*)$/i.exec(host);
  if (!hostMatch || hostMatch[2] !== String(port)) {
    return reject(403, 'Invalid bridge Host.');
  }
  const origin = headers.origin;
  const target = req?.url;
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//')
      || /[\\\x00-\x20\x7f]/.test(target)) {
    return reject(400, 'Invalid request target.');
  }
  let pathname;
  try {
    pathname = new URL(target, 'http://127.0.0.1').pathname;
  } catch {
    return reject(400, 'Invalid request target.');
  }
  if (origin !== undefined) {
    const verifiedLoopback = peer !== undefined && loopbackPeers.has(peer);
    const sandboxedPlugin = origin === 'null' && verifiedLoopback
      && (websocket === true || nullOriginHttpRoutes.has(`${req.method} ${pathname}`));
    if (!sandboxedPlugin && (typeof origin !== 'string' || !allowedOrigins.has(origin))) {
      return reject(403, 'Origin is not allowed.');
    }
    if (sandboxedPlugin && req.method !== 'OPTIONS') {
      const key = presentedKey(req, headers, websocket);
      if (typeof verifyPluginKey !== 'function' || typeof key !== 'string' || !verifyPluginKey(key)) {
        return reject(403, 'Sandboxed requests need the paired plugin key.');
      }
    }
    // A WebSocket handshake has no CORS response; HTTP echoes the exact origin.
    if (!(sandboxedPlugin && websocket === true)) {
      corsHeaders = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
    }
  }
  if (websocket) {
    if (req.method !== 'GET') return reject(405, 'WebSocket handshake requires GET.');
    return { allowed: true, statusCode: 200, reason: '', corsHeaders, preflight: false };
  }
  if (req.method === 'OPTIONS') {
    if (origin === undefined) return reject(403, 'Preflight requires an allowed Origin.');
    if (!['GET', 'POST'].includes(headers['access-control-request-method'])) {
      return reject(405, 'Unsupported preflight method.');
    }
    const requestedHeaders = headers['access-control-request-headers'];
    if (requestedHeaders !== undefined && (typeof requestedHeaders !== 'string'
        || (requestedHeaders !== '' && requestedHeaders.split(',')
          .some((name) => !allowedPreflightHeaders.has(name.trim().toLowerCase()))))) {
      return reject(403, 'Unsupported preflight header.');
    }
    corsHeaders = {
      ...corsHeaders,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-RemNote-Key'
    };
    return { allowed: true, statusCode: 204, reason: '', corsHeaders, preflight: true };
  }
  if (req.method === 'POST' && pathname === '/call') {
    const contentType = headers['content-type'];
    if (typeof contentType !== 'string'
        || !/^application\/json(?:\s*;[^\r\n,]*)?$/i.test(contentType)) {
      return reject(415, 'POST /call requires application/json.');
    }
  }
  return { allowed: true, statusCode: 200, reason: '', corsHeaders, preflight: false };
}

module.exports = { evaluateBridgeRequest };
