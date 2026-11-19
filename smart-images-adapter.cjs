'use strict';
const path=require('node:path');

// Optional external installation. No service start, port replacement or app
// mutation is performed here; an unavailable installation keeps the native path.
function createImageFinder({nativeFindImages,acceptCandidate,loadProvider=()=>require(path.resolve(__dirname,'../../../../Services/SmartImages/image_provider.cjs'))}) {
  let initialized=false,provider=null;
  const check=signal=>{if(signal?.aborted)throw Object.assign(Error('Explain images cancelled.'),{code:'CODEX_CANCELLED'});};
  return async function findImages(query,opts={}) {
    check(opts.signal);
    if(!initialized){
      initialized=true;
      try{provider=loadProvider().createProvider({fallback:nativeFindImages,acceptCandidate});}
      catch{provider=null;}
    }
    if(provider){
      try{const result=await provider.findImages(query,opts);check(opts.signal);return result;}
      catch{check(opts.signal);}
    }
    const result=await nativeFindImages(query,opts);check(opts.signal);return result;
  };
}
module.exports={createImageFinder};
