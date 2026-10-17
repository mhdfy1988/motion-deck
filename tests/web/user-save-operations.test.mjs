import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createUserSaveOperations} from '../../web/labs/motion/application/user-save-operations.js';

function fixture(){
 const state={root:{traverse:run=>run({})},busy:false,modelKey:'model',poseDraft:null,poses:[{id:'builtin:stand',name:'站立',pose:[0]},{id:'p',name:'自定义',pose:[1]}],customs:[{id:'a',name:'原动作'}],items:[{kind:'pose',name:'姿势',pose:[1],duration:1}],editingActionId:'a',aiWorkspace:{version:1,activeTaskId:null,tasks:[]}};
 const writes=[],questions=[],drafts=[],busy=[];let answer=true,write=async()=>{},draftFailure=false,captures=0;
 const workbench={inspect:()=>({revision:7}),captureCurrent:()=>{captures++;return [9];},saveDraft:async(args,expected)=>{drafts.push({args,expected});if(draftFailure)throw new Error('草稿写入失败');state.poseDraft=null;return {id:'draft',name:args.name};}};
 const save=createUserSaveOperations({state,workbench,confirm:async(...args)=>{questions.push(args);return answer;},saveEntries:async entries=>{writes.push(entries);await write(entries);},onBusyChange:()=>busy.push(state.busy)});
 return {state,save,writes,questions,drafts,busy,get captures(){return captures;},answer:value=>answer=value,onWrite:fn=>write=fn,failDraft:()=>draftFailure=true};
}

test('姿势先持久化后提交内存，快照独立，覆盖默认姿势名称仍创建自定义条目',async()=>{
 const f=fixture(),before=f.state.poses,pose=[2];
 f.onWrite(()=>{assert.equal(f.state.busy,true);assert.equal(f.state.poses,before);});
 const result=await f.save.savePose('站立',pose);
 assert.equal(result.library,'pose');assert.notEqual(result.id,'builtin:stand');assert.equal(f.state.poses.length,3);assert.deepEqual(f.busy,[true,false]);
 pose[0]=8;assert.deepEqual(f.state.poses.at(-1).pose,[2]);
});

test('同名姿势取消不写，确认保留ID，失败保留素材引用并解除busy',async()=>{
 const f=fixture();f.answer(false);assert.equal(await f.save.savePose('自定义',[3]),null);assert.equal(f.writes.length,0);
 f.answer(true);const before=f.state.poses;f.onWrite(()=>{throw new Error('磁盘失败');});
 await assert.rejects(f.save.savePose('自定义',[3]),/磁盘失败/);assert.equal(f.state.poses,before);assert.equal(f.state.busy,false);
 f.onWrite(async()=>{});const result=await f.save.savePose('自定义',[3]);assert.equal(result.id,'p');assert.equal(f.state.poses.length,2);
});

test('手动来源覆盖确认在取帧前，绑定原模型版本，草稿保存不另开事务',async()=>{
 const f=fixture();f.state.poseDraft={origin:'user',sourcePoseId:'p'};f.answer(false);
 assert.equal(await f.save.preparePose(),null);assert.equal(f.captures,0);
 f.answer(true);const request=await f.save.preparePose();assert.equal(request.overwritePoseId,'p');assert.deepEqual(request.expected,{modelKey:'model',revision:7});
 const result=await f.save.savePose(request.name,request.pose,request);assert.equal(result.draft,true);assert.equal(result.overwrite,true);
 assert.equal(f.writes.length,0);assert.deepEqual(f.drafts[0].expected,request.expected);assert.equal(f.drafts[0].args.assistant,false);
});

test('草稿保存失败不清草稿，助手草稿仍按原assistant参数委托',async()=>{
 const f=fixture(),draft={origin:'assistant'};f.state.poseDraft=draft;f.failDraft();
 await assert.rejects(f.save.savePose('试摆',[1]),/草稿写入失败/);assert.equal(f.state.poseDraft,draft);assert.equal(f.writes.length,0);assert.equal(f.drafts[0].args.assistant,true);
});

test('覆盖AI姿势保留归属并保护，工作区与姿势同一笔写入',async()=>{
 const f=fixture();f.state.aiWorkspace.tasks=[{id:'task',entries:[{assetId:'p',state:'active',protected:false}]}];
 const before=f.state.aiWorkspace,result=await f.save.savePose('自定义',[4]);
 assert.equal(result.library,'ai');assert.equal(result.id,'p');assert.notEqual(f.state.aiWorkspace,before);
 assert.equal(f.writes[0].aiWorkspace.tasks[0].entries[0].protected,true);assert.equal(before.tasks[0].entries[0].protected,false);
});

test('动作同名当前项直接保留ID，另存生成新ID，其他同名项取消不覆盖',async()=>{
 const f=fixture();const result=await f.save.saveAction('原动作');assert.equal(result.id,'a');assert.equal(f.questions.length,0);
 const copy=await f.save.saveAction('另存');assert.notEqual(copy.id,'a');assert.equal(f.state.customs.length,2);
 f.answer(false);assert.equal(await f.save.saveAction('原动作'),null);assert.equal(f.writes.length,2);
 f.answer(true);assert.equal((await f.save.saveAction('原动作')).id,'a');
});

test('动作编码或持久化失败不发布素材/编辑ID，忙碌及空编排不保存',async()=>{
 const f=fixture(),actions=f.state.customs;f.onWrite(()=>{throw new Error('写入失败');});
 await assert.rejects(f.save.saveAction('另存'),/写入失败/);assert.equal(f.state.customs,actions);assert.equal(f.state.editingActionId,'a');assert.equal(f.state.busy,false);
 f.state.items=[{kind:'action',clip:{}}];await assert.rejects(f.save.saveAction('编码失败'));assert.equal(f.state.busy,false);assert.equal(f.state.customs,actions);
 f.state.items=[];assert.equal(await f.save.saveAction('空'),null);f.state.busy=true;assert.equal(await f.save.preparePose(),null);assert.equal(await f.save.savePose('忙碌',[1]),null);
});
