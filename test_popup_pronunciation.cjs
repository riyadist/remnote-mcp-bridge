const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
let browser;
before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined }); });
after(async () => { await browser?.close(); });
const source = fs.readFileSync(require.resolve('./remnote-cdp-toolbar-injector.cjs'), 'utf8');
const helper = source.split('// POPUP_PRONUNCIATION_BEGIN')[1]?.split('// POPUP_PRONUNCIATION_END')[0];
async function fixture(options = {}) {
  assert.ok(helper, 'Production pronunciation helper must exist');
  const page = await browser.newPage({ viewport: { width: options.width || 768, height: 600 } });
  await page.setContent('<div id="popup" style="width:calc(100% - 24px);padding:8px;box-sizing:border-box"><div class="mcp-cdp-cevir-target-expression" style="display:grid;grid-template-columns:28px minmax(0,1fr) auto;column-gap:10px;row-gap:2px;padding:8px 10px"><span>•</span><div style="min-width:0"><div>ÇEVRİLEN İFADE</div><div class="mcp-cdp-cevir-target-value" style="overflow-wrap:anywhere">quasar</div></div><div class="mcp-cdp-cevir-target-meta">Tıklanan: quasar · Otomatik kalıp</div></div><p>Türkçe çeviri ve tüm PDF</p></div>');
  await page.evaluate(({ helper, options }) => {
    window.calls = []; window.cancels = 0;
    window.utterances = [];
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: options.noAPI ? undefined : class { constructor(text) { this.text = text; } }, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', { value: options.noAPI ? undefined : { getVoices: () => options.voices || [{name:'Tolga',lang:'tr-TR',localService:true,default:true},{name:'David',lang:'en-US',localService:true,default:false}], speak(u) { window.calls.push({text:u.text,lang:u.lang,voice:u.voice.name,rate:u.rate}); window.utterances.push(u); }, cancel() { window.cancels++; } }, configurable:true });
    window.install = new Function(helper + '; return installPopupPronunciation;')();
    window.controller = window.install(document.querySelector('#popup'));
  }, { helper, options });
  return page;
}
test('English target only; local English voice outranks Turkish default; repeated click stops owned speech', async () => {
  const p = await fixture();
  await p.locator('.mcp-cdp-pronounce-button').click();
  assert.deepEqual(await p.evaluate(() => calls), [{text:'quasar',lang:'en-US',voice:'David',rate:0.95}]);
  await p.locator('.mcp-cdp-pronounce-button').click();
  assert.equal(await p.evaluate(() => cancels),1);
  assert.equal(await p.locator('button').getAttribute('aria-pressed'),'false');
  await p.close();
});
test('missing API or local English voice fails closed and never cancels unrelated audio', async () => {
  for (const options of [{noAPI:true},{voices:[{name:'Tolga',lang:'tr-TR',localService:true,default:true}]},{voices:[{name:'Remote English',lang:'en-US',localService:false,default:true}]}]) {
    const p = await fixture(options); await p.locator('button').click();
    assert.equal(await p.evaluate(() => calls.length),0);
    assert.equal(await p.evaluate(() => cancels),0);
    assert.match(await p.locator('[role=status]').textContent(),/desteklenmiyor|İngilizce ses/);
    await p.close();
  }
});
test('English voice ranking uses en-US local default before other English; unrelated speech is not queued or cancelled',async()=>{
  for(const [voices,name,lang] of [
    [[{name:'UK default',lang:'en-GB',localService:true,default:true},{name:'US',lang:'en-US',localService:true,default:false},{name:'US default',lang:'en-US',localService:true,default:true}],'US default','en-US'],
    [[{name:'UK',lang:'en-GB',localService:true,default:false},{name:'Tolga',lang:'tr-TR',localService:true,default:true}],'UK','en-GB']
  ]) {
    const p=await fixture({voices}); await p.locator('button').click();
    assert.equal(await p.evaluate(()=>calls[0].voice),name); assert.equal(await p.evaluate(()=>calls[0].lang),lang);
    assert.match(await p.locator('button').getAttribute('title'),new RegExp(name)); await p.close();
  }
  const p=await fixture(); await p.evaluate(()=>speechSynthesis.speaking=true); await p.locator('button').click();
  assert.equal(await p.evaluate(()=>calls.length),0); assert.equal(await p.evaluate(()=>cancels),0);
  assert.match(await p.locator('[role=status]').textContent(),/Başka bir seslendirme/); await p.close();
});
test('same-target progressive rerender preserves playback; target change and stale events are guarded', async () => {
  const p = await fixture(); await p.locator('button').click();
  await p.evaluate(() => { const row=document.querySelector('.mcp-cdp-cevir-target-expression'); row.replaceWith(row.cloneNode(true)); });
  await p.evaluate(async () => { await Promise.resolve(); await Promise.resolve(); });
  assert.equal(await p.evaluate(() => cancels),0);
  assert.equal(await p.locator('button').getAttribute('aria-pressed'),'true');
  await p.evaluate(() => document.querySelector('.mcp-cdp-cevir-target-value').textContent='black hole');
  await p.waitForFunction(() => cancels===1);
  assert.equal(await p.evaluate(() => cancels),1);
  await p.locator('button').click();
  await p.evaluate(() => utterances[0].onend());
  assert.equal(await p.locator('button').getAttribute('aria-pressed'),'true');
  await p.evaluate(() => utterances[1].onerror({error:'synthesis-failed'}));
  assert.equal(await p.locator('button').getAttribute('aria-pressed'),'false');
  assert.match(await p.locator('[role=status]').textContent(),/Seslendirme/);
  await p.locator('button').click();
  await p.evaluate(() => document.querySelector('#popup').style.display='none');
  await p.waitForFunction(() => cancels===2); assert.equal(await p.evaluate(() => cancels),2);
  await p.evaluate(() => controller.destroy());
  assert.equal(await p.locator('button').count(),0);
  await p.close();
});
test('idempotent install, end, cleanup and later responses do not restart audio', async () => {
  const p=await fixture();
  assert.equal(await p.evaluate(() => install(document.querySelector('#popup'))===controller),true);
  assert.equal(await p.locator('button').count(),1);
  await p.locator('button').click(); await p.evaluate(() => utterances[0].onend());
  assert.equal(await p.locator('button').getAttribute('aria-pressed'),'false');
  await p.locator('button').click(); await p.evaluate(() => {controller.destroy(); utterances[1].onend(); document.querySelector('.mcp-cdp-cevir-target-value').textContent='later response';});
  await p.evaluate(async () => { await Promise.resolve(); await Promise.resolve(); });
  assert.equal(await p.locator('button').count(),0); assert.equal(await p.evaluate(() => calls.length),2);
  assert.equal(await p.evaluate(() => cancels),1); await p.close();
});
test('native button supports keyboard and remains inside target row at 320 and 768 pixels',async()=>{
  for(const width of [320,768]) {
    const p=await fixture({width});
    const b=p.locator('button'); await b.focus(); await p.keyboard.press('Enter');
    assert.equal(await p.evaluate(()=>calls.length),1);
    await p.keyboard.press('Space'); assert.equal(await p.evaluate(()=>cancels),1);
    const box=await b.boundingBox(); assert.ok(box.width>=28 && box.x+box.width<=width);
    const valueBox=await p.locator('.mcp-cdp-cevir-target-value').boundingBox();
    assert.ok(box.x>=valueBox.x+valueBox.width && box.y<valueBox.y+valueBox.height,'speaker must be right of the expression in the top row');
    assert.match(await b.getAttribute('aria-label'),/İngilizce/);
    await p.close();
  }
});
test('detaching popup stops only owned audio and releases observers',async()=>{
  for(const speaking of [false,true]) {
    const p=await fixture(); if(speaking) await p.locator('button').click();
    await p.evaluate(()=>document.querySelector('#popup').remove());
    await p.evaluate(async()=>{await Promise.resolve();await Promise.resolve();});
    assert.equal(await p.evaluate(()=>cancels),speaking?1:0);
    assert.equal(await p.evaluate(()=>!!controller && utterances.length),speaking?1:0);
    await p.close();
  }
});
test('absent popup bootstrap is passive and idempotent, then attaches to the first real card',async()=>{
  const p=await fixture();
  await p.evaluate(()=>{controller.destroy(); window.savedPopup=document.querySelector('#popup');savedPopup.remove();window.waiting=install(null);window.duplicate=install(null);});
  assert.equal(await p.evaluate(()=>waiting===duplicate && waiting.waiting),true);
  await p.evaluate(()=>{const unrelated=document.createElement('div');document.body.append(unrelated);unrelated.remove();});
  await p.evaluate(async()=>{await Promise.resolve();await Promise.resolve();});
  assert.equal(await p.evaluate(()=>calls.length+cancels),0);
  await p.evaluate(()=>{savedPopup.classList.add('mcp-cdp-cevir-popup');document.body.append(savedPopup);});
  await p.locator('button').waitFor();
  assert.equal(await p.evaluate(()=>waiting.waiting),false);
  assert.equal(await p.evaluate(()=>window.__mcpPopupPronunciationBootstrap),undefined);
  assert.equal(await p.evaluate(()=>calls.length),0);
  await p.locator('button').click(); assert.equal(await p.evaluate(()=>calls[0].text),'quasar');
  await p.evaluate(()=>savedPopup.remove()); await p.waitForFunction(()=>cancels===1); await p.close();
});
test('destroying waiting bootstrap prevents later popup attachment and any speech',async()=>{
  const p=await fixture();
  await p.evaluate(()=>{controller.destroy();window.savedPopup=document.querySelector('#popup');savedPopup.remove();window.waiting=install(null);waiting.destroy();savedPopup.classList.add('mcp-cdp-cevir-popup');document.body.append(savedPopup);});
  await p.evaluate(async()=>{await Promise.resolve();await Promise.resolve();});
  assert.equal(await p.locator('button').count(),0);
  assert.equal(await p.evaluate(()=>calls.length+cancels),0);
  assert.equal(await p.evaluate(()=>waiting.waiting),false);
  await p.close();
});
test('body-absent startup waits for DOMContentLoaded once and its destroy cancels the listener',async()=>{
  for(const cancel of [false,true]) {
    const p=await fixture();
    await p.evaluate(cancel=>{
      controller.destroy(); window.savedPopup=document.querySelector('#popup');savedPopup.classList.add('mcp-cdp-cevir-popup');savedPopup.remove();document.body.remove();
      window.waiting=install(null);window.duplicate=install(null);
      if(cancel) waiting.destroy();
      const body=document.createElement('body');document.documentElement.append(body);
      document.dispatchEvent(new Event('DOMContentLoaded'));
      body.append(savedPopup);
    },cancel);
    await p.evaluate(async()=>{await Promise.resolve();await Promise.resolve();});
    assert.equal(await p.evaluate(()=>waiting===duplicate),true);
    assert.equal(await p.locator('button').count(),cancel?0:1);
    assert.equal(await p.evaluate(()=>calls.length+cancels),0);
    assert.equal(await p.evaluate(()=>window.__mcpPopupPronunciationBootstrap),undefined);
    await p.close();
  }
});
