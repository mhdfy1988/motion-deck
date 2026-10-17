import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSessionState} from '../../web/labs/motion/application/session-state.js';
import {createWorkbenchOperations} from '../../web/labs/motion/application/workbench-operations.js';
import {PoseSampler,capturePose} from '../../web/labs/motion/core/sequence-core.js';
import {beginWholeRotation,applyWholeRotation} from '../../web/labs/motion/pose/whole-rotation.js';

function fixture(){
 const state=createSessionState(null),root=new THREE.Group(),a=new THREE.Bone(),b=new THREE.Bone();a.name=b.name='joint';root.add(a);a.add(b);
 state.root=root;state.modelKey='test-model';state.bones=[a,b];state.sampler=new PoseSampler(root);
 state.clips=[new THREE.AnimationClip('move',1,[new THREE.VectorKeyframeTrack(`${a.uuid}.position`,[0,1],[0,0,0,1,0,0])])];
 return {state,a,b,workbench:createWorkbenchOperations(state)};
}

test('围绕选择中心整体旋转补偿根位置，一步历史且父级旋转缩放不影响中心',()=>{
 const {state,a,b,workbench:w}=fixture();state.root.rotation.set(.2,.5,.1);state.root.scale.setScalar(1.4);state.root.position.set(2,1,-3);a.rotation.set(.1,.2,.3);b.position.y=1;b.rotation.x=.2;w.beginUserDraft();const before=capturePose(state.root),pivot=b.getWorldPosition(new THREE.Vector3()),anchor=new THREE.Object3D();anchor.position.copy(pivot);
 const gesture=beginWholeRotation(w.userMoveRoot(),anchor);w.beginUserPoseGesture([a],{rootAdjustment:true});anchor.rotateY(.6);applyWholeRotation(gesture);assert.ok(b.getWorldPosition(new THREE.Vector3()).distanceTo(pivot)<1e-8);w.finishUserPoseGesture();const after=capturePose(state.root);assert.equal(state.poseDraft.undo.length,1);assert.ok(b.getWorldPosition(new THREE.Vector3()).distanceTo(pivot)<1e-8);assert.notDeepEqual(after,before);assert.deepEqual(b.quaternion.toArray(),new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,0,0)).toArray());
 w.draftHistory('undo');assert.deepEqual(capturePose(state.root),before);w.draftHistory('redo');assert.deepEqual(capturePose(state.root),after);
 for(const invalid of ['child','scale','range']){w.beginUserPoseGesture([a],{rootAdjustment:true});if(invalid==='child')b.rotation.y=.3;else if(invalid==='scale')a.scale.x=2;else a.position.y=1000;assert.throws(()=>w.finishUserPoseGesture(),{code:'INVALID_ARGUMENT'});assert.deepEqual(capturePose(state.root),after);assert.equal(state.busy,false);}
 w.beginUserPoseGesture([a],{rootAdjustment:true});a.rotation.z=.3;a.position.x+=.5;w.finishUserPoseGesture(true);assert.deepEqual(capturePose(state.root),after);assert.throws(()=>w.beginUserPoseGesture([a],{rootAdjustment:true,rootTranslation:true}),{code:'INVALID_ARGUMENT'});
});

test('整体旋转复用根骨事务，保持其他局部姿态并支持历史、取消和非法修改回滚',()=>{
 const {state,a,b,workbench:w}=fixture();b.position.y=1;b.rotation.x=.2;w.beginUserDraft();const before=capturePose(state.root);
 w.beginUserPoseGesture([w.userMoveRoot()]);a.rotation.y=.4;w.finishUserPoseGesture();const after=capturePose(state.root);assert.equal(state.poseDraft.undo.length,1);assert.deepEqual(b.quaternion.toArray(),new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,0,0)).toArray());assert.deepEqual(state.root.quaternion.toArray(),[0,0,0,1]);
 w.draftHistory('undo');assert.deepEqual(capturePose(state.root),before);w.draftHistory('redo');assert.deepEqual(capturePose(state.root),after);
 w.beginUserPoseGesture([a]);a.rotation.z=.3;w.finishUserPoseGesture(true);assert.deepEqual(capturePose(state.root),after);
 for(const invalid of ['child','position','scale']){w.beginUserPoseGesture([a]);if(invalid==='child')b.rotation.y=.3;else if(invalid==='position')a.position.x=.5;else a.scale.x=2;assert.throws(()=>w.finishUserPoseGesture(),{code:'INVALID_ARGUMENT'});assert.deepEqual(capturePose(state.root),after);assert.equal(state.busy,false);}
});

test('整体移动手势复用唯一根与世界位移，姿态不变、一步历史、取消及非法修改回滚',()=>{
 const {state,a,b,workbench:w}=fixture();state.root.rotation.set(.2,.5,.1);state.root.scale.setScalar(1.4);state.root.position.set(2,1,-3);a.rotation.set(.1,.2,.3);b.position.y=1;w.beginUserDraft();const before=capturePose(state.root),start=a.getWorldPosition(new THREE.Vector3()),child=b.getWorldPosition(new THREE.Vector3()),q=state.bones.map(n=>n.quaternion.toArray()),delta=new THREE.Vector3(.3,.8,-.2);
 assert.equal(w.userMoveRoot(),a);w.beginUserPoseGesture([a],{rootTranslation:true});a.position.copy(a.parent.worldToLocal(start.clone().add(delta)));w.finishUserPoseGesture();const after=capturePose(state.root);assert.equal(state.poseDraft.undo.length,1);assert.ok(b.getWorldPosition(new THREE.Vector3()).distanceTo(child.clone().add(delta))<1e-8);assert.deepEqual(state.bones.map(n=>n.quaternion.toArray()),q);assert.deepEqual(state.root.position.toArray(),[2,1,-3]);
 w.draftHistory('undo');assert.deepEqual(capturePose(state.root),before);w.draftHistory('redo');assert.deepEqual(capturePose(state.root),after);
 w.beginUserPoseGesture([a],{rootTranslation:true});a.position.y+=.5;w.finishUserPoseGesture(true);assert.deepEqual(capturePose(state.root),after);
 for(const bad of ['child','rotation','scale','range']){w.beginUserPoseGesture([a],{rootTranslation:true});if(bad==='child')b.position.y+=1;else if(bad==='rotation')a.rotation.x+=.1;else if(bad==='scale')a.scale.x=2;else a.position.y=1000;assert.throws(()=>w.finishUserPoseGesture(),{code:'INVALID_ARGUMENT'});assert.deepEqual(capturePose(state.root),after);assert.equal(state.busy,false);}
 assert.throws(()=>w.beginUserPoseGesture([b],{rootTranslation:true}),{code:'INVALID_ARGUMENT'});state.root.scale.set(1,2,1);assert.throws(()=>w.userMoveRoot(),{code:'UNSUPPORTED_RIG'});state.root.scale.setScalar(1);state.root.add(new THREE.Bone());state.bones.push(state.root.children.at(-1));assert.throws(()=>w.userMoveRoot(),{code:'UNSUPPORTED_RIG'});
});

test('手动草稿按来源ID覆盖，不新增姿势；失败保留原库和草稿',async()=>{
 const {state,a,workbench:w}=fixture(),original={id:'p',name:'原姿势',pose:capturePose(state.root)},other={...structuredClone(original),id:'q',name:'其他姿势'};state.poses=[original,other];let fail=true,saved;
 w.configure({savePose:async poses=>{if(fail)throw new Error('disk failed');saved=structuredClone(poses);}});w.pose(original);w.beginUserDraft();assert.equal(state.poseDraft.sourcePoseId,'p');
 w.beginUserPoseGesture([a]);a.rotation.z=.3;w.finishUserPoseGesture();const edited=capturePose(state.root),revision=state.revision;
 for(const options of [{overwritePoseId:'q',name:'其他姿势',confirmed:true},{overwritePoseId:'p',name:'原姿势',confirmed:false},{overwritePoseId:'p',name:'原姿势',confirmed:true,assistant:true}])await assert.rejects(w.saveDraft(options),{code:'INVALID_ARGUMENT'});
 await assert.rejects(w.saveDraft({overwritePoseId:'p',name:'原姿势',confirmed:true}),/disk failed/);assert.equal(state.poses[0],original);assert.equal(state.poseDraft.undo.length,1);assert.equal(state.revision,revision);assert.deepEqual(capturePose(state.root),edited);
 fail=false;const result=await w.saveDraft({overwritePoseId:'p',name:'原姿势',confirmed:true});assert.equal(result.id,'p');assert.equal(state.poses.length,2);assert.equal(state.poses[1],other);assert.deepEqual(state.poses[0].pose,edited);assert.deepEqual(saved,state.poses);assert.equal(state.poseDraft,null);assert.equal(state.posePreviewId,'p');
});

test('默认姿势及动作/编排取帧不继承旧姿势覆盖目标',async()=>{
 for(const mode of ['source','custom','sequence','default']){
  const {state,workbench:w}=fixture(),pose={id:'p',name:'自定义',pose:capturePose(state.root)},builtin={...structuredClone(pose),id:'builtin:p',name:'默认'};state.poses=[pose,builtin];w.configure({savePose:async()=>{}});w.pose(mode==='default'?builtin:pose);if(mode!=='default')state.mode=mode;
  w.beginUserDraft();assert.equal(state.poseDraft.sourcePoseId,undefined);await assert.rejects(w.saveDraft({name:'自定义',confirmed:true,overwritePoseId:'p'}),{code:'INVALID_ARGUMENT'});
  const saved=await w.saveDraft({name:'新姿势',confirmed:true});assert.notEqual(saved.id,pose.id);assert.equal(state.poses.length,3);assert.equal(state.poses[0],pose);assert.equal(state.poses[1],builtin);
 }
});

test('手动覆盖AI姿势保留任务和ID并标记人工保留，不新建任务或条目',async()=>{
 const {state,a,workbench:w}=fixture(),entry={id:'ai-p',name:'AI姿势',pose:capturePose(state.root)};state.poses=[entry];state.aiWorkspace={version:1,activeTaskId:'task',tasks:[{id:'task',name:'制作',status:'working',createdAt:1,entries:[{assetId:entry.id,kind:'pose',role:'key',stage:'起手',iteration:2,state:'active',protected:false}]}]};let disk;
 w.configure({savePose:async()=>{throw new Error('不能拆开写AI索引');},saveLibraryEntries:async data=>{disk=structuredClone(data);}});w.pose(entry);w.beginUserDraft();w.beginUserPoseGesture([a]);a.rotation.x=.3;w.finishUserPoseGesture();
 const result=await w.saveDraft({name:entry.name,confirmed:true,overwritePoseId:entry.id});assert.equal(result.id,entry.id);assert.equal(result.taskId,'task');assert.equal(state.poses.length,1);assert.equal(state.aiWorkspace.tasks.length,1);assert.equal(state.aiWorkspace.tasks[0].entries.length,1);assert.deepEqual(state.aiWorkspace.tasks[0].entries[0],{assetId:entry.id,kind:'pose',role:'key',stage:'起手',iteration:2,state:'active',protected:true});assert.deepEqual(disk.aiWorkspace,state.aiWorkspace);assert.deepEqual(disk.poses,state.poses);
});
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

test('手动骨链手势批量提交一步撤销，取消及空手势不产生历史',()=>{
 const {state,a,b,workbench}=fixture();workbench.beginUserDraft();const before=capturePose(state.root),revision=state.revision;
 workbench.beginUserPoseGesture([a,b]);assert.equal(state.busy,true);assert.throws(()=>workbench.setBones([]),{code:'BUSY'});
 a.rotation.z=.35;b.rotation.x=-.4;workbench.finishUserPoseGesture();const after=capturePose(state.root);
 assert.equal(state.busy,false);assert.equal(state.poseDraft.undo.length,1);assert.equal(state.revision,revision+1);
 workbench.draftHistory('undo');assert.deepEqual(capturePose(state.root),before);
 workbench.draftHistory('redo');assert.deepEqual(capturePose(state.root),after);
 const count=state.poseDraft.undo.length;workbench.beginUserPoseGesture([a,b]);a.rotation.y=.8;workbench.finishUserPoseGesture(true);
 assert.deepEqual(capturePose(state.root),after);assert.equal(state.poseDraft.undo.length,count);
 workbench.beginUserPoseGesture([a,b]);workbench.finishUserPoseGesture();assert.equal(state.poseDraft.undo.length,count);
});

test('手动骨链事务拒绝局部位置、缩放及链外旋转并恢复原姿势',()=>{
 for(const bad of ['position','scale','outside','quaternion']){
  const {state,a,b,workbench}=fixture();workbench.beginUserDraft();const before=capturePose(state.root);
  workbench.beginUserPoseGesture([a]);
  if(bad==='position')a.position.x+=1;else if(bad==='scale')a.scale.y=2;else if(bad==='outside')b.rotation.x=.5;else a.quaternion.set(1,1,1,1);
  assert.throws(()=>workbench.finishUserPoseGesture(),{code:'INVALID_ARGUMENT'});
  assert.equal(state.busy,false);assert.equal(state.poseDraft.undo.length,0);assert.deepEqual(capturePose(state.root),before);
 }
});
