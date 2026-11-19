#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CDP_LIST_URL = process.env.REMNOTE_CDP_LIST_URL || 'http://127.0.0.1:9233/json/list';
const HOST_CALL_URL = process.env.REMNOTE_HOST_CALL_URL || 'http://127.0.0.1:3400/call';
const STATE_KEY = '__mcpRemNoteCevirOverlay25930AppSchemeToolbarV6Live';
const STATE_KEY_PREFIX = '__mcpRemNoteCevirOverlay';
const TIMEOUT_MS = Number(process.env.REMNOTE_FEATURED_IMAGE_VERIFY_TIMEOUT_MS || 30000);
const SCREENSHOT_PATH = path.resolve(__dirname, '..', '..', 'Temp', 'remnote_featured_image_preview.png');

function withTimeout(promise, label, timeoutMs = TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function getRemNoteTarget() {
  const response = await withTimeout(fetch(CDP_LIST_URL), 'CDP target list');
  if (!response.ok) throw new Error(`CDP target list failed: HTTP ${response.status}`);
  const targets = await response.json();
  const pages = targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  return pages.find((target) => /RemNote|app\.asar|file:\/\//i.test(`${target.title || ''} ${target.url || ''}`)) || pages[0];
}

async function connect(target) {
  if (!target) throw new Error('No RemNote CDP page target was found.');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const pair = pending.get(message.id);
    if (!pair) return;
    pending.delete(message.id);
    if (message.error) pair.reject(new Error(JSON.stringify(message.error)));
    else pair.resolve(message.result);
  });
  await withTimeout(new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  }), 'CDP websocket');
  return {
    send(method, params = {}, timeoutMs = TIMEOUT_MS) {
      return withTimeout(new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      }), method, timeoutMs);
    },
    close() { ws.close(); },
  };
}

async function requestAnticlineImages() {
  const startedAt = Date.now();
  const response = await withTimeout(fetch(HOST_CALL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'host_translate_image_candidates',
      payload: {
        selectedText: 'anticlines',
        contextText: 'silent on such details - indeed, silent on everything but anticlines, synclines, axial faults and the like',
        result: {
          selectionMode: 'term',
          targetText: 'anticlines',
          directTranslation: 'antiklinaller; yukariya dogru kivrilmis kaya katmanlari',
          contextualMeaning: 'Jeolojide kaya katmanlarinin kemer biciminde yukariya dogru kivrilmasi',
        },
        limit: 3,
      },
    }),
  }), 'image host request');
  const json = await response.json();
  if (!response.ok || json?.ok !== true) throw new Error(json?.error || `Host HTTP ${response.status}`);
  const result = json.result?.result || json.result;
  return { ...result, observedDurationMs: Date.now() - startedAt };
}

const renderExpression = `(async () => {
  const preferredState = window[${JSON.stringify(STATE_KEY)}];
  const state = preferredState?.installed
    ? preferredState
    : Object.keys(window)
      .filter((key) => key.startsWith(${JSON.stringify(STATE_KEY_PREFIX)}))
      .map((key) => window[key])
      .find((candidate) => candidate?.installed
        && typeof candidate.prefetchImageCandidates === 'function'
        && typeof candidate.renderTranslationPopupContent === 'function');
  if (!state?.installed || typeof state.prefetchImageCandidates !== 'function') {
    return { ok: false, error: 'active featured-image overlay was not found' };
  }
  const nonce = Date.now();
  const capture = {
    selectedText: 'anticlines',
    contextText: 'silent on everything but anticlines, synclines, axial faults and the like verification ' + nonce
  };
  const result = {
    selectionMode: 'term',
    targetText: 'anticlines',
    directTranslation: 'antiklinaller; yukariya dogru kivrilmis kaya katmanlari',
    contextualMeaning: 'Jeolojide kaya katmanlarinin kemer biciminde yukariya dogru kivrilmasi',
    partial: false,
    detailStatus: 'complete',
    translationSections: [
      { key: 'directTranslation', label: 'Direkt ceviri', value: 'antiklinaller' },
      { key: 'contextualMeaning', label: 'Bu baglamda anlami', value: 'Yukariya dogru kivrilmis kaya katmanlari' }
    ]
  };
  const key = state.getImagePrefetchKey(capture, result);
  const firstPromise = state.prefetchImageCandidates(capture, result);
  const secondPromise = state.prefetchImageCandidates(capture, { ...result, partial: false, detailStatus: 'complete' });
  const samePromise = firstPromise === secondPromise;
  const seq = ++state.popupRequestSeq;
  state.activePopupRequestSeq = seq;
  state.showPopup('', {
    sticky: true,
    requestSeq: seq,
    contentNode: state.renderTranslationPopupContent(result, capture)
  });
  const candidates = await firstPromise;
  await new Promise((resolve) => setTimeout(resolve, 700));
  const resolvedExportCandidate = state.resolveFlashcardImageCandidate(capture, result);
  const flashcardPayload = state.buildFlashcardPayload(capture, result);
  const flashcardDetailRoot = flashcardPayload?.detailToggles?.[0] || null;
  const flashcardDetails = flashcardDetailRoot?.children || [];
  const flashcardBack = String(flashcardPayload?.back || '');
  const flashcardDetailTitles = flashcardDetails.map((detail) => String(detail?.title || ''));
  const flashcardFormatOk = flashcardBack.startsWith('**Bağlam:** ')
    && flashcardDetailRoot?.title === '**Detaylar**'
    && flashcardDetailTitles.length > 0
    && flashcardDetailTitles.every((title) => title.startsWith('**') && title.endsWith('**'));
  const exportedImageDetail = flashcardDetails.find((detail) =>
    String(detail?.title || '').toLocaleLowerCase('tr-TR').includes('gorsel')
  );
  const exportedImageUrls = Array.isArray(exportedImageDetail?.imageUrls)
    ? exportedImageDetail.imageUrls
    : [];
  const figure = document.querySelector('.mcp-cdp-cevir-featured-visual');
  const stage = document.querySelector('.mcp-cdp-cevir-featured-stage');
  const summary = document.querySelector('.mcp-cdp-cevir-featured-summary');
  const image = figure?.querySelector('img');
  if (image && !image.complete) {
    await new Promise((resolve) => {
      const done = () => resolve();
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
      setTimeout(done, 3000);
    });
  }
  const popup = document.querySelector('.mcp-cdp-cevir-popup');
  const actionButtons = document.querySelector('.mcp-cdp-cevir-action-buttons');
  const buttons = actionButtons ? [...actionButtons.querySelectorAll('button')] : [];
  const rect = figure?.getBoundingClientRect();
  const stageRect = stage?.getBoundingClientRect();
  const summaryRect = summary?.getBoundingClientRect();
  const popupRect = popup?.getBoundingClientRect();
  const actionRect = actionButtons?.getBoundingClientRect();
  const buttonMetrics = buttons.map((button) => {
    const buttonRect = button.getBoundingClientRect();
    const label = button.querySelector('.mcp-cdp-cevir-action-label');
    return {
      label: label?.textContent?.trim() || '',
      width: buttonRect.width,
      height: buttonRect.height,
      inside: Boolean(actionRect && buttonRect.left >= actionRect.left - 1 && buttonRect.right <= actionRect.right + 1),
      noOverflow: button.scrollWidth <= button.clientWidth + 1 && button.scrollHeight <= button.clientHeight + 1,
    };
  });
  const style = image ? getComputedStyle(image) : null;
  const verticallyVisibleOrScrollable = Boolean(rect && popupRect && popup && (
    rect.bottom <= popupRect.bottom + 1 ||
    popup.scrollHeight > popup.clientHeight
  ));
  return {
    ok: Boolean(key && samePromise && candidates.length === 3
      && flashcardFormatOk
      && exportedImageUrls.length === 1
      && exportedImageUrls[0] === candidates[0]?.imageUrl
      && figure && image && rect && popupRect
      && style?.objectFit === 'contain' && rect.width <= 281 && rect.height >= 110 && rect.height <= 180
      && image.naturalWidth > 0 && image.naturalHeight > 0
      && rect.right <= popupRect.right + 1 && rect.left >= popupRect.left - 1
      && verticallyVisibleOrScrollable
      && summaryRect?.width > 180
      && Math.abs((summaryRect?.top || 0) - (rect?.top || 0)) <= 3
      && actionRect?.bottom <= (stageRect?.top || 0) + 1
      && buttonMetrics.length === 5
      && buttonMetrics.every((button) => button.inside && button.noOverflow && button.height >= 38)),
    samePromise,
    candidateCount: candidates.length,
    expectedImagePrefetchKey: key,
    activeImagePrefetchKey: state.imagePrefetchKey,
    activeImagePrefetchStatus: state.imagePrefetchStatus,
    activeImagePrefetchCount: state.imagePrefetchCandidates?.length || 0,
    resolvedExportImageUrl: resolvedExportCandidate?.imageUrl || '',
    flashcardFormatOk,
    flashcardBack,
    flashcardDetailRootTitle: flashcardDetailRoot?.title || '',
    flashcardDetailTitles,
    exportedImageUrls,
    exportedImageTitle: exportedImageDetail?.title || '',
    firstTitle: candidates[0]?.title || '',
    firstSource: candidates[0]?.source || '',
    firstDisplayMode: candidates[0]?.displayMode || '',
    imageObjectFit: style?.objectFit || '',
    imageNaturalSize: image ? { width: image.naturalWidth, height: image.naturalHeight } : null,
    featuredRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
    stageRect: stageRect ? { x: stageRect.x, y: stageRect.y, width: stageRect.width, height: stageRect.height } : null,
    summaryRect: summaryRect ? { x: summaryRect.x, y: summaryRect.y, width: summaryRect.width, height: summaryRect.height } : null,
    summaryText: summary?.innerText || '',
    popupRect: popupRect ? { x: popupRect.x, y: popupRect.y, width: popupRect.width, height: popupRect.height } : null,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    popupScroll: popup ? { scrollTop: popup.scrollTop, scrollHeight: popup.scrollHeight, clientHeight: popup.clientHeight } : null,
    actionRect: actionRect ? { x: actionRect.x, y: actionRect.y, width: actionRect.width, height: actionRect.height } : null,
    buttonMetrics,
  };
})()`;

(async () => {
  const hostResult = await requestAnticlineImages();
  const target = await getRemNoteTarget();
  const cdp = await connect(target);
  try {
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    const evaluated = await cdp.send('Runtime.evaluate', {
      expression: renderExpression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (evaluated.exceptionDetails) throw new Error(JSON.stringify(evaluated.exceptionDetails));
    const uiResult = evaluated.result?.value;
    const rectEval = await cdp.send('Runtime.evaluate', {
      expression: `(() => { const r = document.querySelector('.mcp-cdp-cevir-popup')?.getBoundingClientRect(); return r ? ({ x: r.x, y: r.y, width: r.width, height: r.height }) : null; })()`,
      returnByValue: true,
    });
    const rect = rectEval.result?.value;
    let screenshotError = null;
    let screenshotWritten = false;
    if (rect) {
      try {
        const screenshot = await cdp.send('Page.captureScreenshot', {
          format: 'png',
          fromSurface: false,
          captureBeyondViewport: false,
          clip: {
            x: Math.max(0, rect.x),
            y: Math.max(0, rect.y),
            width: Math.max(1, rect.width),
            height: Math.max(1, rect.height),
            scale: 1,
          },
        }, 15000);
        fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });
        fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
        screenshotWritten = true;
      } catch (error) {
        screenshotError = String(error?.message || error);
      }
    }
    const top = hostResult.candidates?.[0] || {};
    const isInstructionalDiagram = top.semanticType === 'encyclopedia_lead'
      || /diagram|schematic|illustration|vector|psf/i.test(`${top.title || ''} ${top.description || ''} ${top.categories || ''}`)
      || top.mimeType === 'image/svg+xml';
    const isExtremePanorama = Number(top.width) > 0 && Number(top.height) > 0 && Number(top.width) / Number(top.height) >= 4;
    const hostOk = /anticlin/i.test(top.title || '')
      && top.displayMode === 'contain'
      && isInstructionalDiagram
      && !isExtremePanorama;
    const report = {
      ok: Boolean(hostOk && uiResult?.ok),
      target: { id: target.id, title: target.title, url: target.url },
      host: {
        ok: hostOk,
        durationMs: hostResult.durationMs,
        observedDurationMs: hostResult.observedDurationMs,
        displayPreference: hostResult.displayPreference,
        queries: hostResult.queries,
        candidates: hostResult.candidates?.map((candidate) => ({
          title: candidate.title,
          source: candidate.source,
          score: candidate.score,
          displayMode: candidate.displayMode,
          width: candidate.width,
          height: candidate.height,
          mimeType: candidate.mimeType,
          semanticType: candidate.semanticType,
        })),
      },
      ui: uiResult,
      screenshotPath: screenshotWritten ? SCREENSHOT_PATH : null,
      screenshotError,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) process.exitCode = 1;
  } finally {
    cdp.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
