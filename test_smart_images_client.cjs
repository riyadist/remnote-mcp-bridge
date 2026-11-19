'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const create=fs.existsSync(path.join(__dirname,'smart-images-client.cjs'))?require('./smart-images-client.cjs').createSmartImageTransport:null;
const row={imageUrl:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Elm.jpg',sourceUrl:'https://example.com/elm',title:'Elm'};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const session=()=>response({ok:true,protocol:1,token:'a'.repeat(64),expiresInMs:1800000});
const images=()=>response({ok:true,protocol:1,readOnly:true,mutationApplied:false,candidates:[row],rankingPending:true,ranker:'OpenCLIP'});
test('only image action is decorated, query is narrow, session coalesces and secrets never enter native transport',async()=>{
  assert.equal(typeof create,'function');let native=0;const calls=[];
  const transport=create(async(action,payload)=>{native++;return {action,payload}},{fetch:async(url,options)=>{calls.push({url,options});return url.endsWith('/session')?session():images();}});
  const unchanged={contextText:'private note'};assert.deepEqual(await transport('host_assistant_capture',unchanged),{action:'host_assistant_capture',payload:unchanged});
  const [a,b]=await Promise.all([transport('host_explain_images',{selectedText:'elm',visualQuery:'elm tree',contextText:'never send',limit:5}),transport('host_explain_images',{selectedText:'elm tree',limit:5})]);
  assert.equal(native,1);assert.equal(a.candidates.length,1);assert.equal(b.ranker,'OpenCLIP');assert.equal(calls.filter(c=>c.url.endsWith('/session')).length,1);
  for(const c of calls){assert.match(c.url,/^http:\/\/127\.0\.0\.1:8896\/(session|images)$/);assert.equal(c.options.credentials,'omit');assert.equal(c.options.redirect,'error');assert.equal(c.options.cache,'no-store');assert.ok(!c.options.body.includes('never send'));}
  assert.deepEqual(JSON.parse(calls.find(c=>c.url.endsWith('/images')).options.body),{query:'elm tree',limit:5});
});
test('401 refreshes once and then falls back without leaking tokens or changing payload',async()=>{
  assert.equal(typeof create,'function');let sessions=0,attempts=0,native=0;const payload={selectedText:'elm',contextText:'keep locally'};
  const transport=create(async(a,p)=>{native++;assert.strictEqual(p,payload);return {fallback:true};},{fetch:async url=>{if(url.endsWith('/session')){sessions++;return session();}attempts++;return response({ok:false},401);}});
  assert.deepEqual(await transport('host_explain_images',payload),{fallback:true});assert.equal(sessions,2);assert.equal(attempts,2);assert.equal(native,1);
});
test('empty invalid unsafe and failed responses preserve native fallback',async()=>{
  assert.equal(typeof create,'function');
  for(const value of [{ok:true,protocol:1,readOnly:false,mutationApplied:true,candidates:[row]},{ok:true,protocol:1,readOnly:true,mutationApplied:false,candidates:[]},{ok:true,protocol:1,readOnly:true,mutationApplied:false,candidates:[{...row,imageUrl:'http://127.0.0.1/private'}]}]){
    const transport=create(async()=>({fallback:true}),{fetch:async url=>url.endsWith('/session')?session():response(value)});
    assert.deepEqual(await transport('host_explain_images',{selectedText:'elm'}),{fallback:true});
  }
  const transport=create(async()=>({fallback:true}),{fetch:async()=>{throw Error('network')}});assert.deepEqual(await transport('host_explain_images',{selectedText:'elm'}),{fallback:true});
});
