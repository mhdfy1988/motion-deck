import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSessionState} from '../../web/labs/motion/application/session-state.js';
import {createWorkbenchOperations} from '../../web/labs/motion/application/workbench-operations.js';
import {PoseSampler,capturePose} from '../../web/labs/motion/core/sequence-core.js';

function fixture(){
 const state=createSessionState(null),root=new THREE.Group(),a=new THREE.Bone(),b=new THREE.Bone();a.name=b.name='joint';root.add(a);a.add(b);
 state.root=root;state.modelKey='test-model';state.bones=[a,b];state.sampler=new PoseSampler(root);
 state.clips=[new THREE.AnimationClip('move',1,[new THREE.VectorKeyframeTrack(`${a.uuid}.position`,[0,1],[0,0,0,1,0,0])])];
 return {state,a,b,workbench:createWorkbenchOperations(state)};
}
test('只读查询绑定同一模型，重名骨骼保留独立节点ID，返回数据不暴露引用',()=>{
 const {state,workbench}=fixture(),info=workbench.inspect(),rig=workbench.rigList(),library=workbench.libraryList();
 assert.equal(info.status,'ready');assert.notEqual(rig.entries[0].id,rig.entries[1].id);assert.equal(rig.entries[1].parentId,rig.entries[0].id);
 rig.entries[0].position[0]=77;library.entries[0].name='changed';assert.equal(state.bones[0].position.x,0);assert.equal(state.clips[0].name,'move');
 assert.throws(()=>workbench.rigList({limit:101}),{code:'INVALID_ARGUMENT'});
 state.busy=true;assert.equal(workbench.inspect().status,'busy');assert.throws(()=>workbench.libraryList(),{code:'BUSY'});
});
test('取帧草稿绑定模型/版本，暂停播放且不会被推进，放弃完整恢复姿势',()=>{
 const {state,a,workbench}=fixture(),before=capturePose(state.root),clipId=workbench.libraryList().entries[0].id,revision=workbench.inspect().revision;
 state.playing=true;workbench.fromClip({clipId,time:.5,modelKey:state.modelKey,revision});assert.equal(a.position.x,.5);assert.equal(state.mode,'pose');assert.equal(state.playing,false);
 state.playing=true;assert.equal(workbench.canAdvance(),false);assert.throws(()=>workbench.source(0,.8),{code:'BUSY'});
 assert.equal(workbench.discardDraft(),true);assert.deepEqual(capturePose(state.root),before);assert.equal(state.mode,'source');assert.equal(state.playing,false);assert.equal(state.poseDraft,null);
});
test('界面编排变化使版本过期，播放推进不增加编辑版本',()=>{
 const {state,workbench}=fixture();workbench.source(0,0,true);const revision=workbench.inspect().revision;
 workbench.source(0,.3,true,{transient:true});assert.equal(workbench.inspect().revision,revision);
 state.items.push({id:'a',kind:'pose',duration:1});const clipId=workbench.libraryList().entries[0].id;
 assert.throws(()=>workbench.fromClip({clipId,time:.2,modelKey:state.modelKey,revision}),{code:'REVISION_CONFLICT'});
 const next=workbench.inspect().revision;state.poses=[{id:'p',name:'pose',pose:capturePose(state.root)}];workbench.sync();assert.ok(state.revision>next);
});
test('采样失败恢复整个可见姿势/上下文，不发布新版本',()=>{
 const {state,a,workbench}=fixture(),before=capturePose(state.root),revision=workbench.inspect().revision;
 state.sampler.sample=()=>{a.position.set(9,8,7);throw new Error('sample failed');};
 assert.throws(()=>workbench.source(0,.2),/sample failed/);assert.deepEqual(capturePose(state.root),before);assert.equal(state.sourceTime,0);assert.equal(state.revision,revision);
});
test('模型身份/取帧范围无效与关闭状态显式拒绝',()=>{
 const {state,workbench}=fixture(),clipId=workbench.libraryList().entries[0].id;
 assert.throws(()=>workbench.fromClip({clipId,time:.2,modelKey:'other',revision:0}),{code:'MODEL_MISMATCH'});
 assert.throws(()=>workbench.fromClip({clipId,time:2,modelKey:state.modelKey,revision:0}),{code:'INVALID_ARGUMENT'});
 workbench.close();assert.equal(workbench.inspect().status,'closed');assert.throws(()=>workbench.captureCurrent(),{code:'SESSION_CLOSED'});
});
test('保存对话框取样仍维持预览上下文，快照与可见模型独立',()=>{
 const {state,a,workbench}=fixture();workbench.source(0,.4,true);const pose=workbench.captureCurrent();
 assert.equal(state.mode,'source');assert.equal(state.playing,false);a.position.x=.8;assert.equal(pose[1].p[0],.4);
});
