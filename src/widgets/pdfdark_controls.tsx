// PDF Okuma Görünümü paneli (rn-pdf-dark-local-dev 0.2.2 controls.tsx'ten taşındı; mesaj türleri pdfdark_ önekli).
import React,{useEffect,useState,useRef} from 'react';
import {renderWidget,usePlugin,useOnMessageBroadcast} from '@remnote/plugin-sdk';
import {DEFAULT_CONFIG,PRESETS,filterFor,contrastFor,validConfig,broadcastPayload,type ReadingState,type ReadingConfig} from '../features/pdfdark/mode';
function Controls(){
  const plugin=usePlugin();
  const initial={enabled:false,config:{...DEFAULT_CONFIG}};
  const [draft,setDraft]=useState<ReadingState>(initial),[confirmed,setConfirmed]=useState<ReadingState>(initial);
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[known,setKnown]=useState(false);
  const confirmedRef=useRef(initial),pending=useRef(''),sequence=useRef(0),revision=useRef(0),sentRevision=useRef(0);
  const timeout=useRef<ReturnType<typeof setTimeout>>(),debounce=useRef<ReturnType<typeof setTimeout>>();
  const send=async(next?:ReadingState)=>{
    clearTimeout(timeout.current);const id=`reading-${Date.now()}-${++sequence.current}`;pending.current=id;sentRevision.current=revision.current;setBusy(true);setError('');
    timeout.current=setTimeout(()=>{if(pending.current!==id)return;pending.current='';setKnown(false);setBusy(false);setError('Ayarın uygulanıp uygulanmadığı bilinmiyor. Durumu yenile.');},5000);
    try{await plugin.messaging.broadcast(next?{type:'pdfdark_set',on:next.enabled,config:next.config,requestId:id}:{type:'pdfdark_get',requestId:id});}
    catch{if(pending.current!==id)return;clearTimeout(timeout.current);pending.current='';setDraft(confirmedRef.current);setKnown(false);setError('İstek gönderilemedi. Durumu yenile.');setBusy(false);}
  };
  useOnMessageBroadcast((m:any)=>{
    m=broadcastPayload(m);
    if(m?.type!=='pdfdark_result'||m.requestId!==pending.current)return;
    clearTimeout(timeout.current);pending.current='';setBusy(false);
    if(typeof m.enabled!=='boolean'||!validConfig(m.config)){setKnown(false);setError('Ana eklenti geçersiz durum döndürdü.');return;}
    const state={enabled:m.enabled,config:m.config};confirmedRef.current=state;setConfirmed(state);setKnown(!String(m.error||'').includes('Geri alma doğrulanamadı'));setError(m.error||'');
    if(sentRevision.current===revision.current)setDraft(state);
  });
  useEffect(()=>{void send();return()=>{clearTimeout(timeout.current);clearTimeout(debounce.current);pending.current='';}},[plugin]);
  const choose=(state:ReadingState,immediate=false)=>{revision.current++;setDraft(state);setBusy(true);clearTimeout(debounce.current);if(immediate)void send(state);else debounce.current=setTimeout(()=>void send(state),180);};
  const ratio=contrastFor(draft.config);
  return <main className="reading-panel">
    <style>{`html,body{margin:0}*{box-sizing:border-box}.reading-panel{--surface:#25272d;--muted:#b8bec9;--line:#4a4e58;min-height:100vh;padding:20px 24px;background:#1c1e23;color:#f4f5f7;font:14px/1.4 system-ui;display:flex;flex-direction:column;gap:14px;overflow:auto}.reading-panel header{display:flex;justify-content:space-between;align-items:center;gap:12px}.reading-panel h1{font-size:21px;margin:0}.reading-panel p{margin:0;color:var(--muted)}.reading-panel button{font:inherit;color:inherit;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:9px 12px;cursor:pointer}.reading-panel button:focus-visible,.reading-panel input:focus-visible{outline:3px solid #b9d5ff;outline-offset:3px}.reading-panel button[aria-pressed=true]{background:#345373;border-color:#88b4e2}.reading-panel .presets{display:flex;gap:8px;flex-wrap:wrap}.reading-panel .sliders{display:grid;gap:10px}.reading-panel label{display:grid;grid-template-columns:125px 1fr 44px;gap:12px;align-items:center}.reading-panel input{width:100%;accent-color:#a0c5e9}.reading-panel output{text-align:right;font-variant-numeric:tabular-nums}.reading-panel .preview{background:white;color:black;padding:16px;border-radius:8px;filter:var(--reading-filter);min-height:80px}.reading-panel .preview strong{display:block;margin-bottom:5px}.reading-panel small{font-size:12px;color:var(--muted)}.reading-panel .status{min-height:20px;color:#c7dfce}.reading-panel .error{color:#ffb8b8}.reading-panel footer{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}@media(max-width:420px){.reading-panel{padding:16px}.reading-panel label{grid-template-columns:95px 1fr 40px}}`}</style>
    <header><h1>☾ PDF Okuma Görünümü</h1><button aria-label="Görünüm panelini kapat" onClick={()=>plugin.widget.closePopup()}>×</button></header>
    <p>Kâğıdı ve yazıyı gözlerine göre ayarla. PDF dosyan ve notların değişmez.</p>
    <div className="presets" aria-label="Hazır görünümler">{PRESETS.map(p=><button key={p.name} aria-pressed={draft.enabled===p.enabled&&(!p.enabled||Object.keys(p.config).every(k=>p.config[k as keyof ReadingConfig]===draft.config[k as keyof ReadingConfig]))} onClick={()=>choose({enabled:p.enabled,config:{...p.config}},true)}>{p.name}</button>)}</div>
    <section className="sliders" aria-label="Görünüm ayarları">{([{key:'background',label:'Zemin parlaklığı',min:0,max:.4},{key:'text',label:'Yazı parlaklığı',min:.5,max:1},{key:'warmth',label:'Sıcaklık',min:0,max:1}] as const).map(s=><label key={s.key} htmlFor={s.key}><span>{s.label}</span><input id={s.key} type="range" min={s.min} max={s.max} step="0.01" value={draft.config[s.key]} onChange={e=>choose({enabled:true,config:{...draft.config,[s.key]:Number(e.target.value)}})}/><output htmlFor={s.key}>{Math.round(draft.config[s.key]*100)}%</output></label>)}</section>
    <section aria-label="Örnek önizleme" className="preview" style={{'--reading-filter':draft.enabled?filterFor(draft.config):'none'} as React.CSSProperties}><strong>Örnek sayfa · Okumaya alan aç</strong>Bu önizleme ayar taslağıdır; gerçek PDF’nin içeriği okunmaz.</section>
    <small>Yaklaşık kontrast: {draft.enabled?ratio.toFixed(1):'21.0'}:1{draft.enabled&&ratio<4.5?' · Düşük kontrast; yazı parlaklığını artır.':''}<br/>Sıcaklık renkleri ve kontrastı değiştirir; hesap nötr gri içindir, erişilebilirlik garantisi değildir.</small>
    <div role="status" aria-live="polite" className={`status ${error?'error':''}`}>{error||(busy?'Uygulanıyor…':known?(confirmed.enabled?'Okuma görünümü uygulandı.':'Orijinal görünüm doğrulandı.'):'Durum henüz doğrulanmadı.')}</div>
    <footer><button onClick={()=>choose({enabled:false,config:{...DEFAULT_CONFIG}},true)}>Orijinale dön</button><button onClick={()=>{clearTimeout(debounce.current);revision.current++;void send();}}>Durumu yenile</button></footer>
    <small>Renkli görseller de dönüşür. Yeniden yükleme veya eklentiyi kapatma filtreyi kaldırır.</small>
  </main>;
}
renderWidget(Controls);
