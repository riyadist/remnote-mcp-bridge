'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const adapter=fs.existsSync(require('node:path').join(__dirname,'smart-images-adapter.cjs'))?require('./smart-images-adapter.cjs'):null;
const create=options=>{assert.equal(typeof adapter?.createImageFinder,'function','optional smart image adapter must exist');return adapter.createImageFinder(options);};
test('missing external installation retains native fallback without starting resources',async()=>{
  let calls=0;const nativeFindImages=async(q,o)=>{calls++;return [{title:q,limit:o.limit}];};
  const find=create({nativeFindImages,loadProvider:()=>{throw Error('MODULE_NOT_FOUND')}});
  assert.deepEqual(await find('elm',{limit:3}),[{title:'elm',limit:3}]);assert.equal(calls,1);
});
test('optional provider is lazy, shares a single cache and keeps native meaning predicate',async()=>{
  let loads=0,options;const nativeFindImages=async()=>[];const acceptCandidate=()=>false;
  const find=create({nativeFindImages,acceptCandidate,loadProvider:()=>{loads++;return {createProvider:opts=>{options=opts;return {findImages:async()=>({candidates:[],rankingPending:true})}}}}});
  assert.equal(loads,0);assert.equal((await find('elm')).rankingPending,true);await find('elm');
  assert.equal(loads,1);assert.equal(options.fallback,nativeFindImages);assert.equal(options.acceptCandidate,acceptCandidate);
});
test('provider runtime failure recovers native results but cancellation never starts fallback',async()=>{
  let nativeCalls=0;const find=create({nativeFindImages:async()=>{nativeCalls++;return ['native'];},loadProvider:()=>({createProvider:()=>({findImages:async()=>{throw Error('SERVICE_DOWN')}})})});
  assert.deepEqual(await find('elm'),['native']);assert.equal(nativeCalls,1);
  const controller=new AbortController();controller.abort();
  await assert.rejects(find('elm',{signal:controller.signal}),e=>e.code==='CODEX_CANCELLED');assert.equal(nativeCalls,1);
});
