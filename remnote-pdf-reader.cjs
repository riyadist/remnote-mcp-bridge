'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_VISITED_REMS = 80;
const MAX_DEPTH = 6;
const PDF_LINK = /https:\/\/[^\s)\]>"']+/g;

function allowedPdfUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'remnote-user-data.s3.amazonaws.com') return null;
    if (url.username || url.password || url.port || !url.pathname.toLowerCase().endsWith('.pdf')) return null;
    return url;
  } catch {
    return null;
  }
}

function pdfLinks(rawText) {
  const links = [];
  for (const part of Array.isArray(rawText) ? rawText : []) {
    const values = typeof part === 'string' ? [part] : [part?.url, part?.l].filter((item) => typeof item === 'string');
    for (const value of values) {
      for (const candidate of value.match(PDF_LINK) || []) {
        const url = allowedPdfUrl(candidate);
        if (url) links.push(url.href);
      }
      const direct = allowedPdfUrl(value);
      if (direct) links.push(direct.href);
    }
  }
  return [...new Set(links)];
}

async function findPdfSource(callPlugin, remId) {
  const queue = [{ id: remId, depth: 0 }];
  const seen = new Set();
  let readFailures = 0;
  while (queue.length && seen.size < MAX_VISITED_REMS) {
    const { id, depth } = queue.shift();
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    let rem;
    const request = {
      remId: id, includeChildren: true, includeRelations: true,
      includeProperties: false, childLimit: 50
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        rem = await callPlugin('read_rem_full', request);
        break;
      } catch {
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    if (!rem) {
      readFailures += 1;
      continue;
    }
    const link = pdfLinks(rem?.rawText)[0];
    if (link) return { url: link, pdfRemId: id, inspectedRems: seen.size };
    if (depth >= MAX_DEPTH) continue;
    const sourceIds = (rem?.relations?.sources || []).map((item) => item?.remId);
    const childIds = (rem?.children || []).map((item) => item?.remId);
    for (const nextId of [...sourceIds, ...childIds]) {
      if (typeof nextId === 'string' && !seen.has(nextId)) queue.push({ id: nextId, depth: depth + 1 });
    }
  }
  throw new Error(readFailures ? 'REMNOTE_PDF_SOURCE_READ_FAILED' : 'REMNOTE_PDF_SOURCE_NOT_FOUND');
}

async function downloadPdf(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetchImpl(url, { redirect: 'error', signal: controller.signal });
    if (!response.ok || !response.body) throw new Error('PDF_FETCH_FAILED');
    const statedSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(statedSize) && statedSize > MAX_PDF_BYTES) throw new Error('PDF_TOO_LARGE');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PDF_BYTES) {
        await reader.cancel();
        throw new Error('PDF_TOO_LARGE');
      }
      chunks.push(Buffer.from(value));
    }
    const bytes = Buffer.concat(chunks, size);
    if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('PDF_INVALID_CONTENT');
    return bytes;
  } catch (error) {
    if (error?.message?.startsWith('PDF_')) throw error;
    throw new Error('PDF_FETCH_FAILED');
  } finally {
    clearTimeout(timer);
  }
}

function createPdfReader({ callPlugin, fetchImpl = globalThis.fetch, runProcess = spawnSync, python = process.env.REMNOTE_PDF_PYTHON || 'python' }) {
  return async function readRemNotePdf(payload = {}) {
    const remId = String(payload.remId || '');
    const page = Number(payload.page ?? 1);
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(remId)) throw new Error('INVALID_REM_ID');
    if (!Number.isInteger(page) || page < 1 || page > 500) throw new Error('INVALID_PDF_PAGE');
    const source = await findPdfSource(callPlugin, remId);
    const bytes = await downloadPdf(source.url, fetchImpl);
    const helper = path.join(__dirname, 'pdf_page_text.py');
    const proc = runProcess(python, [helper, String(page)], {
      input: bytes, encoding: 'utf8', timeout: 65000,
      maxBuffer: 2 * 1024 * 1024, windowsHide: true
    });
    if (proc.error || proc.status !== 0) throw new Error('PDF_EXTRACTION_FAILED');
    let extracted;
    try { extracted = JSON.parse(proc.stdout); } catch { throw new Error('PDF_EXTRACTION_INVALID_RESPONSE'); }
    if (!extracted?.ok) throw new Error(extracted?.errorCode || 'PDF_EXTRACTION_FAILED');
    return {
      readOnly: true, mutationApplied: false, remId, pdfRemId: source.pdfRemId,
      page: extracted.page, pageCount: extracted.pageCount,
      method: extracted.method, ocrLanguage: extracted.ocrLanguage || null,
      text: extracted.text, truncated: Boolean(extracted.truncated),
      inspectedRems: source.inspectedRems
    };
  };
}

module.exports = { createPdfReader, allowedPdfUrl, pdfLinks, findPdfSource, downloadPdf };
