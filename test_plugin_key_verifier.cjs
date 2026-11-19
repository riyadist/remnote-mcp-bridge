'use strict';
// The legacy host verifies plugin keys against the gateway's pairing file and
// never pairs a key itself.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createPluginKeyVerifier } = require('./plugin-key-verifier.cjs');

const hash = (k) => crypto.createHash('sha256').update(k).digest('hex');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remnote-key-'));
  const file = path.join(dir, 'plugin-pairing.json');
  return { dir, file, verify: createPluginKeyVerifier({ pairingFile: file }) };
}

test('unpaired: every key is refused and nothing is written', () => {
  const { dir, file, verify } = setup();
  try {
    assert.equal(verify('a'.repeat(64)), false);
    assert.equal(fs.existsSync(file), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('paired keys (list and legacy single form) pass; others and malformed keys fail', () => {
  const { dir, file, verify } = setup();
  try {
    fs.writeFileSync(file, JSON.stringify({ keyHashes: [hash('a'.repeat(64)), hash('c'.repeat(64))] }));
    assert.equal(verify('a'.repeat(64)), true);
    assert.equal(verify('c'.repeat(64)), true);
    assert.equal(verify('b'.repeat(64)), false);
    assert.equal(verify('A'.repeat(64)), false);
    assert.equal(verify(undefined), false);
    const later = Date.now() + 5000;
    fs.writeFileSync(file, JSON.stringify({ keyHash: hash('b'.repeat(64)) }));
    fs.utimesSync(file, later / 1000, later / 1000);
    assert.equal(verify('b'.repeat(64)), true, 'reloads after the file changes');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a corrupt pairing file refuses everything', () => {
  const { dir, file, verify } = setup();
  try {
    fs.writeFileSync(file, '{broken');
    assert.equal(verify('a'.repeat(64)), false);
    fs.writeFileSync(file, JSON.stringify({ keyHashes: ['nothex'] }));
    assert.equal(verify('a'.repeat(64)), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
