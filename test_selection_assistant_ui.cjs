'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const open = require('./selection-assistant-ui.cjs');
async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  try {
    await lifecycleTests(browser);
    for (const viewport of [{ width: 1000, height: 800 }, { width: 390, height: 720 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await page.setContent('<body style="margin:0;background:#15151b;display:grid;place-items:center;min-height:100vh"><main id="popup" style="box-sizing:border-box;width:700px;max-width:calc(100vw - 24px);padding:18px;border-radius:16px;background:#20202a;border:1px solid #5c557f;box-shadow:0 20px 70px #0005"></main></body>');
      await page.evaluate(`(${open.toString()})({
        capture:()=>({selectedText:'Örnek metin'}),
        show:(_,o)=>document.querySelector('#popup').append(o.contentNode),
        close:()=>{},translate:()=>{},
        call:async(action,payload)=>{
          window.calls = [...(window.calls||[]),action];
          if(action==='host_assistant_chat') window.chatRequests=[...(window.chatRequests||[]),JSON.parse(JSON.stringify(payload))];
          if(action==='host_assistant_status')return {model:'gpt-test-exact',reasoningEffort:'low',pluginConnected:true,connection:{ok:true,checkedAt:new Date().toISOString(),durationMs:100}};
          if(action==='host_assistant_chat')return {requestId:'job-'+window.chatRequests.length,status:'running'};
          if(action==='host_assistant_job_status')return {requestId:payload.requestId,status:'completed',elapsedMs:1000,phase:'completed',answer:'Pattern özel isim değildir. Genellikle **küçük harfle** yazılır.\\n\\nCümle başında büyük harfle başlayabilir.'};
          if(action==='host_assistant_capture')return {captureId:'test',segments:[['Bu bir denme yazısıdr.'],['Notlarımı daha duzenli yazmak istiyorm.']],editable:true};
          if(action==='host_assistant_preview')return {planId:'test-plan',segments:[['Bu bir deneme yazısıdır.'],['Notlarımı daha düzenli yazmak istiyorum.']],original:[['Bu bir denme yazısıdr.'],['Notlarımı daha duzenli yazmak istiyorm.']],editable:true};
          if(action==='host_assistant_apply')return {success:true,changedRows:2};
          if(action==='host_assistant_remnote_chat')return {sessionId:'mcp-session',answer:'İşlem hazır; henüz değiştirilmedi.',trace:[{action:'search'}],approval:{planId:'mcp-plan',action:'update_note',payload:{remId:'abcdefghijklmnop1',appendContent:'Yeni madde'},targets:[{remId:'abcdefghijklmnop1',title:'Test notu'}]}};
          if(action==='host_assistant_remnote_approve')return {answer:'Test notuna madde eklendi.',mutationApplied:true};
          throw new Error('unexpected action');
        }
      },'note')`);
      await page.getByRole('button', { name: 'İmla düzelt', exact: true }).click();
      await page.getByRole('button', { name: 'Model ve bağlantı bilgisi', exact: true }).click();
      await page.getByText(/Model: gpt-test-exact/).waitFor();
      assert.match(await page.locator('.sa-info-body').innerText(), /Low \(düşük\)/);
      await page.getByRole('button', { name: 'Model ve bağlantı bilgisi', exact: true }).click();
      await page.getByText('Hazır. Önce / Sonra ile karşılaştırabilirsin.', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Uygula', exact: true }).isEnabled(), true);
      assert.equal(await page.evaluate(() => window.calls.includes('host_assistant_apply')), false);
      await page.getByRole('button', { name: 'Soru sor', exact: true }).click();
      await page.getByRole('textbox', { name: 'Seçili metin için komut' }).fill('Pattern özel isim mi?');
      await page.getByRole('button', { name: 'Mesajı gönder', exact: true }).click();
      await page.getByText('Yanıt hazır. Devam sorusu sorabilirsin.', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Uygula', exact: true }).count(), 0);
      assert.match(await page.locator('.sa-result').innerText(), /Pattern özel isim değildir/);
      assert.equal(await page.locator('.sa-message-user').count(), 1);
      assert.equal(await page.locator('.sa-message-assistant strong').innerText(), 'küçük harfle');
      assert.equal(await page.locator('.sa-message-assistant').evaluate(el => getComputedStyle(el).alignSelf), 'flex-start');
      assert.equal(await page.locator('.sa-message-user').evaluate(el => getComputedStyle(el).alignSelf), 'flex-end');
      if (viewport.width === 1000) await page.locator('#popup').screenshot({ path: path.resolve(__dirname, '../../Temp/remnote_selection_assistant_chat_preview.png') });
      const below = await page.evaluate(() => document.querySelector('.sa-composer').getBoundingClientRect().top >= document.querySelector('.sa-result-shell').getBoundingClientRect().bottom);
      assert.equal(below, true);
      const input = page.getByRole('textbox', { name: 'Seçili metin için komut' });
      await input.fill('Bir örnek ver');
      await input.press('Shift+Enter');
      assert.match(await input.inputValue(), /\n/);
      assert.equal(await page.evaluate(() => window.chatRequests.length), 1);
      await input.press('Enter');
      await page.waitForFunction(() => window.chatRequests.length === 2 && document.querySelectorAll('.sa-message-assistant').length === 2);
      assert.equal(await page.evaluate(() => window.chatRequests[1].messages.length), 2);
      assert.equal(await page.evaluate(() => window.calls.includes('host_assistant_apply')), false);
      await page.getByRole('button', { name: 'Düzenle', exact: true }).click();
      await page.getByRole('button', { name: 'RemNote · MCP', exact: true }).click();
      await page.getByRole('textbox', { name: 'RemNote isteği', exact: true }).fill('Test notuna madde ekle');
      await page.getByRole('button', { name: 'RemNote isteğini gönder', exact: true }).click();
      await page.getByText(/ONAY BEKLEYEN İŞLEM/).waitFor();
      assert.equal(await page.evaluate(() => window.calls.includes('host_assistant_remnote_approve')), false);
      assert.match(await page.locator('.sa-mcp-approval').innerText(), /Yeni madde/);
      const mcpGeometry = await page.locator('#popup').evaluate(el => {
        const r = el.getBoundingClientRect(); return { inside: r.top >= 0 && r.bottom <= innerHeight, overflow: el.scrollWidth > el.clientWidth };
      });
      assert.deepEqual(mcpGeometry, { inside: true, overflow: false });
      if (viewport.width === 1000) await page.locator('#popup').screenshot({ path: path.resolve(__dirname, '../../Temp/remnote_assistant_mcp_preview.png') });
      await page.getByRole('button', { name: 'Onayla ve uygula', exact: true }).click();
      await page.getByText('Test notuna madde eklendi.', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.calls.filter(x => x === 'host_assistant_remnote_approve').length), 1);
      await page.getByRole('button', { name: 'Düzenle', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Uygula', exact: true }).isEnabled(), true);
      await page.getByRole('button', { name: 'Önce', exact: true }).click();
      assert.match(await page.locator('.sa-result').innerText(), /denme yazısıdr/);
      await page.getByRole('button', { name: 'Sonra', exact: true }).click();
      const geometry = await page.evaluate(() => {
        const popup = document.querySelector('#popup'), apply = document.querySelector('.sa-apply');
        const r = popup.getBoundingClientRect(), b = apply.getBoundingClientRect();
        return { inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, footerVisible: b.bottom <= innerHeight && b.top >= 0, horizontalOverflow: popup.scrollWidth > popup.clientWidth };
      });
      assert.deepEqual(geometry, { inside: true, footerVisible: true, horizontalOverflow: false });
      if (viewport.width === 1000) await page.locator('#popup').screenshot({ path: path.resolve(__dirname, '../../Temp/remnote_selection_assistant_preview.png') });
      const longResult = await page.evaluate(() => {
        const result = document.querySelector('.sa-result');
        result.textContent = ('Uzun bir sonuçta düğmeler görünür kalmalıdır. '.repeat(8) + '\n\n').repeat(25);
        const footer = document.querySelector('.sa-footer').getBoundingClientRect();
        return { scrolls: result.scrollHeight > result.clientHeight, footerVisible: footer.bottom <= innerHeight && footer.top >= 0 };
      });
      assert.deepEqual(longResult, { scrolls: true, footerVisible: true });
      await page.getByRole('button', { name: 'Uygula', exact: true }).click();
      await page.getByText('2 satır güncellendi.', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.calls.filter(x => x === 'host_assistant_apply').length), 1);
      console.log(JSON.stringify({ viewport, geometry, previewAndConfirm: 'PASS' }));
      await context.close();
    }
    await backgroundContractTests(browser);
  } finally { await browser.close(); }
}
async function lifecycleTests(browser) {
  const page = await browser.newPage();
  let count = 0;
  async function setup(options = {}) {
    await page.setContent('<main id="popup"></main>');
    await page.evaluate(({ source, options }) => {
      window.events = []; window.options = options; let requests = 0;
      const answer = { requestId:'job-1',status:'completed',elapsedMs:2000,phase:'completed',answer:'Gecikmiş cevap' };
      (0,eval)('('+source+')')({
        capture:()=>({selectedText:'metin'}), show:(_,o)=>document.querySelector('#popup').append(o.contentNode),
        close:()=>document.querySelector('.mcp-selection-assistant').remove(), translate:()=>{},
        call:async(action,payload)=>{
          window.events.push({action,payload,time:performance.now()});
          if(action==='host_assistant_capture')return {captureId:'capture',segments:[['metin']],editable:true};
          if(action==='host_assistant_chat') {
            requests++;
            if(options.delayStart) await new Promise(resolve=>window.resolveStart=resolve);
            return {requestId:'job-'+requests,status:'running'};
          }
          if(action==='host_assistant_job_cancel')return {requestId:payload.requestId,status:'cancelled'};
          if(action==='host_assistant_job_status') {
            if(payload.requestId==='job-2')return {requestId:'job-2',status:'completed',elapsedMs:1000,phase:'completed',answer:'Yeni cevap'};
            if(options.delayStatus) return new Promise(resolve=>window.resolveStatus=()=>resolve(answer));
            return options.error ? {requestId:'job-1',status:'error',elapsedMs:2000,phase:'error',code:'ASSISTANT_TIMEOUT',error:'timeout'} : {requestId:'job-1',status:'running',elapsedMs:1500,phase:'model'};
          }
          throw new Error(action);
        }
      },'note');
    }, {source:open.toString(),options});
    await page.getByRole('button',{name:'Soru sor',exact:true}).click();
    await page.getByRole('textbox',{name:'Seçili metin için komut'}).fill('Sorumu koru');
    await page.getByRole('button',{name:'Mesajı gönder',exact:true}).click();
    await page.waitForFunction(()=>window.events.some(e=>e.action==='host_assistant_chat'));
    assert.equal(await page.evaluate(()=>window.events.find(e=>e.action==='host_assistant_chat').payload.async),true);
  }
  async function stopped() {
    const polls = await page.evaluate(()=>window.events.filter(e=>e.action==='host_assistant_job_status').length);
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(()=>window.events.filter(e=>e.action==='host_assistant_job_status').length),polls);
    assert.equal(await page.evaluate(()=>window.events.filter(e=>e.action==='host_assistant_job_cancel').length),1);
  }
  try {
    for(const ending of ['cancel','close','event','remove','hide']) {
      await setup({delayStatus:true});
      await page.waitForFunction(()=>typeof window.resolveStatus==='function');
      if(ending==='cancel')await page.getByRole('button',{name:'Yanıtı iptal et',exact:true}).click();
      if(ending==='close')await page.getByRole('button',{name:'Kapat',exact:true}).click();
      if(ending==='event')await page.evaluate(()=>document.querySelector('.mcp-selection-assistant').dispatchEvent(new Event('sa-close')));
      if(ending==='remove')await page.evaluate(()=>document.querySelector('.mcp-selection-assistant').remove());
      if(ending==='hide')await page.evaluate(()=>document.querySelector('#popup').style.display='none');
      await page.waitForFunction(()=>window.events.some(e=>e.action==='host_assistant_job_cancel'));
      await page.evaluate(()=>window.resolveStatus());
      await stopped();
      assert.equal(await page.locator('.sa-message-assistant').count(),0);
      if(ending==='cancel'||ending==='event') assert.equal(await page.getByRole('textbox',{name:'Seçili metin için komut'}).inputValue(),'Sorumu koru');
      count++;
    }
    await setup({delayStart:true});
    await page.getByRole('button',{name:'Kapat',exact:true}).click();
    await page.evaluate(()=>window.resolveStart());
    await page.waitForFunction(()=>window.events.some(e=>e.action==='host_assistant_job_cancel'));
    await stopped(); count++;
    await setup({error:true});
    await page.waitForFunction(()=>document.querySelector('.sa-status').dataset.kind==='error');
    assert.equal(await page.getByRole('textbox',{name:'Seçili metin için komut'}).inputValue(),'Sorumu koru');
    assert.match(await page.locator('.sa-status').first().innerText(),/zaman|süre/i); count++;
    await setup();
    await page.waitForFunction(()=>window.events.filter(e=>e.action==='host_assistant_job_status').length>=2);
    const times=await page.evaluate(()=>window.events.filter(e=>e.action==='host_assistant_job_status').map(e=>e.time));
    assert.ok(times[1]-times[0]>=490,'poll must be bounded at >=500ms');
    assert.match(await page.locator('.sa-status').first().innerText(),/1[,.]5 sn/);
    await page.getByRole('button',{name:'Yanıtı iptal et',exact:true}).click(); await stopped(); count++;
    await setup({delayStatus:true});
    await page.waitForFunction(()=>typeof window.resolveStatus==='function');
    await page.getByRole('button',{name:'Yanıtı iptal et',exact:true}).click();
    await page.getByRole('textbox',{name:'Seçili metin için komut'}).fill('Yeni sorum');
    await page.getByRole('button',{name:'Mesajı gönder',exact:true}).click();
    await page.getByText('Yeni cevap',{exact:true}).waitFor();
    await page.evaluate(()=>window.resolveStatus());
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.sa-message-assistant').count(),1);
    assert.equal(await page.locator('.sa-message-user').innerText(),'SEN\nYeni sorum');
    assert.equal(await page.getByRole('textbox',{name:'Seçili metin için komut'}).inputValue(),''); count++;
    console.log(JSON.stringify({lifecycleTests:count,result:'PASS'}));
  } finally {await page.close();}
}
async function backgroundContractTests(browser) {
  const failures = [];
  let tests = 0;
  async function fixture(options = {}) {
    const page = await browser.newPage();
    page.setDefaultTimeout(1800);
    await page.setContent('<main id="popup"></main>');
    await page.evaluate(({ source, options }) => {
      window.events = []; window.pending = []; window.pollTimers = [];
      window.uiErrors = []; window.addEventListener('unhandledrejection', e => window.uiErrors.push(String(e.reason)));
      const realTimeout = window.setTimeout.bind(window);
      window.setTimeout = (fn, delay, ...args) => {
        if (delay === 750) { window.pollTimers.push(() => fn(...args)); return 987654; }
        return realTimeout(fn, delay, ...args);
      };
      let starts = 0;
      (0, eval)('(' + source + ')')({
        capture: () => ({ selectedText: 'PRIVATE_SELECTION_CANARY', contextText: 'PRIVATE_CONTEXT_CANARY' }),
        show: (_, o) => document.querySelector('#popup').append(o.contentNode),
        close: () => document.querySelector('.mcp-selection-assistant').remove(), translate: () => {},
        call: async (action, payload) => {
          window.events.push({ action, payload: JSON.parse(JSON.stringify(payload)) });
          if (action === 'host_assistant_capture') return { captureId: 'capture', segments: [['metin']], editable: true };
          if (action === 'host_assistant_status') return { model: 'fixture', reasoningEffort: 'low', pluginConnected: true };
          if (action === 'host_assistant_chat') {
            starts++;
            if (options.startError) throw Object.assign(new Error(options.startErrorMessage || 'PRIVATE_RAW_ERROR_CANARY'), options.messageOnly ? {} : { code: options.startErrorCode || 'BRIDGE_UNAVAILABLE' });
            if (options.delayStart) await new Promise(resolve => { window.releaseStart = resolve; });
            return { requestId: 'job-' + starts, status: 'running', ...(options.legacy ? {} : { statusWait: true }) };
          }
          if (action === 'host_assistant_job_status') return new Promise((resolve, reject) => window.pending.push({ payload, resolve, reject }));
          if (action === 'host_assistant_job_cancel') return { requestId: payload.requestId, status: 'cancelled' };
          if (action === 'host_assistant_report') {
            if (options.reportFailure) throw new Error('diagnostic route unavailable');
            return { readOnly: true, mutationApplied: false };
          }
          if (action === 'host_assistant_diagnostics') return {
            readOnly: true, mutationApplied: false,
            events: [{ stage: 'chat_wait', code: 'CODEX_TIMEOUT', timestamp: '2026-10-14T10:11:12Z', durationMs: 1234, visibility: 'visible', message: 'PRIVATE_DIAGNOSTIC_CANARY' }, { stage: 'chat_start', code: 'CAPACITY_LIMIT', timestamp: '2026-10-14T10:12:13Z', durationMs: 0, visibility: 'unknown' }],
            explain: options.explainPhaseFlood ? Array.from({ length: 128 }, (_, index) => ({ requestId: '019f0000-0000-7000-8000-' + String(index).padStart(12, '0'), model: 'gpt-6.1-sol', reasoningEffort: 'medium', phase: 'completed', elapsedMs: 1200, deadlineMs: 25000, remainingMs: 23800, stdoutBytes: 0, stderrBytes: 0, outputBytes: 48, exitCode: 0, garbage: 'PRIVATE_PHASE_CANARY' })) : [],
          };
          throw new Error('unexpected ' + action);
        },
      }, 'note');
    }, { source: open.toString(), options });
    return page;
  }
  async function send(page, text = 'PRIVATE_QUESTION_CANARY') {
    await page.getByRole('button', { name: 'Soru sor', exact: true }).click();
    await page.getByRole('textbox', { name: 'Seçili metin için komut' }).fill(text);
    await page.getByRole('button', { name: 'Mesajı gönder', exact: true }).click();
  }
  async function settle(page, index = 0, extra = {}) {
    await page.evaluate(({ index, extra }) => {
      const p = window.pending[index];
      p.resolve({ requestId: p.payload.requestId, status: 'completed', elapsedMs: 12, phase: 'completed', answer: 'SUNUCU_YANITI', ...extra });
    }, { index, extra });
  }
  async function check(name, options, run) {
    const page = await fixture(options);
    try { await run(page); tests++; console.log(JSON.stringify({ backgroundUi: name, result: 'PASS' })); }
    catch (error) { failures.push({ name, error: error.message }); console.error(JSON.stringify({ backgroundUi: name, result: 'FAIL', error: error.message })); }
    finally { await page.close(); }
  }
  // Break caught: a new host still depends on the renderer's paused 750ms timer.
  await check('server wait renders without any 750ms timer', {}, async page => {
    await send(page);
    await page.waitForFunction(() => window.pending.length === 1);
    assert.equal(await page.evaluate(() => window.pollTimers.length), 0);
    assert.deepEqual(await page.evaluate(() => window.pending[0].payload), { requestId: 'job-1', waitMs: 20000 });
    await settle(page);
    await page.getByText('SUNUCU_YANITI', { exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Seçili metin için komut' }).inputValue(), '');
    assert.equal(await page.evaluate(() => window.pollTimers.length), 0);
  });
  // Break caught: dropping the fallback causes a tight polling loop on old hosts.
  await check('legacy host waits for renderer fallback', { legacy: true }, async page => {
    await send(page);
    await page.waitForFunction(() => window.pollTimers.length === 1);
    assert.equal(await page.evaluate(() => window.pending.length), 0);
    await page.evaluate(() => window.pollTimers.shift()());
    await page.waitForFunction(() => window.pending.length === 1);
    assert.deepEqual(await page.evaluate(() => window.pending[0].payload), { requestId: 'job-1' });
    await settle(page);
    await page.getByText('SUNUCU_YANITI', { exact: true }).waitFor();
  });
  // Break caught: a resolved long-poll continues an obsolete generation after cancel.
  await check('cancelled server wait cannot overwrite next generation', {}, async page => {
    await send(page);
    await page.waitForFunction(() => window.pending.length === 1);
    await page.getByRole('button', { name: 'Yanıtı iptal et', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Seçili metin için komut' }).inputValue(), 'PRIVATE_QUESTION_CANARY');
    await page.getByRole('textbox', { name: 'Seçili metin için komut' }).fill('Yeni soru');
    await page.getByRole('button', { name: 'Mesajı gönder', exact: true }).click();
    await page.waitForFunction(() => window.pending.length === 2);
    await settle(page, 1, { answer: 'YENI_YANIT' });
    await page.getByText('YENI_YANIT', { exact: true }).waitFor();
    await settle(page, 0, { answer: 'ESKI_YANIT' });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('.sa-message-assistant').count(), 1);
    assert.equal(await page.getByText('ESKI_YANIT', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.events.filter(e => e.action === 'host_assistant_job_cancel').length), 1);
    assert.equal(await page.evaluate(() => window.pending.length), 2);
  });
  // Break caught: a start accepted after panel closure is never cancelled.
  await check('queued acceptance is cancelled after panel closes', { delayStart: true }, async page => {
    await send(page); await page.waitForFunction(() => typeof window.releaseStart === 'function');
    await page.getByRole('button', { name: 'Kapat', exact: true }).click();
    await page.evaluate(() => window.releaseStart());
    await page.waitForFunction(() => window.events.some(e => e.action === 'host_assistant_job_cancel'));
    assert.equal(await page.evaluate(() => window.pending.length), 0);
    assert.equal(await page.evaluate(() => window.events.filter(e => e.action === 'host_assistant_job_cancel').length), 1);
  });
  // Break caught: diagnostics failures reject the successful user operation or report recursively.
  await check('missing diagnostic route does not corrupt successful chat', { reportFailure: true }, async page => {
    await send(page); await page.waitForFunction(() => window.pending.length === 1); await settle(page);
    await page.getByText('SUNUCU_YANITI', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.uiErrors), []);
    const reports = await page.evaluate(() => window.events.filter(e => e.action === 'host_assistant_report').map(e => e.payload));
    assert.ok(reports.some(e => e.stage === 'chat_render' && e.code === 'OK'));
    assert.equal(new Set(reports.map(e => e.stage)).size, reports.length, 'one terminal report per stage, no report-error loop');
  });
  // Break caught: telemetry accidentally carries user text or a raw exception.
  await check('local chat failure reports only allowlisted metadata', { startError: true }, async page => {
    await send(page);
    await page.waitForFunction(() => document.querySelector('.sa-status').dataset.kind === 'error');
    const reports = await page.evaluate(() => window.events.filter(e => e.action === 'host_assistant_report').map(e => e.payload));
    assert.equal(reports.length, 1);
    assert.equal(reports[0].stage, 'chat_start'); assert.equal(reports[0].code, 'BRIDGE_UNAVAILABLE');
    for (const key of Object.keys(reports[0])) assert.ok(['stage', 'code', 'durationMs', 'requestId', 'visibility'].includes(key), 'unexpected metadata ' + key);
    assert.ok(Number.isFinite(reports[0].durationMs) && reports[0].durationMs >= 0);
    assert.ok(['visible', 'hidden'].includes(reports[0].visibility));
    assert.doesNotMatch(JSON.stringify(reports), /PRIVATE_|question|context|message|selectedText/);
    assert.equal(await page.getByRole('textbox', { name: 'Seçili metin için komut' }).inputValue(), 'PRIVATE_QUESTION_CANARY');
  });
  // Break caught: normal running polls flood diagnostics instead of a stage terminal event.
  await check('running responses do not emit per-poll reports', {}, async page => {
    await send(page); await page.waitForFunction(() => window.pending.length === 1);
    await settle(page, 0, { status: 'running', phase: 'model' });
    await page.waitForFunction(() => window.pending.length === 2);
    assert.equal(await page.evaluate(() => window.events.filter(e => e.action === 'host_assistant_report' && e.payload.stage === 'chat_wait').length), 0);
    await settle(page, 1); await page.getByText('SUNUCU_YANITI', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.events.filter(e => e.action === 'host_assistant_report' && e.payload.stage === 'chat_wait').length), 1);
  });
  // Break caught: opening the static snapshot makes an AI check or exposes unknown fields.
  await check('diagnostic button is opt-in and snapshot-only', {}, async page => {
    assert.equal(await page.evaluate(() => window.events.some(e => e.action === 'host_assistant_diagnostics')), false);
    await page.getByRole('button', { name: 'Model ve bağlantı bilgisi', exact: true }).click();
    await page.getByText(/Model: fixture/).waitFor();
    assert.equal(await page.evaluate(() => window.events.some(e => e.action === 'host_assistant_diagnostics')), false);
    const before = await page.evaluate(() => window.events.length);
    await page.getByRole('button', { name: 'Tanı kayıtları', exact: true }).click();
    await page.getByText(/CODEX_TIMEOUT/).waitFor();
    const tail = await page.evaluate(n => window.events.slice(n), before);
    assert.deepEqual(tail.map(e => e.action), ['host_assistant_diagnostics']);
    const text = await page.locator('.sa-info').innerText();
    assert.match(text, /chat_wait/); assert.match(text, /1[,.]234|1234/);
    assert.match(text, /2026-10-14T10:11:12Z/);
    assert.match(text, /CAPACITY_LIMIT/);
    assert.doesNotMatch(text, /PRIVATE_DIAGNOSTIC_CANARY/);
  });
  // Break caught: 128 non-displayable explain phase records evict valid host events before filtering.
  await check('phase-only diagnostic records cannot evict host events', { explainPhaseFlood: true }, async page => {
    await page.getByRole('button', { name: 'Model ve bağlantı bilgisi', exact: true }).click();
    await page.getByText(/Model: fixture/).waitFor();
    const before = await page.evaluate(() => window.events.length);
    await page.getByRole('button', { name: 'Tanı kayıtları', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.sa-diagnostics').textContent.includes('okunuyor'));
    const text = await page.locator('.sa-diagnostics').innerText();
    assert.match(text, /CODEX_TIMEOUT/); assert.match(text, /CAPACITY_LIMIT/);
    assert.match(text, /2026-10-14T10:11:12Z/); assert.match(text, /2026-10-14T10:12:13Z/);
    assert.equal(text.split('\n').length, 2, 'only the two valid stage/code records are displayable');
    assert.doesNotMatch(text, /PRIVATE_|completed|gpt-6\.1-sol|stdoutBytes|Henüz tanı kaydı yok/);
    assert.deepEqual(await page.evaluate(n => window.events.slice(n).map(e => e.action), before), ['host_assistant_diagnostics']);
  });
  // Break caught: transport strips error.code and capacity failures become unclassified raw enums.
  for (const variant of [
    { name: 'typed job capacity', startErrorCode: 'ASSISTANT_JOB_CAPACITY' },
    { name: 'typed waiter capacity', startErrorCode: 'ASSISTANT_WAITER_CAPACITY' },
    { name: 'message-only capacity enum', messageOnly: true, startErrorMessage: 'ASSISTANT_JOB_CAPACITY' },
    { name: 'message-only capacity explanation', messageOnly: true, startErrorMessage: 'Asistan kapasite sınırı dolu.' },
  ]) {
    await check(variant.name, { startError: true, ...variant }, async page => {
      await send(page);
      await page.waitForFunction(() => document.querySelector('.sa-status').dataset.kind === 'error');
      assert.match(await page.locator('.sa-status').first().innerText(), /kapasite/i);
      const reports = await page.evaluate(() => window.events.filter(e => e.action === 'host_assistant_report').map(e => e.payload));
      assert.equal(reports.length, 1); assert.equal(reports[0].stage, 'chat_start'); assert.equal(reports[0].code, 'CAPACITY_LIMIT');
      for (const key of Object.keys(reports[0])) assert.ok(['stage', 'code', 'durationMs', 'requestId', 'visibility'].includes(key));
      assert.doesNotMatch(JSON.stringify(reports), /PRIVATE_|message|kapasite|ASSISTANT_JOB_CAPACITY|ASSISTANT_WAITER_CAPACITY/);
      assert.equal(await page.getByRole('textbox', { name: 'Seçili metin için komut' }).inputValue(), 'PRIVATE_QUESTION_CANARY');
    });
  }
  if (failures.length) throw new Error(JSON.stringify({ backgroundUiTests: tests, failures }));
  console.log(JSON.stringify({ backgroundUiTests: tests, result: 'PASS' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
