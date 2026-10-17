import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLibraryManagement} from '../../web/labs/motion/application/library-management.js';
function fixture(overrides={}){
 const calls=[],state={busy:false,poseDraft:null,modelKey:'m',poses:[{id:'builtin:p',name:'默认'},{id:'p',name:'姿势'}],customs:[{id:'a',name:'动作'}],clips:[{name:'源'}],aiWorkspace:{tasks:[]},editingActionId:'a',mode:'custom',customPreview:{id:'a'}};
 const workbench={inspect:()=>({modelKey:'m',revision:3}),libraryClipboard:{inspect:()=>({kind:'custom',modelKey:'m'}),copy:entry=>entry,paste:async kind=>({id:'new',name:'副本',kind})},aiWorkspace:{trash:async value=>calls.push(value)}};
 const api=createLibraryManagement({state,workbench,confirm:async()=>true,persist:async value=>calls.push(value),onBusyChange:()=>calls.push(['busy',state.busy]),...overrides});return {state,workbench,calls,api};
}
test('重命名身份/版本取自工作台，默认和草稿不开放',()=>{
 const {api,state}=fixture();assert.deepEqual(api.renameRequest({kind:'custom',id:'a'}),{kind:'custom',id:'a',name:'动作',expected:{modelKey:'m',revision:3}});
 assert.equal(api.renameRequest({kind:'pose',id:'builtin:p'}),null);state.poseDraft={};assert.equal(api.renameRequest({kind:'pose',id:'p'}),null);
});
test('普通删除写盘前保留原库，成功后清理当前动作关联',async()=>{
 let f;f=fixture({persist:async candidate=>{assert.equal(f.state.customs.length,1);assert.equal(f.state.busy,true);assert.equal(candidate.actions.length,0);}});
 const result=await f.api.remove({kind:'custom',id:'a'});assert.deepEqual(result,{name:'动作',resetActionTitle:true,resetPreview:true});assert.equal(f.state.customs.length,0);assert.equal(f.state.customPreview,null);assert.equal(f.state.busy,false);
});
test('取消/失败/默认素材不提交，失败释放忙碌但保留当前预览',async()=>{
 const cancelled=fixture({confirm:async()=>false});assert.equal(await cancelled.api.remove({kind:'pose',id:'p'}),null);assert.equal(cancelled.calls.length,0);
 const failed=fixture({persist:async()=>{throw Error('磁盘失败');}});await assert.rejects(failed.api.remove({kind:'custom',id:'a'}),/磁盘失败/);assert.equal(failed.state.customs.length,1);assert.equal(failed.state.customPreview.id,'a');assert.equal(failed.state.busy,false);
 assert.deepEqual(await failed.api.remove({kind:'pose',id:'builtin:p'}),{readonly:true});
});
test('剪贴板沿用原源身份与目标库，草稿/模型隔离只影响菜单可用性',async()=>{
 const {api,state}=fixture();assert.deepEqual(api.copy({kind:'source',index:0}),{kind:'action',id:'source:0:源'});assert.equal((await api.paste('ai')).kind,'custom');assert.equal(api.menu('pose').pasteDisabled,true);assert.equal(api.menu('custom').pasteDisabled,false);state.poseDraft={};assert.equal(api.menu('custom').pasteDisabled,true);state.poseDraft=null;state.modelKey='other';assert.equal(api.menu('custom').pasteDisabled,true);
});
test('AI删除委托可恢复回收事务，不按普通素材删除或重写数组',async()=>{
 const {api,state,calls}=fixture();state.aiWorkspace={tasks:[{id:'task',entries:[{assetId:'p',state:'active'}]}]};const poses=state.poses;
 assert.deepEqual(await api.remove({kind:'pose',id:'p'}),{trashed:true});assert.equal(state.poses,poses);assert.deepEqual(calls,[{taskId:'task',assetId:'p',confirmed:true}]);
});
