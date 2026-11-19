// Helpers for widgets and the legacy bridge connection: requests from this
// sandboxed plugin (Origin "null") must prove the plugin's pairing key.
import type { RNPlugin } from '@remnote/plugin-sdk';
import { ensurePairingKey, getPairingKey } from './channel';

export const PLUGIN_KEY_HEADER = 'X-RemNote-Key';

export async function pluginKeyHeaders(plugin: RNPlugin): Promise<Record<string, string>> {
  return { [PLUGIN_KEY_HEADER]: await getPairingKey(plugin) };
}

// For module-level helpers that have no plugin handle: the widget primes the key
// once on render, and every request awaits it.
let primed: Promise<string> | null = null;

export function primeHostKey(plugin: RNPlugin): void {
  if (!primed) primed = getPairingKey(plugin).catch((error) => { primed = null; throw error; });
}

export async function hostKeyHeaders(): Promise<Record<string, string>> {
  if (!primed) throw new Error('RemNote plugin key is not loaded yet');
  return { [PLUGIN_KEY_HEADER]: await primed };
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

// Used by the main (index) frame only, which owns key creation. The key is only
// ever attached to a loopback bridge URL: the WebSocket URL is a user setting,
// and the key must not travel to any other machine.
export async function withPluginKey(plugin: RNPlugin, wsUrl: string): Promise<string> {
  let url: URL;
  try { url = new URL(wsUrl); } catch { return wsUrl; }
  if (!LOOPBACK_HOSTS.has(url.hostname)) return wsUrl;
  try {
    url.searchParams.set('key', await ensurePairingKey(plugin));
  } catch {
    return wsUrl; // storage unavailable: connect without the key (the bridge will refuse) rather than fail activation
  }
  return url.toString();
}
