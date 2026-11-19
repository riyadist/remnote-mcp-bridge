'use strict';
const { randomUUID } = require('node:crypto');

/**
 * Owned WebSocket request transport. No I/O or timers start at import.
 * attach(ws, {path}) binds response identity and sends a JSON ping. A JSON
 * {type:'pong'} is required before selection (protocol-level pong is not proof
 * that the plugin's JS handler is responsive). request(action,payload,{timeoutMs})
 * never retries. onResponse({action,payload,result,error}) runs only for an
 * owned plugin response, allowing the host to preserve recordAction semantics.
 * onStateChange() lets the host broadcast health changes. The socket owner must
 * provide onDisconnect(ws, reason) to close/terminate a failed socket and allow
 * plugin reconnection. It runs after failure detach, not on close or dispose.
 * dispose() removes request/message listeners and timers; it never closes an
 * externally owned socket. A no-op error listener remains until actual close
 * (or reattachment), preventing late socket errors from crashing the host.
 */
function createBridgeTransport(options = {}) {
  const bounded = (value, fallback, label, maximum = 2147483647) => {
    const result = value === undefined ? fallback : value;
    if (!Number.isSafeInteger(result) || result <= 0 || result > maximum) throw new TypeError(`Invalid ${label}`);
    return result;
  };
  const requestTimeoutMs = bounded(options.requestTimeoutMs, 60000, 'requestTimeoutMs');
  const heartbeatIntervalMs = bounded(options.heartbeatIntervalMs, 10000, 'heartbeatIntervalMs');
  const heartbeatTimeoutMs = bounded(options.heartbeatTimeoutMs, 30000, 'heartbeatTimeoutMs');
  const maxPending = bounded(options.maxPending, 256, 'maxPending', 100000);
  const clients = new Map();
  const pending = new Map();
  const detachedGuards = new WeakMap();
  let disposed = false;
  function errorWithCode(message, code) { return Object.assign(new Error(message), { code }); }
  // Instrumentation must never strand requests or alter their results.
  function notify(callback, value) {
    try { callback?.(value); } catch { /* Host callback is observational only. */ }
  }
  function stateChanged() { notify(options.onStateChange); }
  function healthy(entry) {
    return entry.ws.readyState === 1 && entry.lastPongAt !== null && Date.now() - entry.lastPongAt < heartbeatTimeoutMs;
  }
  function settle(id, error, result) {
    const entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timeout);
    pending.delete(id);
    if (error) entry.reject(error); else entry.resolve(result);
  }
  function guardUntilClose(ws) {
    if (detachedGuards.has(ws) || ws.readyState === 3) return;
    const sink = () => {};
    const cleanup = () => {
      ws.removeListener('error', sink);
      ws.removeListener('close', cleanup);
      detachedGuards.delete(ws);
    };
    detachedGuards.set(ws, cleanup);
    ws.on('error', sink);
    ws.once('close', cleanup);
  }
  function detach(entry, reason, closed = false) {
    if (!entry || clients.get(entry.ws) !== entry) return;
    clients.delete(entry.ws);
    entry.ws.removeListener('message', entry.onMessage);
    entry.ws.removeListener('close', entry.onClose);
    entry.ws.removeListener('error', entry.onError);
    if (!closed) guardUntilClose(entry.ws);
    for (const [id, call] of pending) {
      if (call.owner === entry.ws) settle(id, errorWithCode(`Bridge outcome unknown (${reason}): ${call.action}`, 'BRIDGE_OUTCOME_UNKNOWN'));
    }
    if (!closed && !disposed) {
      try { options.onDisconnect?.(entry.ws, reason); } catch { /* Owner must handle its own shutdown failures. */ }
    }
    stateChanged();
  }
  function ping(entry) {
    try {
      entry.ws.send(JSON.stringify({ type: 'ping', path: entry.path }), error => {
        if (error) detach(entry, 'heartbeat send failed');
      });
    } catch { detach(entry, 'heartbeat send failed'); }
  }
  function attach(ws, { path = '/' } = {}) {
    if (disposed) throw errorWithCode('Bridge transport disposed.', 'BRIDGE_DISPOSED');
    if (clients.has(ws)) return;
    const entry = { ws, path, attachedAt: Date.now(), lastPongAt: null };
    entry.onClose = () => detach(entry, 'socket disconnected', true);
    entry.onError = () => detach(entry, 'socket error');
    entry.onMessage = raw => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (!message || typeof message !== 'object') return;
      if (message.type === 'pong') {
        const wasHealthy = healthy(entry);
        entry.lastPongAt = Date.now();
        if (!wasHealthy) stateChanged();
        return;
      }
      const call = pending.get(message.id);
      if (!call || call.owner !== ws) return;
      const error = typeof message.error === 'string' && message.error ? message.error : null;
      const result = Object.hasOwn(message, 'result') ? message.result : null;
      settle(message.id, error ? new Error(error) : null, result);
      notify(options.onResponse, { action: call.action, payload: call.payload, result, error });
    };
    clients.set(ws, entry);
    ws.on('message', entry.onMessage);
    ws.on('close', entry.onClose);
    ws.on('error', entry.onError);
    // Install the new error listener before removing the old safety guard.
    detachedGuards.get(ws)?.();
    ping(entry);
    stateChanged();
  }
  function getPrimaryClient() {
    for (const entry of clients.values()) if (healthy(entry)) return entry.ws;
    return null;
  }
  function getHealth() {
    let healthyClients = 0;
    for (const entry of clients.values()) if (healthy(entry)) healthyClients += 1;
    return { pluginConnected: healthyClients > 0, connectedClients: clients.size, healthyClients, pending: pending.size };
  }
  function request(action, payload = {}, requestOptions = {}) {
    return new Promise((resolve, reject) => {
      if (disposed) return reject(errorWithCode('Bridge transport disposed.', 'BRIDGE_DISPOSED'));
      const timeoutMs = bounded(requestOptions.timeoutMs, requestTimeoutMs, 'timeoutMs');
      if (pending.size >= maxPending) return reject(errorWithCode('Bridge pending request limit reached.', 'BRIDGE_BUSY'));
      const ws = getPrimaryClient();
      if (!ws) return reject(errorWithCode('No healthy RemNote plugin client.', 'BRIDGE_UNAVAILABLE'));
      const owner = clients.get(ws);
      const id = randomUUID();
      // Serialize before ownership/send: serialization failure cannot have applied a mutation.
      const normalizedPayload = payload || {};
      const encoded = JSON.stringify({ id, action, payload: normalizedPayload });
      const timeout = setTimeout(() => settle(id, errorWithCode(`Bridge outcome unknown (request timeout): ${action}`, 'BRIDGE_OUTCOME_UNKNOWN')), timeoutMs);
      pending.set(id, { owner: ws, resolve, reject, timeout, action, payload: normalizedPayload });
      try {
        ws.send(encoded, error => {
          if (error) detach(owner, 'request send failed');
        });
      } catch { detach(owner, 'request send failed'); }
    });
  }
  const heartbeat = setInterval(() => {
    for (const entry of clients.values()) {
      const freshnessAt = entry.lastPongAt ?? entry.attachedAt;
      if (entry.ws.readyState !== 1 || Date.now() - freshnessAt >= heartbeatTimeoutMs) detach(entry, 'heartbeat expired');
      else ping(entry);
    }
  }, heartbeatIntervalMs);
  heartbeat.unref?.();
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearInterval(heartbeat);
    for (const entry of clients.values()) detach(entry, 'transport disposed');
  }
  return { attach, request, getPrimaryClient, getHealth, dispose };
}

module.exports = { createBridgeTransport };
