import { renderWidget, usePlugin, WidgetLocation } from '@remnote/plugin-sdk';
import React, { useEffect, useRef, useState } from 'react';
const openAssistant = require('../../selection-assistant-ui.cjs');
import { primeHostKey, hostKeyHeaders } from '../core/host-key';
const { createAssistantAPI, createHostCaller } = require('../../selection-assistant-sdk.cjs');
const { createSmartImageTransport } = require('../../smart-images-client.cjs');
const imageTransport = createSmartImageTransport(createHostCaller(hostKeyHeaders));

function AssistantPopup() {
  const plugin = usePlugin();
  primeHostKey(plugin);
  const host = useRef<HTMLDivElement>(null);
  const [error,setError] = useState('');
  useEffect(()=>{
    let disposed=false;
    const mount=host.current;
    void plugin.widget.getWidgetContext<WidgetLocation.Popup>().then(widget=>{
      if(disposed || !mount)return;
      const data=(widget.contextData || {}) as any;
      openAssistant(createAssistantAPI(data,imageTransport,{
        show:(_text: string,options: any)=>mount.replaceChildren(options.contentNode),
        close:()=>void plugin.widget.closePopup(true),
        translate:(capture: any)=>void plugin.widget.openPopup('translate_popup',{
          source:'assistant_sdk',selectedText:capture.selectedText,contextText:data.contextText || '',
        },true).catch((e: Error)=>setError(e.message)),
      }),data.surface === 'pdf' ? 'pdf' : 'note');
    }).catch((e: Error)=>{if(!disposed)setError(e.message);});
    return ()=>{
      disposed=true;
      mount?.querySelector('.mcp-selection-assistant')?.dispatchEvent(new Event('sa-close'));
      mount?.replaceChildren();
    };
  },[plugin]);
  return <main style={{background:'#20202a',color:'#e7e7ef',padding:18,minHeight:'100vh',boxSizing:'border-box'}}>
    <style>{'.mcp-selection-assistant{max-height:calc(100vh - 36px)!important}'}</style>
    {error ? <p role="alert">{error}</p> : null}
    <div ref={host}/>
  </main>;
}
renderWidget(AssistantPopup);
