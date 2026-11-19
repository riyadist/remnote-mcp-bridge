'use strict';
// Hot-refresh the existing opt-in overlay without stopping RemNote or its services.
const fs = require('node:fs');
const vm = require('node:vm');
const WebSocket = require('ws');
async function main() {
  const source = fs.readFileSync(__dirname + '/remnote-cdp-toolbar-injector.cjs', 'utf8');
  const fn = vm.runInNewContext('(' + source.slice(source.indexOf('function injectedOverlay('), source.indexOf('const overlaySource =')).trim() + ')');
  const expression = `(${fn.toString()})(${require('./selection-assistant-ui.cjs').toString()}); window.__mcpRemNoteSelectionAssistantV1 = window.__mcpRemNoteSelectionAssistantV2 = window.__mcpRemNoteSelectionAssistantV3 = window.__mcpRemNoteSelectionAssistantV4 = window.__mcpRemNoteSelectionAssistantV5 = window.__mcpRemNoteSelectionAssistantV6 = window.__mcpRemNoteSelectionAssistantV7; ({installed:!!window.__mcpRemNoteSelectionAssistantV7?.installed})`;
  const targets = await (await fetch('http://127.0.0.1:9233/json')).json();
  const page = targets.find(x => x.type === 'page' && /^app:\/\/js/.test(x.url));
  if (!page) throw new Error('Existing RemNote debug connection unavailable.');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let id = 0;
  const call = (method, params) => new Promise((resolve, reject) => {
    const current = ++id;
    const timeout = setTimeout(() => { ws.off('message', listener); reject(new Error('CDP timeout')); }, 8000);
    function listener(raw) {
      const msg = JSON.parse(raw); if (msg.id !== current) return;
      clearTimeout(timeout); ws.off('message', listener);
      if (msg.error || msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg.error || msg.result.exceptionDetails)));
      else resolve(msg.result);
    }
    ws.on('message', listener); ws.send(JSON.stringify({ id: current, method, params }));
  });
  try {
    // Also preserve this refresh on a page reload while the old helper process is alive.
    await call('Page.addScriptToEvaluateOnNewDocument', { source: expression });
    console.log(JSON.stringify(await call('Runtime.evaluate', { expression: 'window.__mcpRemNoteSelectionAssistantV7?.cleanup?.();' + expression, returnByValue: true })));
  } finally { ws.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
