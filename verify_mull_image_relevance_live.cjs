#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

const HOST_CALL_URL = process.env.REMNOTE_HOST_CALL_URL || 'http://127.0.0.1:3400/call';
const OFFTOPIC = /isle of mull|sound of mull|mull of galloway|scotland|hebrides|island|lighthouse|panorama|geograph\.org\.uk/i;
const RELEVANT = /ponder|contemplat|thinking|thinker|thoughtful|considering|decision|choice|deep in thought/i;
const HUMAN = /\b(?:person|people|man|woman|human|portrait|silhouette|thinker)\b/i;
const NON_IMAGE = /\.(?:ogg|oga|mp3|wav|flac|mp4|webm)(?:[?#]|$)/i;

async function callHost() {
  const response = await fetch(HOST_CALL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      action: 'host_translate_image_candidates',
      payload: {
        selectedText: 'mull',
        contextText: 'I need some time to mull it over before making a decision.',
        result: {
          targetText: 'mull',
          directTranslation: 'dusunmek; evirip cevirmek',
          contextualMeaning: 'uzerinde dusunup tasinmak',
          sentenceTranslation: 'Karar vermeden once bunu enine boyuna dusunmem gerekiyor.',
          englishSynonyms: ['ponder', 'contemplate', 'reflect', 'deliberate'],
        },
        limit: 3,
      },
    }),
  });
  const envelope = await response.json();
  if (!response.ok || !envelope?.ok) throw new Error(envelope?.error || `HTTP ${response.status}`);
  return envelope.result;
}

(async () => {
  const result = await callHost();
  assert.ok(Array.isArray(result.queries) && result.queries.length >= 2);
  assert.ok(result.queries.some((query) => /pondering person/i.test(query)));
  assert.ok(!result.queries.some((query) => /^mull(?: object| scene)?$/i.test(query)));
  assert.ok(Array.isArray(result.candidates) && result.candidates.length > 0, 'No thinking image survived the relevance gate.');
  for (const candidate of result.candidates) {
    const evidence = [candidate.title, candidate.description, candidate.categories, candidate.pageUrl].filter(Boolean).join(' ');
    assert.match(evidence, RELEVANT);
    assert.match(evidence, HUMAN);
    assert.doesNotMatch(evidence, OFFTOPIC);
    assert.doesNotMatch(candidate.imageUrl || '', NON_IMAGE);
  }
  assert.deepEqual(result.featuredCandidate, result.candidates[0]);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    queries: result.queries,
    candidates: result.candidates.map(({ title, imageUrl, score }) => ({ title, imageUrl, score })),
    durationMs: result.durationMs,
    cacheHit: result.cacheHit,
  }, null, 2)}\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
