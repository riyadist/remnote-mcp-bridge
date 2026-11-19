'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const http=require('node:http');
const {once}=require('node:events');
const WebSocket=require('ws');
async function port(){const s=http.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function fixture(t){
 const HTTP_PORT=await port(),WS_PORT=await port();const actions=[];
 const source=fs.readFileSync(path.join(__dirname,'bridge-host.cjs'),'utf8');
 const code=source.slice(source.indexOf('function sendJson('));
 const c={http,WebSocket,URL,JSON,Map,Set,Array,Error,Promise,Buffer,setTimeout,clearTimeout,setInterval,clearInterval,console:{log(){},warn(){}},process:{on(){}},
 HTTP_PORT,WS_PORT,REQUEST_TIMEOUT_MS:1000,startedAt:'test',clients:new Map(),pending:new Map(),sseClients:new Set(),stats:{},recentActions:[],HOST_ACTIONS:new Set(['fixture_read']),
 handleHostAction:async(a,p)=>{actions.push([a,p]);return {readOnly:true};},randomUUID:require('node:crypto').randomUUID,
 createBridgeTransport:require('./bridge-transport.cjs').createBridgeTransport,evaluateBridgeRequest:require('./bridge-request-policy.cjs').evaluateBridgeRequest,
 verifyPluginKey:key=>key==='a'.repeat(64),
 recordAction(){},broadcastEvent(){},getRuntimeStatus:()=>({}),getTranslateDebugSnapshot:()=>({}),warmCodexTranslationModelAsync(){},warmTopicChatModelAsync(){}};
 vm.runInNewContext(code+'\nthis.servers={httpServer,wsServer,transport:typeof bridgeTransport===\'undefined\'?null:bridgeTransport};',c);
 await Promise.all([c.servers.httpServer.listening?Promise.resolve():once(c.servers.httpServer,'listening'),c.servers.wsServer.address()?Promise.resolve():once(c.servers.wsServer,'listening')]);
 t.after(async()=>{c.servers.transport?.dispose();for(const s of c.servers.wsServer.clients)s.terminate();await Promise.all([new Promise(r=>c.servers.httpServer.close(r)),new Promise(r=>c.servers.wsServer.close(r))]);});
 return{c,actions,base:'http://127.0.0.1:'+HTTP_PORT,ws:'ws://127.0.0.1:'+WS_PORT};
}
test('real host HTTP handler rejects foreign calls before dispatch; exact origin works',async t=>{
 const f=await fixture(t);const request=origin=>fetch(f.base+'/call',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'fixture_read',payload:{}})});
 const denied=await request('https://evil.example');assert.equal(denied.status,403);assert.equal(f.actions.length,0);assert.notEqual(denied.headers.get('access-control-allow-origin'),'*');
 const allowed=await request('http://localhost:8080');assert.equal(allowed.status,200);assert.equal(allowed.headers.get('access-control-allow-origin'),'http://localhost:8080');assert.equal(f.actions.length,1);
 const plain=await fetch(f.base+'/call',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'});assert.equal(plain.status,415);
});
test('real host: sandboxed Origin null needs the plugin key on HTTP and WebSocket',async t=>{
 const f=await fixture(t);const key='a'.repeat(64);
 const call=headers=>fetch(f.base+'/call',{method:'POST',headers:{Origin:'null','Content-Type':'application/json',...headers},body:JSON.stringify({action:'fixture_read',payload:{}})});
 assert.equal((await call({})).status,403);assert.equal((await call({'X-RemNote-Key':'b'.repeat(64)})).status,403);assert.equal(f.actions.length,0);
 const ok=await call({'X-RemNote-Key':key});assert.equal(ok.status,200);assert.equal(ok.headers.get('access-control-allow-origin'),'null');assert.equal(f.actions.length,1);
 const noKey=new WebSocket(f.ws,{origin:'null'});const refused=await new Promise(r=>{noKey.on('unexpected-response',(_q,res)=>r(res.statusCode));noKey.on('open',()=>r('open'));noKey.on('error',()=>{});});assert.equal(refused,403);
 const keyed=new WebSocket(f.ws+'/?key='+key,{origin:'null'});t.after(()=>keyed.terminate());await once(keyed,'open');
});
test('host websocket requires app pong, routes response, rejects pending on close',async t=>{
 const f=await fixture(t);const ws=new WebSocket(f.ws,{origin:'http://localhost:8080'});t.after(()=>ws.terminate());
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='ping')ws.send(JSON.stringify({type:'pong'}));else if(m.action==='get_status')ws.send(JSON.stringify({id:m.id,result:{version:'fixture'}}));else if(m.action==='create_note')ws.close();});
 await once(ws,'open');await new Promise(r=>setTimeout(r,30));
 const health=await(await fetch(f.base+'/health')).json();assert.equal(health.pluginConnected,true);assert.equal(health.healthyClients,1);
 const call=action=>fetch(f.base+'/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload:{}})});
 assert.equal((await(await call('get_status')).json()).result.version,'fixture');
 const start=Date.now();const failed=await(await call('create_note')).json();assert.equal(failed.ok,false);assert.match(failed.error,/unknown/i);assert.ok(Date.now()-start<800);assert.equal((await(await fetch(f.base+'/health')).json()).pending,0);
});
