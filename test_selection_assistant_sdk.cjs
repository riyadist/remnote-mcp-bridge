'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const target=require('node:path').join(__dirname,'selection-assistant-sdk.cjs');
test('SDK assistant adapter exists',()=>assert.equal(fs.existsSync(target),true));
if(fs.existsSync(target)){
  const {registerAssistantSDK,createAssistantAPI}=require(target);
  function fixture(){
    const calls=[],commands=[],menus=[];
    const plugin={app:{registerWidget:async()=>{},registerCommand:async c=>commands.push(c),registerMenuItem:async m=>menus.push(m)},
      widget:{openPopup:async(name,data)=>calls.push(['popup',name,data])}};
    return {calls,commands,menus,plugin};
  }
  test('standard note command captures before opening full assistant, not translation',async()=>{
    const f=fixture();
    await registerAssistantSDK(f.plugin,{popupLocation:2,readerLocation:3,
      captureContext:async()=>({selectedText:'seçili not'}),
      callHost:async(a,p)=>{f.calls.push([a,p]);return {captureId:'c1',segments:[['seçili not']],editable:true};}});
    await f.commands[0].action();
    assert.equal(f.commands[0].id,'remnote-mcp-bridge.assistant-selection');
    assert.equal(f.calls[0][0],'host_assistant_capture');assert.equal(f.calls[0][1].surface,'note');
    assert.equal(f.calls[1][1],'assistant_popup');assert.equal(f.calls[1][2].initialCapture.captureId,'c1');
  });
  test('Reader menu uses read-only PDF capture without a note selection',async()=>{
    const f=fixture();let args;
    await registerAssistantSDK(f.plugin,{popupLocation:2,readerLocation:3,
      captureContext:async(source,value)=>{args=value;return {selectedText:'selected PDF'};},
      callHost:async(a,p)=>{assert.equal(p.surface,'pdf');return {captureId:'p1',segments:[['selected PDF']],editable:false};}});
    await f.menus[0].action({text:'selected PDF'});
    assert.deepEqual(args,{text:'selected PDF'});assert.equal(f.calls[0][2].surface,'pdf');
  });
  test('capture failure opens assistant with explicit error and no false editable snapshot',async()=>{
    const f=fixture();
    await registerAssistantSDK(f.plugin,{popupLocation:2,readerLocation:3,captureContext:async()=>({}),
      callHost:async()=>{throw Error('selection missing');}});
    await f.commands[0].action();const data=f.calls[0][2];
    assert.equal(data.initialCapture,undefined);assert.equal(data.captureError,'selection missing');
  });
  test('popup reuses original capture and forwards existing chat contract unchanged',async()=>{
    const calls=[],capture={captureId:'old-selection',segments:[['original']],editable:true};
    const api=createAssistantAPI({selectedText:'original',initialCapture:capture},async(...args)=>{calls.push(args);return {answer:'ok'};},
      {show(){},close(){},translate(){}});
    assert.deepEqual(await api.call('host_assistant_capture',{}),capture);assert.equal(calls.length,0);
    assert.deepEqual(await api.call('host_assistant_chat',{captureId:'old-selection',question:'q'}),{answer:'ok'});
    assert.deepEqual(calls,[['host_assistant_chat',{captureId:'old-selection',question:'q'}]]);
  });
}
