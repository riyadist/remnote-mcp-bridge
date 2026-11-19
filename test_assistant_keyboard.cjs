'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const open = require('./selection-assistant-ui.cjs');
const source = fs.readFileSync(path.join(__dirname, 'remnote-cdp-toolbar-injector.cjs'), 'utf8');
// Execute the actual production keyboard boundary, without starting the CDP service.
const keyboardSource = source.slice(source.indexOf('  function isTopicChatTextarea('), source.indexOf('  function handleViewportChange('));
let browser;
before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined }); });
after(async () => { await browser?.close(); });

async function fixture({ delayed = false, interfere = true } = {}) {
  const page = await browser.newPage();
  await page.setContent('<textarea id="editor" aria-label="Native editor"></textarea><main class="mcp-cdp-cevir-popup"></main>');
  await page.evaluate(({ keyboardSource, interfere }) => {
    window.hostKeys = [];
    // Registered before our guard, as the host document/PDF listener is in RemNote.
    document.addEventListener('keydown', event => {
      window.hostKeys.push(event.key);
      if (interfere && event.target.closest('.mcp-selection-assistant')) {
        event.preventDefault(); document.querySelector('#editor').focus();
      }
    }, true);
    const getPopup = () => document.querySelector('.mcp-cdp-cevir-popup');
    const hidePopup = () => { getPopup().style.display = 'none'; };
    eval(keyboardSource + '\nwindow.addEventListener("keydown", handleWindowKeyDown, true);');
  }, { keyboardSource, interfere });
  await page.evaluate(`(${open.toString()})({
    capture:()=>({selectedText:'Seçim'}),
    show:(_,o)=>document.querySelector('.mcp-cdp-cevir-popup').append(o.contentNode),
    close:()=>{}, translate:()=>{},
    call:async(action,payload)=>{
      window.calls=[...(window.calls||[]),{action,payload}];
      if(action==='host_assistant_capture') {
        if(${delayed}) await new Promise((resolve,reject)=>{window.finishCapture=resolve;window.rejectCapture=reject;});
        return {captureId:'fixture',segments:[['Seçim']],editable:true};
      }
      if(action==='host_assistant_chat') {
        if(payload.async!==true) throw new Error('Fixture chat requires async:true');
        const requestId='fixture-chat-'+((window.chatRequestSequence||0)+1);
        window.chatRequestSequence=(window.chatRequestSequence||0)+1;
        window.chatRequestIds=[...(window.chatRequestIds||[]),requestId];
        return {requestId,status:'running'};
      }
      if(action==='host_assistant_job_status') {
        if(!(window.chatRequestIds||[]).includes(payload.requestId)) throw new Error('Unknown fixture requestId: '+payload.requestId);
        return {requestId:payload.requestId,status:'completed',answer:'Yanıt'};
      }
      if(action==='host_assistant_remnote_chat') return {sessionId:'s',answer:'Salt okunur',trace:[]};
      if(action==='host_assistant_preview') return {planId:'p',segments:[['Sonra']],original:[['Seçim']],editable:true};
      throw new Error('Unexpected fixture action: '+action);
    }
  },'note')`);
  return page;
}

for (const [mode, label] of [['Düzenle', 'Seçili metin için komut'], ['Soru sor', 'Seçili metin için komut'], ['RemNote · MCP', 'RemNote isteği']]) {
  test(`${mode}: textbox owns native editing, shortcuts and composition without note focus theft`, async () => {
    const page = await fixture();
    try {
      await page.getByRole('button', { name: mode, exact: true }).click();
      const input = page.getByRole('textbox', { name: label, exact: true });
      await input.fill('ab');
      await input.evaluate(el => el.setSelectionRange(1, 1));
      await input.press('Space');
      assert.equal(await input.inputValue(), 'a b');
      assert.deepEqual(await input.evaluate(el => [document.activeElement === el, el.selectionStart]), [true, 2]);
      await input.press('ArrowLeft');
      assert.deepEqual(await input.evaluate(el => [document.activeElement === el, el.selectionStart]), [true, 1]);
      await input.press('ArrowRight'); assert.equal(await input.evaluate(el => el.selectionStart), 2);
      await input.press('End'); assert.equal(await input.evaluate(el => el.selectionStart), 3);
      await input.press('Home'); assert.equal(await input.evaluate(el => el.selectionStart), 0);
      await input.fill('aSEÇİMb'); await input.evaluate(el => el.setSelectionRange(1, 6));
      await input.press('Space'); assert.equal(await input.inputValue(), 'a b');
      await input.fill('a😀b'); await input.evaluate(el => el.setSelectionRange(3, 3));
      await input.press('Backspace'); assert.equal(await input.inputValue(), 'ab');
      await input.fill('a😀b'); await input.evaluate(el => el.setSelectionRange(1, 1));
      await input.press('Delete'); assert.equal(await input.inputValue(), 'ab');
      await input.fill('seçim'); await input.press('Control+a');
      assert.deepEqual(await input.evaluate(el => [el.selectionStart, el.selectionEnd]), [0, 5]);
      await input.press('Control+c'); await input.fill(''); await input.press('Control+v');
      assert.equal(await input.inputValue(), 'seçim');
      await input.press('End'); await input.press('Shift+Enter');
      assert.equal(await input.inputValue(), 'seçim\n');
      const callCount = await page.evaluate(() => window.calls.length);
      const composing = await input.evaluate(el => {
        const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true, cancelable: true });
        el.dispatchEvent(event); return { prevented: event.defaultPrevented, focused: document.activeElement === el };
      });
      assert.deepEqual(composing, { prevented: false, focused: true });
      assert.equal(await page.evaluate(() => window.calls.length), callCount);
      assert.deepEqual(await page.evaluate(() => window.hostKeys), []);
      await input.press('Enter');
      if (mode !== 'Düzenle') {
        await page.waitForFunction(() => [...document.querySelectorAll('.sa-status')].some(el => el.textContent === 'Yanıt hazır. Devam sorusu sorabilirsin.' || el.textContent === 'Yanıt hazır.'));
        assert.equal(await input.inputValue(), '');
      } else assert.equal(await input.inputValue(), 'seçim\n\n');
      const native = page.getByRole('textbox', { name: 'Native editor' });
      await native.fill('note'); await native.press('Space');
      assert.equal(await native.inputValue(), 'note ');
      assert.equal(await page.evaluate(() => window.hostKeys.includes(' ')), true);
    } finally { await page.close(); }
  });
}

test('late capture response does not steal MCP focus or replace a typed draft', async () => {
  const page = await fixture({ delayed: true, interfere: false });
  try {
    await page.getByRole('button', { name: 'RemNote · MCP', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'RemNote isteği', exact: true });
    await input.fill('Kendi taslağım'); await input.evaluate(el => el.setSelectionRange(5, 5));
    await page.evaluate(() => window.finishCapture());
    await page.waitForFunction(() => document.querySelector('.sa-subtitle').textContent.includes('satır seçili'));
    assert.deepEqual(await input.evaluate(el => [document.activeElement === el, el.value, el.selectionStart]), [true, 'Kendi taslağım', 5]);
  } finally { await page.close(); }
});

test('late capture response preserves chat caret and status', async () => {
  const page = await fixture({ delayed: true, interfere: false });
  try {
    await page.getByRole('button', { name: 'Soru sor', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Seçili metin için komut' });
    await input.fill('Soru taslağı'); await input.evaluate(el => el.setSelectionRange(4, 4));
    const status = await page.locator('.sa-status').first().innerText();
    await page.evaluate(() => window.finishCapture());
    await page.waitForFunction(() => document.querySelector('.sa-subtitle').textContent.includes('satır seçili'));
    assert.deepEqual(await input.evaluate(el => [document.activeElement === el, el.value, el.selectionStart]), [true, 'Soru taslağı', 4]);
    assert.equal(await page.locator('.sa-status').first().innerText(), status);
  } finally { await page.close(); }
});

for (const [mode, label, expectedStatus] of [
  ['Soru sor', 'Seçili metin için komut', 'Yanıt hazır. Devam sorusu sorabilirsin.'],
  ['RemNote · MCP', 'RemNote isteği', 'Yanıt hazır.'],
]) {
  test(`${mode}: rejected late capture preserves successful response; edit retains capture error`, async () => {
    const page = await fixture({ delayed: true });
    try {
      await page.getByRole('button', { name: mode, exact: true }).click();
      const input = page.getByRole('textbox', { name: label, exact: true });
      await input.fill('Yanıt bekliyorum'); await input.press('Enter');
      const status = mode === 'Soru sor' ? page.locator('.sa-status').first() : page.locator('.sa-mcp .sa-status');
      await status.getByText(expectedStatus, { exact: true }).waitFor();
      await page.evaluate(async () => {
        window.rejectCapture(new Error('Seçim okunamadı'));
        // Drain the async call -> then -> catch chain, without wall-clock sleeps.
        for (let i = 0; i < 6; i++) await Promise.resolve();
      });
      assert.equal(await status.innerText(), expectedStatus);
      assert.equal(await page.locator('.sa-status').first().getAttribute('data-kind'), mode === 'Soru sor' ? 'success' : null);
      assert.equal(await input.evaluate(el => document.activeElement === el), true);
      await page.getByRole('button', { name: 'Düzenle', exact: true }).click();
      assert.equal(await page.locator('.sa-status').first().innerText(), 'Seçim okunamadı');
      assert.equal(await page.locator('.sa-status').first().getAttribute('data-kind'), 'error');
    } finally { await page.close(); }
  });
}

test('edit mode displays a rejected late capture error immediately', async () => {
  const page = await fixture({ delayed: true });
  try {
    await page.evaluate(() => window.rejectCapture(new Error('Seçim okunamadı')));
    await page.getByText('Seçim okunamadı', { exact: true }).waitFor();
    assert.equal(await page.locator('.sa-status').first().getAttribute('data-kind'), 'error');
  } finally { await page.close(); }
});
