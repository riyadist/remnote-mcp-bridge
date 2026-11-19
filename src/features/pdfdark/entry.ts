// PDF Okuma Görünümü giriş düğmesi kaydı (rn-pdf-dark-local-dev 0.2.2'den taşındı).
import {WidgetLocation,type ReactRNPlugin} from '@remnote/plugin-sdk';

// This registers a real SDK widget, not a CSS pseudo-button or parent-DOM injection.
export async function registerEntry(plugin:ReactRNPlugin,isActive:()=>boolean,location:WidgetLocation=WidgetLocation.PaneHeader){
  let registered=false;
  let floatingId:string|undefined;
  let styled=false;
  let cleaning:Promise<void>|undefined;
  const cleanup=async()=>{if(!cleaning)cleaning=(async()=>{
    const errors:unknown[]=[];
    if(floatingId){try{await plugin.window.closeFloatingWidget(floatingId);floatingId=undefined;}catch(error){errors.push(error);}}
    if(registered){try{await plugin.app.unregisterWidget('pdfdark_entry',location);registered=false;}catch(error){errors.push(error);}}
    if(styled){try{await plugin.app.registerCSS('pdfdark_entry_css',floatingId||registered?HIDE_ENTRY_CSS:'');if(!floatingId&&!registered)styled=false;}catch(error){errors.push(error);}}
    if(errors.length)throw errors[0];
  })().finally(()=>{cleaning=undefined;});return cleaning;};
  if(!isActive())return cleanup;
  await plugin.app.registerWidget('pdfdark_entry',location,{dimensions:{width:116,height:36}});
  registered=true;
  if(location===WidgetLocation.FloatingWidget&&isActive()){
    try{
      await plugin.app.registerCSS('pdfdark_entry_css',FLOATING_ENTRY_CSS);styled=true;
      // No classContainer: RemNote 1.28 has no `.rn-pdf-viewer` element, so a
      // container-scoped widget never mounted. FLOATING_ENTRY_CSS anchors it.
      if(isActive())floatingId=await plugin.window.openFloatingWidget('pdfdark_entry',{top:0,right:0},undefined,false);
    }catch(error){await cleanup();throw error;}
  }
  if(!isActive())await cleanup();
  return cleanup;
}

// Official registerCSS + FloatingWidget. No script reads or changes the parent DOM.
// An unsupported anchor engine or absent PDF leaves the owned widget hidden.
const frame='iframe[data-plugin-id^="remnote-mcp-bridge-y-edition-dev"][src*="widgetName=pdfdark_entry"]';
// Only an immediate wrapper with no other element children may be repositioned.
// Never match an application root or a shared popup ancestor.
const wrapper=`div:not(#root):not(#react-root):has(>${frame}:only-child)`;
// RemNote leaves a fade-in transform on the floating widget's own container; a
// transformed ancestor becomes the fixed-position containing block and makes the
// anchor outside it unreachable, so only the container holding this entry is reset.
// :has() cannot be nested, so the container is matched through a plain child chain.
const container=`div:has(>div:not(#root):not(#react-root)>${frame}:only-child)`;
const shown=`:root:has(canvas.rn-drawing-canvas-pdf-worker-canvas):has([data-test="ai-learning-tools-button"])`;
export const HIDE_ENTRY_CSS=`${frame}{display:none!important;}`;
export const FLOATING_ENTRY_CSS=`
[data-test="ai-learning-tools-button"]{anchor-name:--rn-pdf-reading-ai;}
${HIDE_ENTRY_CSS}
@supports (top:anchor(center)) and (position-visibility:anchors-visible){
  ${shown} ${container}{transform:none!important;}
  ${shown} ${wrapper}{
    display:block!important;position:fixed!important;position-anchor:--rn-pdf-reading-ai!important;
    top:anchor(center)!important;right:calc(anchor(left) + 8px)!important;left:auto!important;bottom:auto!important;
    transform:translateY(-50%)!important;width:116px!important;height:36px!important;min-width:0!important;min-height:0!important;
    position-visibility:anchors-visible!important;overflow:hidden!important;border:0!important;padding:0!important;margin:0!important;background:transparent!important;box-shadow:none!important;
  }
  ${shown} ${wrapper}>${frame}{display:block!important;width:116px!important;height:36px!important;border:0!important;background:transparent!important;}
  /* The CDP toolbar button, when present, wins; same base selector keeps this rule more specific. */
  ${shown}:has([data-rn-pdf-reading-view]) ${wrapper}{display:none!important;}
}`;
