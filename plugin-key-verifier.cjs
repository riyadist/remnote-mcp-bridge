'use strict';
// Verifies the RemNote plugin's pairing key for requests from sandboxed plugin
// iframes (Origin "null"). The pairing record belongs to the RemNote core gateway
// (remnote-core, src/gateway/pairing.js): only SHA-256 hashes in the user's
// profile. This host never pairs new keys itself — pairing happens only through
// the gateway while a pairing window is explicitly open — so a web page cannot
// pair itself through this host.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const HEX64 = /^[0-9a-f]{64}$/;

function defaultPairingFile(env = process.env) {
  const base = env.LOCALAPPDATA || path.join(env.USERPROFILE || env.HOME || '.', 'AppData', 'Local');
  const home = env.REMNOTE_CORE_HOME || path.join(base, 'RemNoteCore');
  return path.join(home, 'plugin-pairing.json');
}

function createPluginKeyVerifier({ pairingFile = defaultPairingFile() } = {}) {
  let cache = { mtimeMs: -1, hashes: [] };

  function readHashes() {
    let stat;
    try { stat = fs.statSync(pairingFile); } catch { cache = { mtimeMs: -1, hashes: [] }; return []; }
    if (stat.mtimeMs === cache.mtimeMs) return cache.hashes;
    try {
      const data = JSON.parse(fs.readFileSync(pairingFile, 'utf8'));
      const list = Array.isArray(data.keyHashes) ? data.keyHashes : (data.keyHash ? [data.keyHash] : []);
      const hashes = list.every((h) => typeof h === 'string' && HEX64.test(h)) ? list : [];
      cache = { mtimeMs: stat.mtimeMs, hashes };
      return hashes;
    } catch {
      return [];
    }
  }

  return function verifyPluginKey(key) {
    if (typeof key !== 'string' || !HEX64.test(key)) return false;
    const presented = Buffer.from(crypto.createHash('sha256').update(key).digest('hex'), 'hex');
    return readHashes().some((h) => {
      const stored = Buffer.from(h, 'hex');
      return stored.length === presented.length && crypto.timingSafeEqual(stored, presented);
    });
  };
}

module.exports = { createPluginKeyVerifier, defaultPairingFile };
