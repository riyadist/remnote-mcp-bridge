'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function load(){
 const source=fs.readFileSync(require('node:path').join(__dirname,'src/widgets/index.tsx'),'utf8');
 const ast=ts.createSourceFile('index.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const names=['lastPersistedRuntimeKey','runtimePersistenceQueue','persistedRuntimePlugin','persistBridgeRuntime'];
 const code=ast.statements.filter(n=>(ts.isFunctionDeclaration(n)&&names.includes(n.name?.text))||(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.includes(d.name.getText(ast))))).map(n=>n.getText(ast)).join('\n');
 const errors=[];const c={console:{warn:(...args)=>errors.push(args)},Promise,Date,JSON,wsClient:{getStatus:()=> 'connected'},LOCAL_PLUGIN_VERSION:'test',STORAGE_RUNTIME_STATUS:'runtime',bridgeStats:{calls:0},bridgeRecentActions:[],bridgeLastError:null};
 vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText+'\nthis.persist=persistBridgeRuntime;',c);return{c,errors};
}
test('failed storage is handled and identical next heartbeat retries',async()=>{
 const {c,errors}=load();let writes=0;const p={storage:{setLocal:async()=>{if(++writes===1)throw Error('offline');}}};
 await c.persist(p);await c.persist(p);await c.persist(p);assert.equal(writes,2);assert.equal(errors.length,1);
});
test('concurrent persistence is ordered and snapshot stays immutable',async()=>{
 const {c}=load();const rows=[];let release;const p={storage:{setLocal:async(_,v)=>{rows.push(v);if(rows.length===1)await new Promise(r=>release=r);}}};
 const a=c.persist(p,'connecting');await new Promise(r=>setImmediate(r));c.bridgeStats.calls=5;
 const b=c.persist(p,'connected');await new Promise(r=>setImmediate(r));assert.equal(rows.length,1);assert.equal(rows[0].stats.calls,0);
 release();await Promise.all([a,b]);assert.deepEqual(rows.map(r=>r.status),['connecting','connected']);assert.equal(rows[1].stats.calls,5);
});
test('runtime status is written device-locally, never to synced storage',async()=>{
 const {c}=load();let local=0,synced=0;const p={storage:{setLocal:async()=>{local++;},setSynced:async()=>{synced++;}}};
 await c.persist(p);assert.equal(local,1);assert.equal(synced,0);
});
test('fresh plugin instance receives unchanged snapshot',async()=>{
 const {c}=load();let writes=0;const plugin=()=>({storage:{setLocal:async()=>{writes++;}}});
 await c.persist(plugin());await c.persist(plugin());assert.equal(writes,2);
});
