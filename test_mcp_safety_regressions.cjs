'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, 'src/api/rem-adapter.ts'), 'utf8');
const ast = ts.createSourceFile('adapter.ts', source, ts.ScriptTarget.Latest, true);
const declarations = ast.statements.filter(n => (ts.isClassDeclaration(n) && n.name.text === 'RemAdapter') || (ts.isVariableStatement(n) && n.declarationList.declarations.some(d => ['SDK_REM_METHOD_ALLOWLIST','RAW_REM_CALL_ALLOWLIST'].includes(d.name.getText(ast))))).map(n => n.getText(ast)).join('\n');
const context = { exports: {}, console, Set, BRIDGE_PLUGIN_VERSION:'fixture', EXTRA_CARD_DETAIL_POWERUP_CODE:'x' };
vm.runInNewContext(ts.transpileModule(declarations,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,context);
function fixture() {
  const effects=[];
  const children=[{_id:'old',text:['keep'],getChildrenRem:async()=>[],remove:async()=>effects.push('old.remove')}];
  const root={_id:'r',text:['Exact title'],getFontSize:async()=>undefined,getChildrenRem:async()=>children,remove:async()=>effects.push('root.remove'),getParentRem:async()=>undefined};
  let next=0;
  const plugin={rem:{findOne:async id=>id==='r'?root:undefined,findByName:async()=>root,createRem:async()=>{const id='new'+(++next);effects.push(id+'.create');return{_id:id,setText:async()=>effects.push(id+'.text'),setParent:async()=>effects.push(id+'.parent'),setFontSize:async()=>{},remove:async()=>effects.push(id+'.remove')};}},search:{search:async()=>[]}};
  const a=Object.create(context.exports.RemAdapter.prototype);a.plugin=plugin;a.settings={autoTagEnabled:false};
  a.getRemText=async rem=>rem.text.join('');a.textToRichText=async text=>[text];a.textToPlainRichText=text=>[text];a.serializeForBridge=async value=>value;a.headingFontSizeFromLevel=()=>undefined;a.buildNameVariants=title=>[title];a.normalizeImageUrls=()=>[];
  return {a,root,plugin,effects,children};
}
for(const operation of ['deleteNote','overwriteNoteContent']) {
  test(operation+' does not remove without confirmation and matching target',async()=>{
    for(const extra of [{},{confirm:operation==='deleteNote'?'DELETE_NOTE':'OVERWRITE_NOTE_CONTENT',allowDestructive:true,expectedRemId:'wrong'},{dryRun:true,confirm:operation==='deleteNote'?'DELETE_NOTE':'OVERWRITE_NOTE_CONTENT',allowDestructive:true,expectedRemId:'r'}]) {
      const {a,effects}=fixture();
      const result=await a[operation]({remId:'r',content:'new content',...extra});
      assert.equal(effects.length,0);assert.equal(result.mutationApplied,false);
    }
  });
}
test('confirmed delete uses only the expected target',async()=>{
  const {a,effects}=fixture();const result=await a.deleteNote({remId:'r',confirm:'DELETE_NOTE',allowDestructive:true,expectedRemId:'r'});
  assert.equal(result.success,true);assert.deepEqual(effects,['old.remove','root.remove']);
});
for(const content of [undefined,null,12,{},'','  ']) test('overwrite rejects invalid or implicit empty content '+JSON.stringify(content),async()=>{
  const {a,effects}=fixture();await assert.rejects(a.overwriteNoteContent({remId:'r',content,confirm:'OVERWRITE_NOTE_CONTENT',allowDestructive:true,expectedRemId:'r'}));assert.deepEqual(effects,[]);
});
test('overwrite preserves old content until replacement is ready',async()=>{
  const {a,effects}=fixture();await a.overwriteNoteContent({remId:'r',content:'replacement',confirm:'OVERWRITE_NOTE_CONTENT',allowDestructive:true,expectedRemId:'r'});
  assert.ok(effects.indexOf('new1.parent')<effects.indexOf('old.remove'));assert.ok(effects.includes('old.remove'));
});
test('failed replacement creation never deletes prior content',async()=>{
  const {a,plugin,effects}=fixture();plugin.rem.createRem=async()=>{throw Error('SDK unavailable');};
  await assert.rejects(a.overwriteNoteContent({remId:'r',content:'replacement',confirm:'OVERWRITE_NOTE_CONTENT',allowDestructive:true,expectedRemId:'r'}));assert.deepEqual(effects,[]);
});
test('structured summary preserves template children',async()=>{
  const {a,effects}=fixture();a.createNote=async()=>({remId:'r',title:'Summary'});await a.createStructuredSummary({title:'Summary',sections:[]});assert.deepEqual(effects,[]);
});
test('upsert never overwrites a fuzzy result',async()=>{
  const {a,root,plugin,effects}=fixture();plugin.rem.findByName=async()=>undefined;plugin.search.search=async()=>[root];
  a.createStructuredSummary=async()=>({remId:'created',title:'Different title'});
  const result=await a.upsertStructuredNote({title:'Different title',sections:[]});assert.equal(result.status,'created');assert.deepEqual(effects,[]);
});
test('upsert verifies parent even if SDK name lookup returns a different parent',async()=>{
  const {a,root,effects}=fixture();root.getParentRem=async()=>({_id:'other'});a.createStructuredSummary=async()=>({remId:'created',title:'Exact title'});
  const result=await a.upsertStructuredNote({title:'Exact title',parentId:'wanted',sections:[]});assert.equal(result.status,'created');assert.deepEqual(effects,[]);
});
test('existing exact upsert requires explicit overwrite confirmation',async()=>{
  const {a,effects}=fixture();const result=await a.upsertStructuredNote({title:'Exact title',sections:[{heading:'h',body:'b'}]});assert.equal(result.mutationApplied,false);assert.deepEqual(effects,[]);
});
for(const method of ['merge','mergeAndSetAlias','setParent','setTableFilter','setTodoStatus','removeTag']) test('generic SDK rejects mutating '+method,async()=>{
  const {a,root,effects}=fixture();root[method]=async()=>effects.push(method);await assert.rejects(a.remSdkCall({remId:'r',method,args:['target']}));assert.deepEqual(effects,[]);
});
test('generic SDK read still works',async()=>{
  const {a,root}=fixture();root.getTodoStatus=async()=> 'Unfinished';const result=await a.remSdkCall({remId:'r',method:'getTodoStatus'});assert.equal(result.result,'Unfinished');
});
test('generic raw calls cannot bypass setter gates',async()=>{
  const {a,root,effects}=fixture();root.call=async()=>effects.push('raw');await assert.rejects(a.remRawCall({remId:'r',method:'setTableFilter',payload:{}}));assert.deepEqual(effects,[]);
});
test('upsert rejects effectively empty replacement before removing children',async()=>{
  const {a,effects}=fixture();
  await assert.rejects(a.upsertStructuredNote({title:'Exact title',sections:[{heading:' ',body:' '}],confirm:'UPSERT_STRUCTURED_NOTE',allowDestructive:true,expectedRemId:'r'}));
  assert.deepEqual(effects,[]);
});
test('PowerUp SDK failure is never retried using another name',async()=>{
  const {a,root,effects}=fixture();root.addPowerup=async code=>{effects.push(code);throw Error('response lost');};
  await assert.rejects(a.addPowerup({remId:'r',powerup:'todo'}));assert.deepEqual(effects,['t']);
});
test('failed image preparation preserves previous upsert content',async()=>{
 const {a,plugin,effects}=fixture();a.normalizeImageUrls=urls=>urls||[];
 const create=plugin.rem.createRem;let count=0;plugin.rem.createRem=async()=>++count===1?create():undefined;
 await assert.rejects(a.upsertStructuredNote({title:'Exact title',sections:[{heading:'',body:'',imageUrls:['https://example.test/image.jpg']}],confirm:'UPSERT_STRUCTURED_NOTE',allowDestructive:true,expectedRemId:'r'}));
 assert.ok(!effects.includes('old.remove'));
});
