'use strict';
// Read-only end-to-end proof on the existing RemNote main page. Never approves writes.
const WebSocket = require('ws');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const page = (await (await fetch('http://127.0.0.1:9233/json')).json()).find(x => x.type === 'page' && x.url.startsWith('app://js'));
  if (!page) throw new Error('RemNote main page unavailable');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let seq = 0;
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { ws.off('message', listener); reject(new Error('CDP timeout')); }, 15000);
    function listener(raw) {
      const msg = JSON.parse(raw); if (msg.id !== id) return;
      clearTimeout(timer); ws.off('message', listener);
      if (msg.error || msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg.error || msg.result.exceptionDetails)));
      else resolve(msg.result);
    }
    ws.on('message', listener); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => (await call('Runtime.evaluate', { expression, returnByValue: true })).result.value;
  try {
    await evaluate(`window.__mcpRemNoteSelectionAssistantV7.openAssistant('note'); document.querySelector('.sa-modes button:last-child').click(); true`);
    await evaluate(`(()=>{const input=document.querySelector('[aria-label="RemNote isteği"]');input.value='Personal Intelligence OS notunu bul, yalnız başlığını ve kimliğini yaz. Hiçbir değişiklik yapma.';document.querySelector('[aria-label="RemNote isteğini gönder"]').click();return true})()`);
    let done = false;
    for (let i = 0; i < 90; i++) {
      done = await evaluate(`!document.querySelector('[aria-label="RemNote isteğini gönder"]')?.disabled`);
      if (done) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    const proof = await evaluate(`(()=>{const root=document.querySelector('.mcp-selection-assistant');const r=root.getBoundingClientRect();return {done:${done},answer:root.querySelector('.sa-mcp-log').innerText,status:root.querySelector('.sa-mcp > .sa-status').innerText,approvalVisible:!root.querySelector('.sa-mcp-approval').hidden,inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}})()`);
    console.log(JSON.stringify(proof));
    if (!done || !proof.answer.includes('ubgqlPRB62rYIoGn1') || !proof.status.includes('search') || proof.approvalVisible || !proof.inside) throw new Error('Live read-only UI verification failed');
    const rect = await evaluate(`(()=>{const r=document.querySelector('.mcp-selection-assistant').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`);
    const shot = await call('Page.captureScreenshot', { format: 'png', clip: rect });
    fs.writeFileSync(path.resolve(__dirname, '../../Temp/remnote_assistant_mcp_live.png'), Buffer.from(shot.data, 'base64'));
  } finally { ws.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
