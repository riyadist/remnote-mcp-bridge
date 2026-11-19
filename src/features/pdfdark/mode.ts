// PDF Okuma Görünümü (rn-pdf-dark-local-dev 0.2.2) mantığı; birleşik eklentiye taşındı.
// Değişen yalnız adlar: CSS kimliği, oturum/yerel depolama anahtarı ve yayın (broadcast) mesaj türleri pdfdark_ önekli.
export type ReadingConfig={background:number;text:number;warmth:number};
export type ReadingState={enabled:boolean;config:ReadingConfig};
export const PREFERENCE_KEY='pdfdark_last_appearance';
export function preferenceFor(s:ReadingState){return {version:1,enabled:s.enabled,config:{...s.config}};}
export function readPreference(record:any):ReadingState|undefined{
  if(record?.version!==1||typeof record.enabled!=='boolean'||!validConfig(record.config))return undefined;
  return {enabled:record.enabled,config:{background:record.config.background,text:record.config.text,warmth:record.config.warmth}};
}
export function broadcastPayload(event:any){return event?.message??event;}
export const DEFAULT_CONFIG:ReadingConfig={background:.1,text:.78,warmth:0};
export const PRESETS=[{name:'Orijinal',enabled:false,config:DEFAULT_CONFIG},{name:'Yumuşak koyu',enabled:true,config:DEFAULT_CONFIG},{name:'Gece',enabled:true,config:{background:.04,text:.66,warmth:0}},{name:'Sıcak',enabled:true,config:{background:.12,text:.8,warmth:.5}}];
export function validConfig(c:any):c is ReadingConfig{return !!c&&Number.isFinite(c.background)&&c.background>=0&&c.background<=.4&&Number.isFinite(c.text)&&c.text>=.5&&c.text<=1&&Number.isFinite(c.warmth)&&c.warmth>=0&&c.warmth<=1;}
export function filterFor(c:ReadingConfig){if(!validConfig(c))throw Error('Geçersiz görünüm ayarı.');return `grayscale(1) invert(1) contrast(${(c.text-c.background)/(c.text+c.background)}) brightness(${c.text+c.background}) sepia(${c.warmth}) saturate(0.65)`;}
export function cssFor(s:ReadingState){return s.enabled?`canvas.rn-drawing-canvas-pdf-worker-canvas {filter: ${filterFor(s.config)} !important;}`:'';}
export function contrastFor(c:ReadingConfig){const luminance=(v:number)=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);return (luminance(c.text)+.05)/(luminance(c.background)+.05);}
export async function applyMode(plugin:any,next:ReadingState,previous:ReadingState,persistence?:{previous:any}){
  if(typeof next.enabled!=='boolean'||!validConfig(next.config))throw Error('Geçersiz görünüm ayarı.');
  let localAttempted=false;
  try{
    await plugin.app.registerCSS('pdfdark_display',cssFor(next));
    await plugin.storage.setSession('pdfdark_state',next);
    if(persistence){localAttempted=true;await plugin.storage.setLocal(PREFERENCE_KEY,preferenceFor(next));}
  }catch(error){
    let rollbackFailed=false;
    try{await plugin.app.registerCSS('pdfdark_display',cssFor(previous));}catch{rollbackFailed=true;}
    try{await plugin.storage.setSession('pdfdark_state',previous);}catch{rollbackFailed=true;}
    if(localAttempted)try{await plugin.storage.setLocal(PREFERENCE_KEY,persistence!.previous);}catch{rollbackFailed=true;}
    if(rollbackFailed)throw Error('Geri alma doğrulanamadı; eklentiyi yeniden yükle.');
    throw error;
  }
}
export const PDF_CSS=cssFor({enabled:true,config:DEFAULT_CONFIG});
export async function setMode(plugin:any,on:boolean,previous:boolean){
  await plugin.app.registerCSS('pdfdark_display',on?PDF_CSS:'');
  try{await plugin.storage.setSession('pdfdark_enabled',on);}
  catch(error){await plugin.app.registerCSS('pdfdark_display',previous?PDF_CSS:'');throw error;}
}
