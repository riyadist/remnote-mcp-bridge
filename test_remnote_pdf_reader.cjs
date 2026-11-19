'use strict';

const assert = require('node:assert/strict');
const { createPdfReader, allowedPdfUrl } = require('./remnote-pdf-reader.cjs');

const pdfUrl = 'https://remnote-user-data.s3.amazonaws.com/private-document.pdf';
assert.ok(allowedPdfUrl(pdfUrl));
for (const bad of [
  'http://remnote-user-data.s3.amazonaws.com/private-document.pdf',
  'https://remnote-user-data.s3.amazonaws.com.evil.test/private-document.pdf',
  'https://127.0.0.1/private-document.pdf',
  'https://remnote-user-data.s3.amazonaws.com/private-document.png'
]) assert.equal(allowedPdfUrl(bad), null);

const rems = {
  'rootRem01': { rawText: ['Identity record'], children: [{ remId: 'childRem02' }] },
  'childRem02': { rawText: ['Scan'], relations: { sources: [{ remId: 'sourceRem03' }] } },
  'sourceRem03': { rawText: ['Source'], relations: { sources: [{ remId: 'pdfRem0004' }] } },
  'pdfRem0004': { rawText: [`[PDF](${pdfUrl})`] }
};
const calls = [];
const callPlugin = async (action, payload) => {
  assert.equal(action, 'read_rem_full');
  calls.push(payload.remId);
  return rems[payload.remId];
};
const fetchImpl = async (url, options) => {
  assert.equal(url, pdfUrl);
  assert.equal(options.redirect, 'error');
  return new Response(Buffer.from('%PDF-fixture'), {
    status: 200, headers: { 'content-length': '12', 'content-type': 'application/pdf' }
  });
};
const runProcess = (_python, _args, options) => {
  assert.equal(options.input.toString(), '%PDF-fixture');
  return { status: 0, stdout: JSON.stringify({
    ok: true, page: 1, pageCount: 1, method: 'ocr',
    ocrLanguage: 'eng', text: '23.01.1989', truncated: false
  }) };
};

(async () => {
  const read = createPdfReader({ callPlugin, fetchImpl, runProcess });
  const result = await read({ remId: 'rootRem01', page: 1 });
  assert.equal(result.readOnly, true);
  assert.equal(result.mutationApplied, false);
  assert.equal(result.method, 'ocr');
  assert.equal(result.text, '23.01.1989');
  assert.equal(result.pdfRemId, 'pdfRem0004');
  assert.equal(result.inspectedRems, 4);
  assert.equal(Object.hasOwn(result, 'url'), false);
  assert.deepEqual(calls, ['rootRem01', 'childRem02', 'sourceRem03', 'pdfRem0004']);
  let firstRead = true;
  const flakyPlugin = async (action, payload) => {
    if (firstRead) { firstRead = false; throw new Error('temporary plugin error'); }
    return callPlugin(action, payload);
  };
  const readAfterRetry = createPdfReader({ callPlugin: flakyPlugin, fetchImpl, runProcess });
  assert.equal((await readAfterRetry({ remId: 'rootRem01' })).text, '23.01.1989');
  await assert.rejects(() => read({ remId: 'rootRem01', page: 0 }), /INVALID_PDF_PAGE/);
  const oversizedFetch = async () => new Response(Buffer.from('%PDF-fixture'), {
    status: 200, headers: { 'content-length': String(21 * 1024 * 1024) }
  });
  const readOversized = createPdfReader({ callPlugin, fetchImpl: oversizedFetch, runProcess });
  await assert.rejects(() => readOversized({ remId: 'pdfRem0004' }), /PDF_TOO_LARGE/);
  console.log('RemNote PDF reader source chain, safety, and result contract: PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; });
