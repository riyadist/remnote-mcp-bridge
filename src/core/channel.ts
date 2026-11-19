// Connection from the plugin's control core to the local gateway.
// The plugin keeps a random pairing key in its own device-local storage and
// presents it in a "hello" message. The gateway accepts a new key only while
// the user has opened a pairing window on this computer (Start-RemNoteServices
// -Pair); otherwise only already paired keys are accepted. The key is sent
// only to the local gateway and the local bridge host.
import type { ReactRNPlugin, RNPlugin } from '@remnote/plugin-sdk';
import { CoreExecutor, CORE_VERSION } from './executor';

const KEY_STORAGE = 'remnote-core-pairing-key-v1';
export const CORE_GATEWAY_URL = 'ws://127.0.0.1:3411';

function randomKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function readStoredKey(plugin: RNPlugin): Promise<string | null> {
  const stored = await plugin.storage.getLocal<string>(KEY_STORAGE);
  return typeof stored === 'string' && /^[0-9a-f]{64}$/.test(stored) ? stored : null;
}

// Only the plugin's main (index) frame may create the key, and only once per
// frame: concurrent creators (other widgets, parallel callers) could otherwise
// store different keys and lock the plugin out of its own pairing.
let creating: Promise<string> | null = null;

export function ensurePairingKey(plugin: RNPlugin): Promise<string> {
  if (!creating) {
    creating = (async () => {
      const existing = await readStoredKey(plugin);
      if (existing) return existing;
      const key = randomKey();
      await plugin.storage.setLocal(KEY_STORAGE, key);
      return key;
    })().catch((error) => { creating = null; throw error; });
  }
  return creating;
}

// Widgets read the key the main frame created; they wait briefly on first run.
export async function getPairingKey(plugin: RNPlugin, timeoutMs = 15000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const key = await readStoredKey(plugin);
    if (key) return key;
    if (Date.now() >= deadline) throw new Error('RemNote plugin pairing key is not available yet');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export type CoreStatus = 'stopped' | 'connecting' | 'connected' | 'unauthorized' | 'standby';

export class CoreChannel {
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private stopped = true;
  private executor: CoreExecutor;
  status: CoreStatus = 'stopped';

  constructor(private plugin: ReactRNPlugin, private onStatus: (status: CoreStatus) => void = () => {}, private url = CORE_GATEWAY_URL) {
    this.executor = new CoreExecutor(plugin);
  }

  private setStatus(status: CoreStatus) {
    if (this.status !== status) { this.status = status; this.onStatus(status); }
  }

  start() {
    this.stopped = false;
    void this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(1000, 'plugin stopping'); } catch { /* already closed */ }
    this.setStatus('stopped');
  }

  private schedule() {
    if (this.stopped || this.timer) return;
    const delay = Math.min(1000 * 2 ** this.attempts, 30000) * (1 + Math.random() * 0.3);
    this.attempts += 1;
    this.timer = setTimeout(() => { this.timer = null; void this.connect(); }, delay);
  }

  private async connect() {
    if (this.stopped || this.ws) return;
    this.setStatus('connecting');
    let key: string;
    try {
      key = await ensurePairingKey(this.plugin);
    } catch {
      this.schedule(); // storage not ready yet: try again later instead of dying
      return;
    }
    if (this.stopped || this.ws) return;
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.schedule();
      return;
    }
    this.ws = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', key, version: CORE_VERSION }));
    socket.onmessage = (event) => { void this.onMessage(socket, String(event.data)); };
    socket.onclose = (event) => {
      if (this.ws !== socket) return;
      this.ws = null;
      // 4401: this key is not paired; it can only succeed once the user opens a
      // pairing window, so retry at the slowest pace (about every 30 s).
      // 4409: another RemNote window holds the link; stand by and retry slowly.
      if (event.code === 4401) { this.setStatus('unauthorized'); this.attempts = 10; }
      else if (event.code === 4409) { this.setStatus('standby'); this.attempts = 10; }
      else this.setStatus('connecting');
      this.schedule();
    };
    socket.onerror = () => { /* onclose follows */ };
  }

  private send(socket: WebSocket, message: unknown) {
    if (this.ws !== socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  private async onMessage(socket: WebSocket, data: string) {
    let message: any;
    try { message = JSON.parse(data); } catch { return; }
    if (message?.type === 'welcome') { this.attempts = 0; this.setStatus('connected'); return; }
    if (message?.type === 'ping') { this.send(socket, { type: 'pong' }); return; }
    if (message?.type !== 'request' || typeof message.action !== 'string') return;
    try {
      const result = await this.executor.handle(message.action, message.payload || {});
      this.send(socket, { type: 'response', id: message.id, ok: true, result });
    } catch (e) {
      const err = e as any;
      this.send(socket, {
        type: 'response', id: message.id, ok: false,
        code: err.code || 'PLUGIN_ERROR', error: err.message || String(e),
        ...(err.details ? { details: err.details } : {}),
      });
    }
  }
}
