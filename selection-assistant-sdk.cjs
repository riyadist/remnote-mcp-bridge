'use strict';
// Standard plugin entry; deliberately no CDP, window.parent, eval or stock hooks.
// keyHeaders: async () => ({'X-RemNote-Key': ...}); the sandboxed plugin frame
// (Origin "null") must prove its pairing key to the local bridge host.
function createHostCaller(keyHeaders) {
  return async function callHost(action, payload) {
    const extra=keyHeaders ? await keyHeaders() : {};
    const response = await fetch('http://127.0.0.1:3400/call', {
      method:'POST',headers:{'Content-Type':'application/json',...extra},
      body:JSON.stringify({action,payload}),signal:AbortSignal.timeout(90000),
    });
    const data=await response.json();
    if(!response.ok || data?.ok !== true) throw Error(data?.error || 'BRIDGE_UNAVAILABLE');
    return data.result;
  };
}
const callHost=createHostCaller(null);
async function registerAssistantSDK(plugin, options) {
  const transport=options.callHost || createHostCaller(options.keyHeaders);
  const open=async(surface,args)=>{
    const context=await options.captureContext(surface === 'pdf' ? 'reader_menu' : 'command',args);
    let initialCapture, captureError;
    try { initialCapture=await transport('host_assistant_capture',{surface,selectedText:context.selectedText || ''}); }
    catch(error){captureError=String(error.message || error);}
    await plugin.widget.openPopup('assistant_popup',{...context,surface,initialCapture,captureError},true);
  };
  await plugin.app.registerWidget('assistant_popup',options.popupLocation,{dimensions:{width:780,height:680}});
  await plugin.app.registerCommand({
    id:'remnote-mcp-bridge.assistant-selection',name:'AI Asistanı',quickCode:'aiassistant',
    description:'Seçili notla AI Asistanını aç; PDF için Reader menüsünü kullan.',
    keywords:'ai asistan assistant acikla soru sor',
    action:()=>open('note'),
  });
  await plugin.app.registerMenuItem({
    id:'remnote-mcp-bridge.assistant-reader',name:'AI Asistanı',location:options.readerLocation,
    action:args=>open('pdf',args),
  });
}
function createAssistantAPI(context, transport, surface) {
  return {
    ...surface,
    capture:()=>({selectedText:context.selectedText || '',contextText:context.contextText || ''}),
    call:(action,payload)=>action === 'host_assistant_capture'
      ? context.initialCapture ? Promise.resolve(context.initialCapture) : Promise.reject(Error(context.captureError || 'Seçim alınamadı. Metni seçip yeniden aç.'))
      : transport(action,payload),
  };
}
module.exports={registerAssistantSDK,createAssistantAPI,createHostCaller,callHost};
