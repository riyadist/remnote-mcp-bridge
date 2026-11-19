'use strict';
// Browser-only, fixed image API. Never persists a token or forwards note context.
const BASE='http://127.0.0.1:8896',CLIENT='remnote-mcp-bridge-v1';
function publicHttps(value){
  if(typeof value!=='string'||value.length>2048)return null;
  try{const u=new URL(value),h=u.hostname.toLowerCase().replace(/\.$/,'');
    if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!h.includes('.')||h.includes(':')||h.startsWith('[')||/^\d+(?:\.\d+){3}$/.test(h)||/(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(h)||h==='localhost.localdomain')return null;
    return u.href;
  }catch{return null;}
}
const text=(value,max)=>typeof value==='string'&&value.length<=max&&!/[<>\u0000-\u001f\u007f]/.test(value)?value.trim():null;
function imageResult(data){
  if(!data||data.ok!==true||data.protocol!==1||data.readOnly!==true||data.mutationApplied!==false||!Array.isArray(data.candidates)||data.candidates.length>5)throw Error('IMAGE_INVALID_RESPONSE');
  const candidates=[],seen=new Set();
  for(const row of data.candidates){
    const imageUrl=publicHttps(row?.imageUrl),sourceUrl=publicHttps(row?.sourceUrl),title=text(row?.title,200);
    if(!imageUrl||!sourceUrl||!title||seen.has(imageUrl))continue;
    const candidate={imageUrl,sourceUrl,title};seen.add(imageUrl);
    const thumb=publicHttps(row.thumbnailUrl);if(thumb)candidate.thumbnailUrl=thumb;
    if(row.previewOnly===true)candidate.previewOnly=true;
    for(const key of ['creator','license']){const value=text(row[key],200);if(value!=null)candidate[key]=value;}
    candidates.push(candidate);
  }
  if(!candidates.length)throw Error('IMAGE_EMPTY');
  const result={candidates,readOnly:true,mutationApplied:false};
  if(typeof data.rankingPending==='boolean')result.rankingPending=data.rankingPending;
  if(data.ranker==='OpenCLIP')result.ranker='OpenCLIP';
  if(typeof data.warningCode==='string'&&/^[A-Z][A-Z0-9_]{0,59}$/.test(data.warningCode))result.warningCode=data.warningCode;
  return result;
}
function createSmartImageTransport(fallback,{fetch:fetcher=globalThis.fetch}={}){
  let session=null,pairing=null;
  async function request(route,body,token){
    const response=await fetcher(BASE+route,{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(route==='/session'?2500:12500),headers:{'Content-Type':'application/json','X-Smart-Images-Client':CLIENT,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
    if(response.status===401)return {unauthorized:true};
    if(!response.ok||!/^application\/json\b/i.test(response.headers.get('content-type')||''))throw Error('IMAGE_HTTP_FAILED');
    if(Number(response.headers.get('content-length')||0)>65536)throw Error('IMAGE_RESPONSE_LIMIT');
    const reader=response.body.getReader();let length=0,parts=[];
    try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>65536)throw Error('IMAGE_RESPONSE_LIMIT');parts.push(value);}}
    catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
    const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async function getSession(){
    if(session&&session.expires>Date.now())return session;
    if(!pairing)pairing=(async()=>{
      const data=await request('/session',{protocol:1});
      if(data.ok!==true||data.protocol!==1||typeof data.token!=='string'||!/^[a-f0-9]{64}$/.test(data.token)||!Number.isSafeInteger(data.expiresInMs)||data.expiresInMs<1000||data.expiresInMs>1800000)throw Error('IMAGE_SESSION_FAILED');
      session={token:data.token,expires:Date.now()+data.expiresInMs-1000};return session;
    })().finally(()=>{pairing=null;});
    return pairing;
  }
  return async function transport(action,payload={}){
    if(action!=='host_explain_images')return fallback(action,payload);
    const query=typeof payload.visualQuery==='string'&&payload.visualQuery.trim()?payload.visualQuery.trim():typeof payload.selectedText==='string'?payload.selectedText.trim():'';
    if(!query||query.length>160||/[\u0000-\u001f\u007f!:<>/\\]/.test(query))return fallback(action,payload);
    const limit=Number.isInteger(payload.limit)?Math.max(1,Math.min(5,payload.limit)):5;
    try{
      for(let attempt=0;attempt<2;attempt++){
        const current=await getSession(),data=await request('/images',{query,limit},current.token);
        if(!data.unauthorized)return imageResult(data);
        if(session===current)session=null;
      }
    }catch{/* Native image search is preserved on unavailable/invalid local API. */}
    return fallback(action,payload);
  };
}
module.exports={createSmartImageTransport};
