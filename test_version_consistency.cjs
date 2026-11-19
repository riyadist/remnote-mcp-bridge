'use strict';
// The plugin version has one source (package.json). The manifest RemNote reads
// must match it, and no source file may hardcode a version string again.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'manifest.json'), 'utf8'));

test('public/manifest.json version equals package.json version', () => {
  const { major, minor, patch } = manifest.version;
  assert.equal(`${major}.${minor}.${patch}`, pkg.version);
});

test('no source file hardcodes the plugin version', () => {
  const hits = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && fs.readFileSync(full, 'utf8').includes(`'${pkg.version}'`)) hits.push(full);
    }
  };
  walk(path.join(__dirname, 'src'));
  assert.deepEqual(hits, []);
});
