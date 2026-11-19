'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const open = require('./selection-assistant-ui.cjs');
const artifacts = path.resolve(__dirname, '../../Temp/remnote-assistant-recurrence-20261014/editor');
require('node:fs').mkdirSync(artifacts, { recursive: true });
const summary = { term: 'hippocampus', summary: 'Hipokampus belleğin oluşumunda rol oynar. Yeni anıları düzenlemeye yardımcı olur.', visualQuery: 'hippocampus anatomy', uncertain: false, readOnly: true, mutationApplied: false, durationMs: 12, cached: false };
const images = { candidates: Array.from({ length: 5 }, (_, i) => ({ imageUrl: `https://images.example/${i}.png`, thumbnailUrl: `https://images.example/${i}.png`, sourceUrl: `https://source.example/${i}`, title: `Beyin şeması ${i + 1}`, license: 'CC BY 4.0', creator: 'Anatomy' })), readOnly: true, mutationApplied: false, durationMs: 12, cached: false };
async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
  page.setDefaultTimeout(3500);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://images.example/**', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#47566b"/><ellipse cx="300" cy="150" rx="140" ry="100" fill="#c4d9df"/></svg>' }));
  async function setup(selectedText = 'hippocampus', contextText = 'memory formation', surface = 'pdf') {
    await page.setContent('<body style="margin:0;background:#15151b;padding:12px"><main id="popup" style="box-sizing:border-box;width:700px;max-width:100%;margin:auto;padding:16px;background:#20202a"></main></body>');
    await page.evaluate(({ source, selectedText, contextText, surface }) => {
      window.events = []; window.pending = []; window.translations = 0;
      (0, eval)('(' + source + ')')({
        capture: () => ({ selectedText, contextText }),
        show: (_, o) => document.querySelector('#popup').append(o.contentNode),
        close: () => document.querySelector('.mcp-selection-assistant').remove(),
        translate: () => window.translations++,
        call: async (action, payload) => {
          window.events.push({ action, payload: JSON.parse(JSON.stringify(payload)) });
          if (action === 'host_assistant_capture') return { captureId: 'capture', segments: [[selectedText]], editable: surface !== 'pdf' };
          if (action === 'host_assistant_report') return { readOnly: true, mutationApplied: false };
          if (action === 'host_assistant_chat') return { requestId: 'chat1', status: 'running' };
          if (action === 'host_assistant_job_status') return { requestId: 'chat1', status: 'completed', answer: 'Hipokampus hakkında devam cevabı.' };
          if (/^host_explain_/.test(action)) return new Promise((resolve, reject) => window.pending.push({ action, payload, resolve, reject }));
          throw new Error(action);
        }
      }, surface);
    }, { source: open.toString(), selectedText, contextText, surface });
  }
  const click = () => page.getByRole('button', { name: 'Açıkla', exact: true }).click();
  async function settle(action, data, error, index = 0) {
    await page.evaluate(({ action, data, error, index }) => {
      const item = window.pending.filter(p => p.action === action)[index];
      if (!item) throw new Error('No pending ' + action);
      error ? item.reject(Object.assign(new Error(typeof error === 'object' ? error.message : error), typeof error === 'object' ? error : {})) : item.resolve(data);
    }, { action, data, error, index });
  }
  async function awaitRequest(request, message) {
    let timer;
    try { await Promise.race([request, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), 3500); })]); }
    finally { clearTimeout(timer); }
  }
  let tests = 0;
  try {
    // Break caught: PDF-only guards hide/disable note explanation or route it into editing.
    await setup('  hippocampus  ', '  memory formation  ', 'note');
    assert.equal(await page.getByRole('button', { name: 'Açıkla', exact: true }).count(), 1, 'note Açıkla preset is missing');
    assert.equal(await page.getByRole('button', { name: 'Çeviri kartı ↗', exact: true }).count(), 0, 'translation card remains PDF-only');
    await click(); await click();
    assert.deepEqual(await page.evaluate(() => window.events.filter(e => /^host_explain_/.test(e.action))), [
      { action: 'host_explain_summary', payload: { selectedText: 'hippocampus', contextText: 'memory formation' } },
      { action: 'host_explain_images', payload: { selectedText: 'hippocampus', limit: 5 } },
    ], 'note explanation uses the selection/context, coalesces repeat clicks, and does not expose context to images');
    assert.equal(await page.getByRole('button', { name: 'Uygula', exact: true }).isVisible(), false, 'explain cannot offer note mutation');
    await settle('host_explain_summary', { ...summary, visualQuery: '' });
    await settle('host_explain_images', { ...images, candidates: [] });
    await page.getByText(summary.summary, { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Daha detaylı sor', exact: true }).click();
    const noteQuestion = page.getByRole('textbox', { name: 'Seçili metin için komut' });
    await noteQuestion.fill('Bellekle ilişkisini anlat'); await noteQuestion.press('Enter');
    await page.getByText('Hipokampus hakkında devam cevabı.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.events.find(e => e.action === 'host_assistant_chat').payload.captureId), undefined, 'read-only concept followup cannot send editable note capture');
    assert.match(await page.evaluate(() => window.events.find(e => e.action === 'host_assistant_chat').payload.messages.map(m => m.content).join(' ')), /hippocampus/);
    await page.getByRole('button', { name: 'Düzenle', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Uygula', exact: true }).isDisabled(), true, 'explanation must not create an edit plan');
    assert.equal(await page.evaluate(() => window.events.some(e => /preview|apply|approve|export/.test(e.action))), false);
    assert.equal(await page.evaluate(() => window.translations), 0);
    tests++;
    for (const surface of ['note', 'pdf']) {
      await setup('   ', '', surface); await click();
      assert.match(await page.locator('.sa-explain-summary').innerText(), /kavram seç/);
      if (surface === 'note') assert.doesNotMatch(await page.locator('.sa-explain-summary').innerText(), /PDF/, 'note empty-selection hint must name the right surface');
      assert.equal(await page.evaluate(() => window.events.some(e => /^host_explain_|preview|apply/.test(e.action))), false, 'empty selection cannot submit work');
      tests++;
    }
    await setup();
    assert.equal(await page.getByRole('button', { name: 'Açıkla', exact: true }).count(), 1, 'PDF Açıkla preset is missing');
    await click(); await click();
    assert.deepEqual(await page.evaluate(() => window.events.filter(e => /^host_explain_/.test(e.action)).map(e => e.action)), ['host_explain_summary', 'host_explain_images'], 'lanes start parallel and repeated click coalesces');
    await settle('host_explain_images', images);
    await page.locator('.sa-explain-counter').getByText('1/5', { exact: true }).waitFor();
    assert.match(await page.locator('.sa-explain-summary').innerText(), /hazırlanıyor/);
    assert.match(await page.locator('.sa-explain-image-status').innerText(), /İlk görsel sonuçları/);
    await settle('host_explain_summary', summary);
    await page.getByText(summary.summary, { exact: true }).waitFor();
    await settle('host_explain_images', images, null, 1);
    assert.equal(await page.locator('.sa-explain-navigation').evaluate(el =>
      !!(el.compareDocumentPosition(el.parentElement.querySelector('.sa-explain-main')) & Node.DOCUMENT_POSITION_FOLLOWING)), true,
      'navigation must precede the large image so alternatives are not hidden below it');
    assert.equal(await page.locator('.sa-explain-thumbnails').evaluate(el =>
      !!(el.compareDocumentPosition(el.parentElement.querySelector('.sa-explain-main')) & Node.DOCUMENT_POSITION_FOLLOWING)), true,
      'alternative thumbnails must precede the large image');
    await page.getByRole('button', { name: 'Sonraki görsel' }).click();
    assert.equal(await page.locator('.sa-explain-counter').innerText(), '2/5');
    await page.getByRole('button', { name: 'Görseli büyüt' }).press('ArrowRight');
    assert.equal(await page.locator('.sa-explain-counter').innerText(), '3/5');
    assert.match(await page.locator('.sa-explain-caption').innerText(), /CC BY 4.0/);
    assert.equal(await page.locator('.sa-explain-caption a').getAttribute('href'), 'https://source.example/2');
    await page.getByRole('button', { name: 'Görseli büyüt' }).click();
    assert.equal(await page.getByRole('dialog', { name: 'Büyütülmüş görsel' }).isVisible(), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('dialog', { name: 'Büyütülmüş görsel' }).evaluate(el => el.contains(document.activeElement)), true, 'dialog keeps keyboard focus');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog', { name: 'Büyütülmüş görsel' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Görseli büyüt' }).evaluate(el => el === document.activeElement), true);
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.locator('#popup').evaluate(el => el.scrollWidth > el.clientWidth), false, 'horizontal overflow ' + width);
      await page.locator('#popup').screenshot({ path: path.join(artifacts, `explain-preview-${width}.png`) });
    }
    await click();
    assert.equal(await page.evaluate(() => window.events.filter(e => /^host_explain_/.test(e.action)).length), 3, 'cached result must not rerun');
    await page.getByRole('button', { name: 'Daha detaylı sor', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Seçili metin için komut' });
    await input.fill('Bellekle ilişkisini anlat'); await input.press('Enter');
    await page.getByText('Hipokampus hakkında devam cevabı.', { exact: true }).waitFor();
    assert.match(await page.evaluate(() => window.events.find(e => e.action === 'host_assistant_chat').payload.messages.map(m => m.content).join(' ')), /hippocampus/);
    assert.equal(await page.evaluate(() => window.events.find(e => e.action === 'host_assistant_chat').payload.captureId), undefined, 'concept followup cannot send original PDF capture to chat');
    assert.equal(await page.evaluate(() => window.events.some(e => /apply|approve|export/.test(e.action))), false);
    tests++;

    await setup('x'.repeat(400), 'c'.repeat(800)); await click();
    assert.deepEqual(await page.evaluate(() => { const p = window.events.find(e => e.action === 'host_explain_summary').payload; return [p.selectedText.length, p.contextText.length]; }), [300, 600]);
    assert.deepEqual(await page.evaluate(() => Object.keys(window.events.find(e => e.action === 'host_explain_images').payload).sort()), ['limit', 'selectedText']);
    await settle('host_explain_summary', null, 'özet servisi kapalı');
    await settle('host_explain_images', images);
    await page.locator('.sa-explain-counter').getByText('1/5', { exact: true }).waitFor();
    assert.match(await page.locator('.sa-explain-summary-status').innerText(), /özet servisi kapalı/);
    await page.getByRole('button', { name: 'Özeti tekrar dene' }).click();
    assert.equal(await page.evaluate(() => window.events.filter(e => e.action === 'host_explain_images').length), 1);
    tests++;

    await setup(); await click();
    await settle('host_explain_summary', summary);
    await settle('host_explain_images', { ...images, candidates: [{ imageUrl: 'javascript:alert(1)', sourceUrl: 'https://source.example', title: 'bad' }, { imageUrl: 'https://images.example/0.png', sourceUrl: 'javascript:alert(1)', title: 'bad' }] });
    await settle('host_explain_images', { ...images, candidates: [] }, null, 1);
    assert.equal(await page.locator('.sa-explain-main img').count(), 0);
    assert.match(await page.locator('.sa-explain-image-status').innerText(), /bulunamadı/);
    assert.equal(await page.locator('.sa-explain-summary').innerText(), summary.summary);
    tests++;

    await setup(); await click();
    await settle('host_explain_summary', { ...summary, visualQuery: '', summary: '<img src=x onerror=alert(1)> Güvenli metin.' });
    await settle('host_explain_images', null, 'görsel servisi kapalı');
    assert.equal(await page.locator('.sa-explain-summary img').count(), 0);
    assert.match(await page.locator('.sa-explain-summary').innerText(), /<img/);
    assert.match(await page.locator('.sa-explain-image-status').innerText(), /görsel servisi kapalı/);
    tests++;

    await setup(); await click();
    await settle('host_explain_summary', { ...summary, uncertain: true, visualQuery: '' });
    await settle('host_explain_images', { ...images, candidates: [] });
    assert.match(await page.locator('.sa-explain-summary-status').innerText(), /kesin olmayabilir/);
    await page.getByRole('button', { name: 'Görselleri tekrar dene' }).click();
    assert.equal(await page.evaluate(() => window.events.filter(e => e.action === 'host_explain_summary').length), 1, 'image-only retry does not resend model input');
    await settle('host_explain_images', images, null, 1);
    assert.equal(await page.locator('.sa-explain-counter').innerText(), '1/5'); tests++;

    await setup(); await click();
    await settle('host_explain_summary', summary);
    await settle('host_explain_images', { ...images, candidates: images.candidates.slice(0, 1) }, null, 1);
    await settle('host_explain_images', images);
    assert.equal(await page.locator('.sa-explain-counter').innerText(), '1/1', 'late raw images cannot replace refined results'); tests++;
    // Break caught: a provisional cache suppresses the unfinished sense-refined lane on reopen.
    for (const rawCandidates of [[], [{ ...images.candidates[0], title: 'Denizatı — yanlış ilk anlam' }]]) {
      await setup('hippocampus', 'a person swimming'); await click();
      await settle('host_explain_images', { ...images, candidates: rawCandidates });
      await settle('host_explain_summary', { ...summary, visualQuery: 'swimming person' });
      assert.equal(await page.evaluate(() => window.events.filter(e => e.action === 'host_explain_images').length), 2);
      await page.getByRole('button', { name: 'Soru sor', exact: true }).click();
      await page.getByRole('button', { name: 'Düzenle', exact: true }).click(); await click(); await click();
      assert.equal(await page.evaluate(() => window.events.filter(e => e.action === 'host_explain_images').length), 3, 'reopen must resume one refined query, not keep provisional raw cache');
      assert.equal(await page.evaluate(() => window.events.filter(e => e.action === 'host_explain_summary').length), 1, 'cached summary is reused');
      assert.equal(await page.evaluate(() => window.pending.filter(e => e.action === 'host_explain_images')[2].payload.visualQuery), 'swimming person');
      const refinedImages = { ...images, candidates: [{ ...images.candidates[1], title: 'Yüzen kişi — bağlama uygun' }] };
      await settle('host_explain_images', refinedImages, null, 2);
      await settle('host_explain_images', { ...images, candidates: [{ ...images.candidates[0], title: 'Eski geç yanıt' }] }, null, 1);
      assert.match(await page.locator('.sa-explain-caption').innerText(), /Yüzen kişi/);
      assert.doesNotMatch(await page.locator('.sa-explain-caption').innerText(), /Eski geç|Denizatı/);
      await page.getByRole('button', { name: 'Soru sor', exact: true }).click();
      await page.getByRole('button', { name: 'Düzenle', exact: true }).click(); await click();
      assert.equal(await page.evaluate(() => window.events.filter(e => e.action === 'host_explain_images').length), 3, 'matching refined cache avoids another request burst');
      tests++;
    }
    // Break caught: initial hero downloads the full original despite a validated thumbnail.
    const originalRoutes = [], thumbRoutes = [];
    let thumbRequested;
    const thumbStarted = new Promise(resolve => { thumbRequested = resolve; });
    let originalRequested;
    const originalStarted = new Promise(resolve => { originalRequested = resolve; });
    const fixtureImage = { contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#c4d9df"/></svg>' };
    await page.route('https://original.example/**', route => { originalRoutes.push(route); originalRequested(); });
    await page.route('https://thumb.example/**', route => { thumbRoutes.push(route); thumbRequested(); });
    await setup(); await click();
    await settle('host_explain_summary', { ...summary, visualQuery: '' });
    await settle('host_explain_images', { ...images, candidates: [{ ...images.candidates[0], imageUrl: 'https://original.example/full.svg', thumbnailUrl: 'https://thumb.example/preview.svg' }] });
    await awaitRequest(thumbStarted, 'thumbnail request missing');
    assert.equal(await page.locator('.sa-explain-main img').getAttribute('src'), 'https://thumb.example/preview.svg', 'hero uses supplied thumbnail, never original before enlarge');
    assert.equal(originalRoutes.length, 0, 'no original request before explicit enlarge');
    assert.match(await page.locator('.sa-explain-image-status').innerText(), /yükleniyor/);
    await Promise.all(thumbRoutes.map(route => route.fulfill(fixtureImage)));
    await page.waitForFunction(() => { const img = document.querySelector('.sa-explain-main img'); return img.complete && img.naturalWidth > 0; });
    assert.match(await page.locator('.sa-explain-image-status').innerText(), /hazır/);
    assert.equal(originalRoutes.length, 0);
    await page.getByRole('button', { name: 'Görseli büyüt' }).click();
    await page.waitForFunction(() => document.querySelector('dialog img')?.src === 'https://original.example/full.svg');
    // Wait for the external-boundary request event, not for a fake elapsed-time guarantee.
    await awaitRequest(originalStarted, 'original request missing after explicit enlarge');
    assert.equal(originalRoutes.length, 1, 'explicit enlarge requests original once');
    assert.match(await page.locator('.sa-explain-enlarged-status').innerText(), /yükleniyor/);
    await originalRoutes[0].fulfill(fixtureImage);
    await page.waitForFunction(() => document.querySelector('dialog img').naturalWidth === 600);
    assert.match(await page.locator('.sa-explain-enlarged-status').innerText(), /hazır/);
    await page.keyboard.press('Escape');
    await page.unroute('https://original.example/**'); await page.unroute('https://thumb.example/**'); tests++;
    const heldHeroUrl = 'https://images.example/1.png?held-hero';
    const heldHeroRoutes = [];
    let releaseHero = false, notifyHeroRequest;
    const heroRequested = new Promise(resolve => { notifyHeroRequest = resolve; });
    const holdHero = route => {
      if (releaseHero) return route.fulfill(fixtureImage);
      heldHeroRoutes.push(route); notifyHeroRequest();
    };
    await page.route(heldHeroUrl, holdHero);
    await setup(); await click();
    await settle('host_explain_summary', { ...summary, visualQuery: '' });
    await settle('host_explain_images', { ...images, candidates: images.candidates.slice(0, 2).map((x, index) => ({
      ...x, thumbnailUrl: undefined, imageUrl: index === 1 ? heldHeroUrl : x.imageUrl,
    })) });
    assert.equal(await page.locator('.sa-explain-main img').getAttribute('src'), 'https://images.example/0.png', 'missing thumbnail falls back to original');
    await page.waitForFunction(() => document.querySelector('.sa-explain-main img').naturalWidth > 0);
    await page.evaluate(() => {
      window.oldHero = document.querySelector('.sa-explain-main img');
      window.currentHeroLoaded = false;
      window.recordCurrentHeroLoad = event => {
        if (event.isTrusted && event.target === document.querySelector('.sa-explain-main img') &&
            event.target.src.endsWith('/1.png?held-hero')) window.currentHeroLoaded = true;
      };
      document.addEventListener('load', window.recordCurrentHeroLoad, true);
    });
    await page.getByRole('button', { name: 'Sonraki görsel' }).click();
    await awaitRequest(heroRequested, 'controlled current hero request missing');
    const staleWhileLoading = await page.evaluate(() => {
      const status = document.querySelector('.sa-explain-image-status');
      const before = status.textContent;
      window.oldHero.dispatchEvent(new Event('error'));
      const afterError = status.textContent;
      window.oldHero.dispatchEvent(new Event('load'));
      return { before, afterError, afterLoad: status.textContent };
    });
    assert.match(staleWhileLoading.before, /yükleniyor/);
    assert.equal(staleWhileLoading.afterError, staleWhileLoading.before, 'old hero error cannot change current loading status');
    assert.equal(staleWhileLoading.afterLoad, staleWhileLoading.before, 'old hero load cannot change current loading status');
    releaseHero = true;
    await Promise.all(heldHeroRoutes.map(route => route.fulfill(fixtureImage)));
    await page.waitForFunction(() => window.currentHeroLoaded);
    assert.match(await page.locator('.sa-explain-image-status').innerText(), /hazır/, 'actual current hero load updates status');
    await page.evaluate(() => document.querySelector('.sa-explain-main img').dispatchEvent(new Event('error')));
    assert.match(await page.locator('.sa-explain-image-status').innerText(), /yüklenemedi/);
    await page.evaluate(() => document.querySelector('.sa-explain-main img').dispatchEvent(new Event('load')));
    assert.match(await page.locator('.sa-explain-image-status').innerText(), /hazır/);
    const activeImageStatus = await page.locator('.sa-explain-image-status').innerText();
    const staleWhileReady = await page.evaluate(() => {
      const status = document.querySelector('.sa-explain-image-status');
      const before = status.textContent;
      window.oldHero.dispatchEvent(new Event('error'));
      const afterError = status.textContent;
      window.oldHero.dispatchEvent(new Event('load'));
      return { before, afterError, afterLoad: status.textContent };
    });
    assert.equal(staleWhileReady.afterError, staleWhileReady.before);
    assert.equal(staleWhileReady.afterLoad, staleWhileReady.before);
    await page.evaluate(() => { window.closedHero = document.querySelector('.sa-explain-main img'); window.closedImageStatus = document.querySelector('.sa-explain-image-status'); });
    await page.getByRole('button', { name: 'Soru sor', exact: true }).click();
    const closedStatuses = await page.evaluate(() => {
      window.closedHero.dispatchEvent(new Event('error'));
      const afterError = window.closedImageStatus.textContent;
      window.closedHero.dispatchEvent(new Event('load'));
      return { afterError, afterLoad: window.closedImageStatus.textContent };
    });
    assert.equal(closedStatuses.afterError, activeImageStatus, 'closed hero error cannot change status');
    assert.equal(closedStatuses.afterLoad, activeImageStatus, 'closed hero load cannot change status');
    await page.evaluate(() => document.removeEventListener('load', window.recordCurrentHeroLoad, true));
    await page.unroute(heldHeroUrl, holdHero); tests++;
    for (const ending of ['mode', 'close', 'event']) {
      await setup(); await click();
      if (ending === 'mode') await page.getByRole('button', { name: 'Soru sor', exact: true }).click();
      if (ending === 'close') await page.getByRole('button', { name: 'Kapat', exact: true }).click();
      if (ending === 'event') await page.evaluate(() => document.querySelector('.mcp-selection-assistant').dispatchEvent(new Event('sa-close')));
      await settle('host_explain_summary', summary); await settle('host_explain_images', images);
      assert.equal(await page.evaluate(() => window.events.filter(e => e.action === 'host_explain_images').length), 1, 'closed/mode switched result cannot refine');
      assert.equal(await page.getByText(summary.summary, { exact: true }).count(), 0);
      tests++;
    }
    await setup(); await page.getByRole('button', { name: 'Çeviri kartı ↗', exact: true }).click();
    assert.equal(await page.evaluate(() => window.translations), 1); tests++;
    // Break caught: summary rejection is swallowed or left in pending instead of retryable classified failure.
    const failureCases = [
      { code: 'EXPLAIN_TIMEOUT', message: 'PRIVATE_RAW_ERROR', want: /süre|zaman aş/i },
      { code: 'BRIDGE_UNAVAILABLE', message: 'PRIVATE_RAW_ERROR', want: /bağlantı|ulaşılam/i },
      { code: 'INVALID_RESPONSE', message: 'PRIVATE_RAW_ERROR', want: /geçerli|biçim|format/i },
    ];
    const backgroundFailures = [];
    for (const failure of failureCases) {
      await setup('PRIVATE_SELECTED_TEXT', 'PRIVATE_CONTEXT'); await click();
      await settle('host_explain_summary', null, { code: failure.code, message: failure.message });
      await settle('host_explain_images', { ...images, candidates: [] });
      try {
        assert.match(await page.locator('.sa-explain-summary-status').innerText(), failure.want);
        assert.doesNotMatch(await page.locator('.sa-explain-summary').innerText(), /hazırlanıyor/);
        assert.equal(await page.getByRole('button', { name: 'Özeti tekrar dene' }).isVisible(), true);
        const reports = await page.evaluate(() => window.events.filter(e => e.action === 'host_assistant_report').map(e => e.payload));
        const summaryReports = reports.filter(e => e.stage === 'explain_summary');
        assert.equal(summaryReports.length, 1); assert.equal(summaryReports[0].code, failure.code);
        for (const report of reports) {
          for (const key of Object.keys(report)) assert.ok(['stage', 'code', 'durationMs', 'requestId', 'visibility'].includes(key));
          assert.ok(Number.isFinite(report.durationMs) && report.durationMs >= 0);
        }
        assert.doesNotMatch(JSON.stringify(reports), /PRIVATE_|context|message|selectedText/);
        await page.getByRole('button', { name: 'Özeti tekrar dene' }).click();
        assert.equal(await page.evaluate(() => window.events.filter(e => e.action === 'host_explain_summary').length), 2);
        assert.equal(await page.evaluate(() => window.events.filter(e => e.action === 'host_explain_images').length), 1);
        await settle('host_explain_summary', { ...summary, visualQuery: '' }, null, 1);
        await page.getByText(summary.summary, { exact: true }).waitFor(); tests++;
      } catch (error) { backgroundFailures.push({ name: failure.code, error: error.message }); }
    }
    // Break caught: an empty provider response is presented as an exception, hiding honest no-results state.
    await setup(); await click();
    await settle('host_explain_summary', { ...summary, visualQuery: '' });
    await settle('host_explain_images', { ...images, candidates: [] });
    try {
      assert.match(await page.locator('.sa-explain-image-status').innerText(), /bulunamadı/);
      assert.equal(await page.getByRole('button', { name: 'Görselleri tekrar dene' }).isVisible(), true);
      const reports = await page.evaluate(() => window.events.filter(e => e.action === 'host_assistant_report' && e.payload.stage === 'explain_images').map(e => e.payload));
      assert.equal(reports.length, 1); assert.equal(reports[0].code, 'IMAGES_EMPTY');
      assert.equal(await page.locator('.sa-explain-summary').innerText(), summary.summary); tests++;
    } catch (error) { backgroundFailures.push({ name: 'empty images', error: error.message }); }
    // Break caught: renderer image loading fails locally without an observable diagnostic event.
    await setup(); await click();
    await settle('host_explain_summary', { ...summary, visualQuery: '' });
    await settle('host_explain_images', { ...images, candidates: images.candidates.slice(0, 1) });
    await page.waitForFunction(() => document.querySelector('.sa-explain-main img')?.naturalWidth > 0);
    await page.evaluate(() => document.querySelector('.sa-explain-main img').dispatchEvent(new Event('error')));
    try {
      assert.match(await page.locator('.sa-explain-image-status').innerText(), /yüklenemedi/);
      const reports = await page.evaluate(() => window.events.filter(e => e.action === 'host_assistant_report' && e.payload.stage === 'image_load' && e.payload.code === 'IMAGE_LOAD_FAILED'));
      assert.equal(reports.length, 1); tests++;
    } catch (error) { backgroundFailures.push({ name: 'local image load', error: error.message }); }
    // Break caught: a manual image retry reuses the failed provider's cached empty result.
    await setup(); await click();
    await settle('host_explain_summary', { ...summary, visualQuery: '' });
    await settle('host_explain_images', { ...images, candidates: [] });
    await page.getByRole('button', { name: 'Görselleri tekrar dene' }).click();
    try {
      const payloads = await page.evaluate(() => window.events.filter(e => e.action === 'host_explain_images').map(e => e.payload));
      assert.equal(payloads[0].forceRefresh, undefined, 'automatic lookup cannot bypass cache');
      assert.equal(payloads[1].forceRefresh, true, 'explicit retry must bypass provider cache');
      await settle('host_explain_images', images, null, 1);
      await page.locator('.sa-explain-counter').getByText('1/5', { exact: true }).waitFor(); tests++;
    } catch (error) { backgroundFailures.push({ name: 'manual force refresh', error: error.message }); }
    // Break caught: a provider outage is disguised as a valid empty image response.
    await setup(); await click();
    await settle('host_explain_summary', { ...summary, visualQuery: '' });
    await settle('host_explain_images', null, { code: 'EXPLAIN_IMAGE_PROVIDER_ERROR', message: 'PRIVATE_PROVIDER_ERROR' });
    try {
      const text = await page.locator('.sa-explain-image-status').innerText();
      assert.match(text, /bağlantı|ulaşılam/i); assert.doesNotMatch(text, /bulunamadı/);
      assert.equal(await page.getByRole('button', { name: 'Görselleri tekrar dene' }).isVisible(), true);
      const reports = await page.evaluate(() => window.events.filter(e => e.action === 'host_assistant_report' && e.payload.stage === 'explain_images').map(e => e.payload));
      assert.equal(reports.length, 1); assert.equal(reports[0].code, 'BRIDGE_UNAVAILABLE');
      assert.doesNotMatch(JSON.stringify(reports), /PRIVATE_PROVIDER_ERROR/); tests++;
    } catch (error) { backgroundFailures.push({ name: 'provider outage distinct', error: error.message }); }
    // Break caught: real callHostTranslateHelper reconstructs Error(message) without error.code.
    for (const wire of [
      { action: 'host_explain_images', message: 'EXPLAIN_IMAGE_PROVIDER_ERROR', stage: 'explain_images', code: 'BRIDGE_UNAVAILABLE', selector: '.sa-explain-image-status', want: /bağlantı|ulaşılam/i, retry: 'Görselleri tekrar dene' },
      { action: 'host_explain_summary', message: 'EXPLAIN_INVALID_RESPONSE', stage: 'explain_summary', code: 'INVALID_RESPONSE', selector: '.sa-explain-summary-status', want: /geçerli|biçim|format/i, retry: 'Özeti tekrar dene' },
    ]) {
      await setup(); await click();
      if (wire.action === 'host_explain_images') await settle('host_explain_summary', { ...summary, visualQuery: '' });
      else await settle('host_explain_images', { ...images, candidates: [] });
      await settle(wire.action, null, wire.message);
      try {
        assert.match(await page.locator(wire.selector).innerText(), wire.want);
        assert.doesNotMatch(await page.locator(wire.selector).innerText(), /EXPLAIN_|bulunamadı/);
        assert.equal(await page.getByRole('button', { name: wire.retry }).isVisible(), true);
        const reports = await page.evaluate(stage => window.events.filter(e => e.action === 'host_assistant_report' && e.payload.stage === stage).map(e => e.payload), wire.stage);
        assert.equal(reports.length, 1); assert.equal(reports[0].code, wire.code);
        for (const key of Object.keys(reports[0])) assert.ok(['stage', 'code', 'durationMs', 'requestId', 'visibility'].includes(key));
        assert.doesNotMatch(JSON.stringify(reports), /EXPLAIN_IMAGE_PROVIDER_ERROR|EXPLAIN_INVALID_RESPONSE|message|selectedText|contextText/); tests++;
      } catch (error) { backgroundFailures.push({ name: 'message-only ' + wire.message, error: error.message }); }
    }
    assert.deepEqual(backgroundFailures, [], 'background explain contract failures');
    const fallbackFailures = [];
    let fallbackTests = 0;
    const rotiferSummary = { ...summary, term: 'Bdelloid rotifer', summary: 'Bdelloid rotifer bir tatlı su mikrohayvanıdır.', visualQuery: 'bdelloid rotifer Bdelloidea' };
    const rawRotifers = { ...images, candidates: images.candidates.map((candidate, index) => ({ ...candidate, title: 'RAW_ROTIFER_' + (index + 1) })) };
    const refinedRotifers = { ...images, candidates: [{ ...images.candidates[1], title: 'REFINED_BDELLOIDEA' }] };
    const emptyRotifers = { ...images, candidates: [] };
    const imagePayloads = () => page.evaluate(() => window.events.filter(event => event.action === 'host_explain_images').map(event => event.payload));
    const imageFrame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    async function assertRawRotifers() {
      assert.equal(await page.locator('.sa-explain-counter').innerText(), '1/5');
      assert.match(await page.locator('.sa-explain-caption').innerText(), /RAW_ROTIFER_1/);
      assert.equal(await page.locator('.sa-explain-gallery').isVisible(), true);
      await page.waitForFunction(() => document.querySelector('.sa-explain-main img')?.naturalWidth > 0);
      assert.match(await page.locator('.sa-explain').innerText(), /bağlam.*doğrulanmadı/, 'raw matches must never be presented as context-verified');
    }
    async function fallbackCheck(name, run) {
      try {
        await setup('Bdelloid rotifer', 'freshwater organism'); await click();
        await run(); fallbackTests++; console.log(JSON.stringify({ imageFallback: name, result: 'PASS' }));
      } catch (error) {
        fallbackFailures.push({ name, error: error.message }); console.error(JSON.stringify({ imageFallback: name, result: 'FAIL', error: error.message }));
      }
    }
    // Break caught: an empty model-refined query erases five valid provisional images.
    await fallbackCheck('raw5 then refined0 retains honest provisional gallery', async () => {
      await settle('host_explain_images', rawRotifers); await assertRawRotifers();
      await settle('host_explain_summary', rotiferSummary);
      assert.equal((await imagePayloads()).length, 2);
      await settle('host_explain_images', emptyRotifers, null, 1);
      await assertRawRotifers();
      assert.equal((await imagePayloads()).length, 2, 'successful raw cache needs no recovery wire call');
      await page.getByRole('button', { name: 'Sonraki görsel' }).click();
      await page.waitForFunction(() => document.querySelector('.sa-explain-main img')?.naturalWidth > 0);
      assert.equal(await page.locator('.sa-explain-counter').innerText(), '2/5');
      assert.match(await page.locator('.sa-explain').innerText(), /bağlam.*doğrulanmadı/, 'image navigation/load cannot remove the uncertainty label');
    });
    // Break caught: generation invalidation discards an already-running raw result and starts a duplicate recovery.
    await fallbackCheck('summary-first refined0 reuses pending raw5', async () => {
      await settle('host_explain_summary', rotiferSummary);
      await settle('host_explain_images', emptyRotifers, null, 1); await imageFrame();
      assert.equal((await imagePayloads()).length, 2, 'reuse the original pending raw lane');
      await settle('host_explain_images', rawRotifers);
      await assertRawRotifers();
      assert.equal((await imagePayloads()).length, 2);
    });
    // Break caught: both empty searches trigger an unbounded raw/refined recovery chain.
    await fallbackCheck('raw0 and refined0 terminate without retry loop', async () => {
      await settle('host_explain_images', emptyRotifers);
      await settle('host_explain_summary', rotiferSummary);
      await settle('host_explain_images', emptyRotifers, null, 1); await imageFrame();
      const beforeRecovery = await imagePayloads();
      assert.ok(beforeRecovery.length >= 2 && beforeRecovery.length <= 3, 'at most one bounded raw recovery');
      if (beforeRecovery.length === 3) {
        assert.equal(beforeRecovery[2].visualQuery, undefined, 'recovery must use only the selected term');
        await settle('host_explain_images', emptyRotifers, null, 2);
      }
      await imageFrame();
      assert.equal((await imagePayloads()).length, beforeRecovery.length, 'a clean empty recovery is terminal');
      assert.equal(await page.locator('.sa-explain-main img').count(), 0);
      assert.match(await page.locator('.sa-explain-image-status').innerText(), /bulunamadı/);
      assert.equal(await page.getByRole('button', { name: 'Görselleri tekrar dene' }).isVisible(), true);
    });
    // Break caught: a previously rejected raw lane is reused as if it had useful successful results.
    await fallbackCheck('failed raw then refined0 makes one fresh raw attempt', async () => {
      await settle('host_explain_images', null, { code: 'EXPLAIN_IMAGE_PROVIDER_ERROR', message: 'EXPLAIN_IMAGE_PROVIDER_ERROR' });
      await settle('host_explain_summary', rotiferSummary);
      await settle('host_explain_images', emptyRotifers, null, 1);
      await page.waitForFunction(() => window.events.filter(event => event.action === 'host_explain_images').length >= 3);
      const payloads = await imagePayloads();
      assert.equal(payloads.length, 3); assert.equal(payloads[2].selectedText, 'Bdelloid rotifer');
      assert.equal(payloads[2].visualQuery, undefined); assert.equal(payloads[2].forceRefresh, undefined);
      await settle('host_explain_images', rawRotifers, null, 2); await assertRawRotifers();
      await imageFrame(); assert.equal((await imagePayloads()).length, 3);
    });
    // Break caught: keeping fallback images hides the explicit retry or drops its forceRefresh contract.
    await fallbackCheck('manual retry of empty refinement stays forceRefresh', async () => {
      await settle('host_explain_images', rawRotifers); await assertRawRotifers();
      await settle('host_explain_summary', rotiferSummary);
      await settle('host_explain_images', emptyRotifers, null, 1);
      const retry = page.getByRole('button', { name: 'Görselleri tekrar dene' });
      assert.equal(await retry.isVisible(), true);
      await retry.click();
      const payloads = await imagePayloads();
      assert.equal(payloads.length, 3); assert.equal(payloads[2].forceRefresh, true);
      assert.equal(payloads[2].visualQuery, 'bdelloid rotifer Bdelloidea');
      await settle('host_explain_images', refinedRotifers, null, 2);
      assert.equal(await page.locator('.sa-explain-counter').innerText(), '1/1');
      assert.match(await page.locator('.sa-explain-caption').innerText(), /REFINED_BDELLOIDEA/);
    });
    // Break caught: fallback adoption lets a late raw response overwrite a successful refined gallery.
    await fallbackCheck('successful refinement wins over late raw response', async () => {
      await settle('host_explain_summary', rotiferSummary);
      await settle('host_explain_images', refinedRotifers, null, 1);
      await settle('host_explain_images', rawRotifers); await imageFrame();
      assert.equal(await page.locator('.sa-explain-counter').innerText(), '1/1');
      assert.match(await page.locator('.sa-explain-caption').innerText(), /REFINED_BDELLOIDEA/);
      assert.doesNotMatch(await page.locator('.sa-explain-caption').innerText(), /RAW_ROTIFER/);
      assert.equal((await imagePayloads()).length, 2);
    });
    // Break caught: pending raw recovery updates a panel whose generation was cancelled by a mode switch.
    await fallbackCheck('closed fallback owner ignores late raw completion', async () => {
      await settle('host_explain_summary', rotiferSummary);
      await settle('host_explain_images', emptyRotifers, null, 1);
      await page.getByRole('button', { name: 'Soru sor', exact: true }).click();
      const before = await page.locator('.sa-explain').textContent();
      await settle('host_explain_images', rawRotifers); await imageFrame();
      assert.equal(await page.locator('.sa-explain').textContent(), before);
      assert.equal(await page.locator('.sa-explain').isVisible(), false);
      assert.equal(await page.locator('.sa-explain-main img').count(), 0);
      assert.equal((await imagePayloads()).length, 2, 'a cancelled generation cannot initiate recovery');
    });
    // Break caught: a refinement failure is silently hidden by keeping the raw gallery or by its later image load.
    await fallbackCheck('refinement error preserves gallery without claiming verification', async () => {
      await settle('host_explain_images', rawRotifers); await assertRawRotifers();
      await settle('host_explain_summary', rotiferSummary);
      await settle('host_explain_images', null, { code: 'EXPLAIN_IMAGE_PROVIDER_ERROR', message: 'EXPLAIN_IMAGE_PROVIDER_ERROR' }, 1);
      assert.equal(await page.locator('.sa-explain-counter').innerText(), '1/5');
      assert.match(await page.locator('.sa-explain-caption').innerText(), /RAW_ROTIFER_1/);
      assert.match(await page.locator('.sa-explain').innerText(), /bağlantı|ulaşılam/i);
      assert.match(await page.locator('.sa-explain').innerText(), /bağlam.*doğrulanmadı/);
      assert.equal(await page.getByRole('button', { name: 'Görselleri tekrar dene' }).isVisible(), true);
      await page.getByRole('button', { name: 'Sonraki görsel' }).click();
      await page.waitForFunction(() => document.querySelector('.sa-explain-main img')?.naturalWidth > 0);
      assert.match(await page.locator('.sa-explain').innerText(), /bağlantı|ulaşılam/i, 'gallery navigation cannot erase the refinement failure');
      assert.match(await page.locator('.sa-explain').innerText(), /bağlam.*doğrulanmadı/);
      assert.equal((await imagePayloads()).length, 2);
    });
    console.log(JSON.stringify({ imageFallbackTests: fallbackTests, failures: fallbackFailures }));
    assert.deepEqual(fallbackFailures, [], 'image fallback regressions');
    tests += fallbackTests;
    const previewFailures = [];
    // Break caught: the first SearX result gets stuck forever, or a ranking
    // refresh jumps the reader's selected image / silently fetches an original.
    await setup(); await click();
    await settle('host_explain_summary', {...summary,visualQuery:''});
    const progressive={...images,rankingPending:true,candidates:images.candidates.map(item=>({...item,previewOnly:true}))};
    await settle('host_explain_images',progressive);
    await page.getByRole('button',{name:'Sonraki görsel',exact:true}).click();
    await page.waitForFunction(()=>window.pending.filter(p=>p.action==='host_explain_images').length===2);
    assert.equal(await page.evaluate(()=>window.events.filter(e=>e.action==='host_explain_images')[1].payload.forceRefresh),true);
    await page.getByRole('button',{name:'Görseli büyüt',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.sa-explain-enlarged img')?.complete && document.querySelector('.sa-explain-enlarged img')?.naturalWidth > 0);
    await page.evaluate(()=>{window.retainedPreview=document.querySelector('.sa-explain-main img');window.retainedModal=document.querySelector('.sa-explain-enlarged img');});
    await settle('host_explain_images',progressive,null,1);
    await page.evaluate(()=>{window.retainedPreview.dispatchEvent(new Event('error'));window.retainedModal.dispatchEvent(new Event('error'));});
    assert.match(await page.locator('.sa-explain-image-status').innerText(),/yüklenemedi/,'unchanged polling must keep main image error ownership');
    assert.match(await page.locator('.sa-explain-enlarged-status').innerText(),/yüklenemedi/,'unchanged polling must keep modal error ownership');
    assert.equal(await page.evaluate(()=>window.retainedPreview===document.querySelector('.sa-explain-main img')),true,'polling must not replace an unchanged image');
    await page.getByRole('button',{name:'Büyütülmüş görseli kapat',exact:true}).click();
    await page.waitForFunction(()=>window.pending.filter(p=>p.action==='host_explain_images').length===3);
    await settle('host_explain_images',{...progressive,rankingPending:false,ranker:'OpenCLIP',candidates:[4,1,0,2,3].map(i=>progressive.candidates[i])},null,2);
    await page.waitForFunction(()=>document.querySelector('.sa-explain-image-status').textContent.includes('OpenCLIP'));
    assert.equal(await page.locator('.sa-explain-main img').getAttribute('src'),images.candidates[1].imageUrl,'ranking must preserve the chosen alternative');
    await page.getByRole('button',{name:'Görseli büyüt',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.sa-explain-enlarged-status').textContent.includes('Önizleme'));
    assert.doesNotMatch(await page.locator('.sa-explain-enlarged-status').innerText(),/Orijinal/);
    await page.getByRole('button',{name:'Büyütülmüş görseli kapat',exact:true}).click();
    tests++;
    await setup();await click();await settle('host_explain_summary',{...summary,visualQuery:''});await settle('host_explain_images',progressive);
    await page.getByRole('button',{name:'Soru sor',exact:true}).click();
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(()=>window.events.filter(e=>e.action==='host_explain_images').length),1,'closed card must not keep polling');
    await page.getByRole('button',{name:'Düzenle',exact:true}).click();await click();
    // A real cached load may still be queued after reopening. Inject the error
    // only after that load settles, otherwise it correctly supersedes our fake
    // error and this ownership assertion becomes a scheduler race.
    await page.waitForFunction(()=>document.querySelector('.sa-explain-main img')?.complete && document.querySelector('.sa-explain-main img')?.naturalWidth > 0);
    await page.evaluate(()=>document.querySelector('.sa-explain-main img').dispatchEvent(new Event('error')));
    assert.match(await page.locator('.sa-explain-image-status').innerText(),/yüklenemedi/,'reopened card must own its cached image events');
    tests++;
    let previewTests = 0;
    const previewSvg = { status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#8cbbc5"/></svg>' };
    const previewHttpFailure = { status: 424, contentType: 'text/plain', body: 'Failed Dependency' };
    const previewImages = key => ({ ...images, candidates: images.candidates.map((candidate, index) => ({ ...candidate,
      imageUrl: `https://preview-original.example/${key}/${index}.jpg`, thumbnailUrl: `https://preview-transport.example/${key}/${index}.svg`, title: 'PREVIEW_CANDIDATE_' + (index + 1),
    })) });
    async function previewCheck(name, run) {
      const originals = [], requests = [], held = [];
      try {
        await setup('Bdelloid rotifer', 'freshwater organism');
        await page.evaluate(() => {
          window.mainPreviewNodes = [];
          window.mainPreviewObserver = new MutationObserver(records => {
            for (const record of records) for (const node of record.addedNodes) {
              if (node.nodeName === 'IMG') window.mainPreviewNodes.push(node);
            }
          });
          window.mainPreviewObserver.observe(document.querySelector('.sa-explain-main'), { childList: true });
        });
        await page.route('https://preview-original.example/**', route => { originals.push(route.request().url()); return route.fulfill(previewSvg); });
        await run({ originals, requests, held });
        previewTests++; console.log(JSON.stringify({ imagePreview: name, result: 'PASS' }));
      } catch (error) {
        previewFailures.push({ name, error: error.message }); console.error(JSON.stringify({ imagePreview: name, result: 'FAIL', error: error.message }));
      } finally {
        for (const route of held) { try { await route.fulfill(previewHttpFailure); } catch {} }
        await page.evaluate(() => window.mainPreviewObserver?.disconnect());
        await page.unroute('https://preview-transport.example/**'); await page.unroute('https://preview-original.example/**');
      }
    }
    // Break caught: a real HTTP-failed supplied thumbnail strands the hero although the next preview loads.
    await previewCheck('HTTP424 preview advances without full-original download', async ({ originals, requests, held }) => {
      let firstRequested;
      const firstRequest = new Promise(resolve => { firstRequested = resolve; });
      await page.route('https://preview-transport.example/**', route => {
        requests.push(route.request().url());
        if (route.request().url().endsWith('/0.svg')) { held.push(route); firstRequested(); return; }
        return route.fulfill(previewSvg);
      });
      await click();
      await settle('host_explain_summary', rotiferSummary);
      await settle('host_explain_images', null, { code: 'EXPLAIN_IMAGE_PROVIDER_ERROR', message: 'EXPLAIN_IMAGE_PROVIDER_ERROR' }, 1);
      await settle('host_explain_images', previewImages('one-fails'));
      await page.waitForFunction(() => window.mainPreviewNodes.length === 1);
      await awaitRequest(firstRequest, 'first thumbnail HTTP request missing');
      await imageFrame();
      assert.ok(held.length > 0, 'actual thumbnail HTTP request must reach the controlled boundary');
      assert.match(await page.locator('.sa-explain').innerText(), /bağlam.*doğrulanmadı/);
      assert.match(await page.locator('.sa-explain').innerText(), /bağlantı|ulaşılam/i);
      await Promise.all(held.splice(0).map(route => route.fulfill(previewHttpFailure)));
      await page.waitForFunction(() => { const img = document.querySelector('.sa-explain-main img'); return img?.src.endsWith('/one-fails/1.svg') && img.complete && img.naturalWidth === 120; });
      assert.equal(await page.locator('.sa-explain-counter').innerText(), '2/5');
      assert.match(await page.locator('.sa-explain-caption').innerText(), /PREVIEW_CANDIDATE_2/);
      assert.deepEqual(await page.evaluate(() => window.mainPreviewNodes.map(node => [new URL(node.src).pathname, node.complete, node.naturalWidth])), [['/one-fails/0.svg', true, 0], ['/one-fails/1.svg', true, 120]]);
      assert.deepEqual(originals, [], 'no huge original may be fetched automatically after a thumbnail failure');
      assert.match(await page.locator('.sa-explain').innerText(), /bağlam.*doğrulanmadı/);
      assert.match(await page.locator('.sa-explain').innerText(), /bağlantı|ulaşılam/i, 'auto-advance must preserve the independent refinement failure notice');
      assert.equal((await imagePayloads()).length, 2, 'preview failures cannot launch another provider/model request');
      assert.equal(await page.evaluate(() => window.events.filter(event => event.action === 'host_assistant_report' && event.payload.stage === 'image_load' && event.payload.code === 'IMAGE_LOAD_FAILED').length), 1);
    });
    // Break caught: automatically skipping failed previews wraps around forever or falls back to full originals.
    await previewCheck('five native preview failures terminate within five main attempts', async ({ originals, requests }) => {
      await page.route('https://preview-transport.example/**', route => { requests.push(route.request().url()); return route.fulfill(previewHttpFailure); });
      await click(); await settle('host_explain_summary', { ...rotiferSummary, visualQuery: '' });
      await settle('host_explain_images', previewImages('all-fail'));
      await page.waitForFunction(() => window.mainPreviewNodes.length >= 5 && window.mainPreviewNodes.every(node => node.complete && node.naturalWidth === 0));
      await imageFrame();
      const attempts = await page.evaluate(() => window.mainPreviewNodes.map(node => node.src));
      assert.equal(attempts.length, 5, 'bounded main-image attempts, not thumbnail prefetch request counts');
      assert.equal(new Set(attempts).size, 5, 'a failed preview cannot be automatically revisited');
      assert.deepEqual(attempts.map(url => new URL(url).pathname), ['/all-fail/0.svg', '/all-fail/1.svg', '/all-fail/2.svg', '/all-fail/3.svg', '/all-fail/4.svg']);
      const statusText = await page.locator('.sa-explain-image-status').innerText();
      assert.match(statusText, /yüklenemedi|bulunamadı/); assert.doesNotMatch(statusText, /yükleniyor/);
      assert.deepEqual(originals, []);
      assert.equal((await imagePayloads()).length, 1);
      assert.equal(await page.evaluate(() => window.events.filter(event => event.action === 'host_assistant_report' && event.payload.stage === 'image_load' && event.payload.code === 'IMAGE_LOAD_FAILED').length), 5);
      await imageFrame(); assert.equal(await page.evaluate(() => window.mainPreviewNodes.length), 5, 'terminal error must not schedule another attempt');
    });
    // Break caught: an actual failed response arriving after mode close mutates the stale gallery or auto-selects.
    await previewCheck('closed generation ignores held HTTP failure', async ({ originals, requests, held }) => {
      let firstRequested;
      const firstRequest = new Promise(resolve => { firstRequested = resolve; });
      await page.route('https://preview-transport.example/**', route => {
        requests.push(route.request().url());
        if (route.request().url().endsWith('/0.svg')) { held.push(route); firstRequested(); return; }
        return route.fulfill(previewSvg);
      });
      await click(); await settle('host_explain_summary', { ...rotiferSummary, visualQuery: '' });
      await settle('host_explain_images', previewImages('closed'));
      await page.waitForFunction(() => window.mainPreviewNodes.length === 1);
      await awaitRequest(firstRequest, 'held thumbnail HTTP request missing');
      await imageFrame(); assert.ok(held.length > 0);
      await page.getByRole('button', { name: 'Soru sor', exact: true }).click();
      const before = await page.locator('.sa-explain').textContent();
      const requestCount = requests.length;
      await Promise.all(held.splice(0).map(route => route.fulfill(previewHttpFailure)));
      await page.waitForFunction(() => window.mainPreviewNodes[0].complete && window.mainPreviewNodes[0].naturalWidth === 0);
      await imageFrame();
      assert.equal(await page.locator('.sa-explain').textContent(), before);
      assert.equal(await page.locator('.sa-explain').isVisible(), false);
      assert.equal(await page.evaluate(() => window.mainPreviewNodes.length), 1, 'closed owner cannot auto-select the next preview');
      assert.equal(requests.length, requestCount); assert.deepEqual(originals, []);
      assert.equal((await imagePayloads()).length, 1);
      assert.equal(await page.evaluate(() => window.events.filter(event => event.action === 'host_assistant_report' && event.payload.stage === 'image_load' && event.payload.code === 'IMAGE_LOAD_FAILED').length), 0, 'stale image events cannot report a current load failure');
    });
    console.log(JSON.stringify({ imagePreviewTests: previewTests, failures: previewFailures }));
    assert.deepEqual(previewFailures, [], 'native preview transport regressions');
    tests += previewTests;
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ tests, result: 'PASS', artifacts }));
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
