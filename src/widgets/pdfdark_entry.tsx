// PDF yanındaki 'Görünüm' giriş düğmesi (rn-pdf-dark-local-dev 0.2.2 controls.tsx Entry'den taşındı).
import React,{useState} from 'react';
import {renderWidget,usePlugin} from '@remnote/plugin-sdk';
function Entry(){
  const plugin=usePlugin();const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <><style>{`html,body,#root{margin:0;background:transparent;height:100%;overflow:hidden}.pdf-reading-entry{box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:7px;width:116px;height:36px;padding:0 10px;border:1px solid transparent;border-radius:6px;background:transparent;color:inherit;font:14px system-ui;cursor:pointer}.pdf-reading-entry:hover{background:rgba(128,128,160,.14)}.pdf-reading-entry:focus-visible{outline:2px solid #b9d5ff;outline-offset:-2px}`}</style><button type="button" className="pdf-reading-entry" aria-label="PDF okuma görünümünü aç" title={error||'PDF Okuma Görünümü'} disabled={busy} onClick={async()=>{if(busy)return;setBusy(true);setError('');try{await plugin.widget.openPopup('pdfdark_controls');}catch(e){setError(e instanceof Error?e.message:'Görünüm açılamadı.');}finally{setBusy(false);}}}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 15.5A8.8 8.8 0 0 1 8.5 4 8.8 8.8 0 1 0 20 15.5Z"/></svg><span>Görünüm</span></button></>;
}
renderWidget(Entry);
