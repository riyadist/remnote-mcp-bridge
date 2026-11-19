// Regression guard: personal RemNote lookup details must not enter /events telemetry.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'bridge-host.cjs'), 'utf8');
const start = source.indexOf('function recordAction(');
const end = source.indexOf('\nfunction sendJson(', start);
assert.ok(start >= 0 && end > start, 'recordAction source found');

const recentActions = [];
const stats = { calls: 0, created: 0, updated: 0, journal: 0, searches: 0, reads: 0, errors: 0 };
const context = { recentActions, stats, HOST_ACTIONS: new Set(['host_remnote_pdf_read']), broadcastEvent() {} };
vm.runInNewContext(source.slice(start, end), context);

const sentinel = 'PRIVATE_QUERY_OR_TITLE_SENTINEL';
context.recordAction('search', sentinel, sentinel, true);
context.recordAction('read_note', sentinel, sentinel, false, sentinel);
context.recordAction('read_rem_full', sentinel, sentinel, true);
context.recordAction('host_remnote_pdf_read', sentinel, sentinel, false, sentinel);
assert.equal(recentActions[0].title, 'host_remnote_pdf_read');
assert.equal(recentActions[0].remId, null);
assert.equal(recentActions[0].error, 'lookup failed');
assert.equal(recentActions[1].title, 'read_rem_full');
assert.equal(recentActions[1].remId, null);
assert.equal(recentActions[2].title, 'read_note');
assert.equal(recentActions[2].remId, null);
assert.equal(recentActions[2].error, 'lookup failed');
assert.equal(recentActions[3].title, 'search');
assert.equal(recentActions[3].remId, null);
assert.ok(!JSON.stringify(recentActions).includes(sentinel));
assert.equal(stats.searches, 1);
assert.equal(stats.reads, 3);
assert.equal(stats.errors, 2);

context.recordAction('get_status', 'get_status', null, true);
assert.equal(recentActions[0].title, 'get_status');
console.log('lookup telemetry redaction: PASS');
