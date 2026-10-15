import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSessionState} from '../../web/labs/motion/application/session-state.js';
import {createWorkbenchOperations} from '../../web/labs/motion/application/workbench-operations.js';
import {createTimelineHistory} from '../../web/labs/motion/core/timeline-history.js';
import {PoseSampler,capturePose,compileSequence,sampleSequence} from '../../web/labs/motion/core/sequence-core.js';
import {decodeAction} from '../../web/labs/motion/core/action-codec.js';
import {bakeExportAction} from '../../web/labs/motion/platform/motion-export.js';

function setup({failSave=false,failRefresh=false}={}){
 const state=createSessionState(null),root=new THREE.Group(),axis=new THREE.Group(),bone=new THREE.Bone(),child=new THREE.Bone();bone.name='root';child.name='head';child.position.y=1;root.add(axis);axis.rotation.x=-Math.PI/2;axis.add(bone);bone.add(child);state.root=root;state.modelKey='a'.repeat(64);state.bones=[bone,child];state.sampler=new PoseSampler(root);state.clips=[new THREE.AnimationClip('idle',1,[])];state.poses=[{id:'p',name:'站立',pose:capturePose(root)}];
 const w=createWorkbenchOperations(state),refresh=()=>{state.sequence=compileSequence(state.items,state.sampler);},history=createTimelineHistory(()=>({items:state.items.map(i=>({...i}))}),s=>{state.items=s.items.map(i=>({...i}));refresh();},()=>{});
 const saved=[];w.configure({savePose:async poses=>saved.push(poses),timeline:{history,refresh:()=>{refresh();if(failRefresh){w.sync();throw new Error('render failed');}},save:async actions=>{if(failSave)throw new Error('disk failed');saved.push(actions);},saved:()=>{}}});
 return {state,w,root,bone,history,saved,expected:()=>({modelKey:state.modelKey,revision:w.inspect().revision})};
}
test('连续姿势命令允许显式零停留，拒绝旧模式零时长；保存和60Hz烘焙保持连续运动',async()=>{
 const {state,w,root,bone,expected}=setup();
 for(const [id,height]of [['mid',.3],['high',.7],['land',0]]){bone.position.z=height;state.poses.push({id,name:id,pose:capturePose(root)});}bone.position.z=0;
 const first=w.timeline.append({assetId:'p',duration:.2,interpolation:'continuous'},expected());
 assert.throws(()=>w.timeline.append({assetId:'mid',duration:0,transition:.2},expected()),{code:'INVALID_ARGUMENT'});
 const mid=w.timeline.append({assetId:'mid',duration:0,transition:.3,interpolation:'continuous'},expected());
 w.timeline.append({assetId:'high',duration:0,transition:.25,interpolation:'continuous'},expected());
 w.timeline.append({assetId:'land',duration:.2,transition:.55,interpolation:'continuous'},expected());
 w.timeline.resize({id:mid.id,duration:.1},expected());w.timeline.history('undo',expected());assert.equal(state.items[1].duration,0);assert.equal(state.items[0].id,first.id);
 await w.timeline.save({name:'连续跳跃',confirmed:true},expected());
 const restored=decodeAction(state.customs.at(-1),root),clip=bakeExportAction(root,state.sampler,restored,'连续跳跃'),mixer=new THREE.AnimationMixer(root),action=mixer.clipAction(clip).setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
 const seq=compileSequence(restored,state.sampler);for(const time of [.49,.5,.51,.74,.75,.76,1.2]){mixer.setTime(time);const expectedPose=sampleSequence(seq,time,state.sampler).pose;assert.ok(Math.abs(bone.position.z-expectedPose[2].p[2])<.002,JSON.stringify({time,actual:bone.position.z,expected:expectedPose[2].p[2]}));}
 mixer.stopAllAction();state.sampler.dispose();
});
test('A4 姿势库进入草稿，整体世界位置转换到根骨、撤销与保存，容器和子骨局部值不变',async()=>{
 const {state,w,root,bone,expected}=setup(),before=capturePose(root);w.fromLibrary({poseId:'p',...expected()});const transform=w.modelInspect().rootTransform;
 w.setRootTransform({position:[2,1,3],quaternion:transform.quaternion},expected());assert.ok(bone.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(2,1,3))<1e-6);assert.deepEqual(root.position.toArray(),[0,0,0]);assert.deepEqual(capturePose(root).at(-1),before.at(-1));
 const revision=w.inspect().revision;assert.throws(()=>w.setRootTransform({position:[0,Infinity,0],quaternion:[0,0,0,1]},expected()),{code:'INVALID_ARGUMENT'});assert.equal(w.inspect().revision,revision);
 w.draftHistory('undo',expected());assert.deepEqual(capturePose(root),before);w.draftHistory('redo',expected());await w.saveDraft({name:'腾空',confirmed:true},expected());assert.ok(Math.abs(state.poses.at(-1).pose[2].p[2]-1)<1e-6);
 w.fromLibrary({poseId:'p',...expected()});assert.throws(()=>w.fromLibrary({poseId:'p',...expected()}),{code:'BUSY'});w.discardDraft(expected());
});
test('A4 编排刷新失败回滚状态和历史，拖动中拒绝命令，保存失败不清编排',async()=>{
 const failed=setup({failRefresh:true}),rev=failed.expected().revision,before=capturePose(failed.root);assert.throws(()=>failed.w.timeline.append({assetId:'p',duration:1},failed.expected()),/render failed/);assert.equal(failed.state.items.length,0);assert.equal(failed.history.canUndo,false);assert.equal(failed.expected().revision,rev);assert.deepEqual(capturePose(failed.root),before);
 const value=setup({failSave:true});value.history.begin();assert.throws(()=>value.w.timeline.append({assetId:'p',duration:1},value.expected()),{code:'BUSY'});value.history.end();value.w.timeline.append({assetId:'p',duration:1},value.expected());await assert.rejects(value.w.timeline.save({name:'动作',confirmed:true},value.expected()),/disk failed/);assert.equal(value.state.busy,false);assert.equal(value.state.items.length,1);assert.equal(value.state.customs.length,0);
});
test('A4 非唯一根骨、非均匀父级缩放拒绝，非法修改不写历史',()=>{
 const {state,w,root,expected}=setup();w.fromLibrary({poseId:'p',...expected()});root.children[0].scale.set(1,2,1);assert.throws(()=>w.setRootTransform({position:[0,1,0],quaternion:[0,0,0,1]},expected()),{code:'UNSUPPORTED_RIG'});assert.equal(state.poseDraft.undo.length,0);const other=new THREE.Bone();root.add(other);state.bones.push(other);assert.equal(w.modelInspect().rootTransform,null);assert.throws(()=>w.setRootTransform({position:[0,1,0],quaternion:[0,0,0,1]},expected()),{code:'UNSUPPORTED_RIG'});
});
test('A4 编排复用同一历史，添加排序时长过渡删除撤销及裁剪验证',()=>{
 const {state,w,expected,history}=setup();const a=w.timeline.append({assetId:'p',duration:.2},expected()).id,b=w.timeline.append({assetId:'p',duration:.3,transition:.4},expected()).id;assert.ok(Math.abs(w.timeline.inspect().duration-.9)<1e-6);assert.ok(history.canUndo);
 w.timeline.resize({id:a,duration:.5},expected());w.timeline.transition({id:b,duration:.2},expected());w.timeline.move({id:b,targetId:a},expected());assert.equal(state.items[0].id,b);assert.equal(state.items[0].transition,0);
 w.timeline.remove({ids:[a]},expected());w.timeline.history('undo',expected());assert.equal(state.items.length,2);w.timeline.history('redo',expected());assert.equal(state.items.length,1);
 const c=w.timeline.append({assetId:w.libraryList().entries[0].id,duration:1},expected()).id;w.timeline.trim({id:c,in:.1,out:.8,duration:.4},expected());assert.equal(state.items.at(-1).in,.1);
 const before=state.items.map(i=>({...i})),revision=w.inspect().revision;assert.throws(()=>w.timeline.trim({id:c,in:.9,out:.2,duration:1},expected()),/范围/);assert.deepEqual(state.items,before);assert.equal(w.inspect().revision,revision);assert.throws(()=>w.timeline.append({assetId:'unknown'},expected()),{code:'INVALID_ARGUMENT'});
});
test('A4 原地/带位移高度关键姿势过渡，保存编解码与根骨导出轨道保持',async()=>{
 for(const distance of [0,2]){
  const {state,w,root,expected}=setup(),q=w.modelInspect().rootTransform.quaternion;
  w.fromLibrary({poseId:'p',...expected()});w.setRootTransform({position:[distance/2,1,0],quaternion:q},expected());const high=await w.saveDraft({name:'最高点',confirmed:true},expected());
  w.fromLibrary({poseId:'p',...expected()});w.setRootTransform({position:[distance,0,0],quaternion:q},expected());const land=await w.saveDraft({name:'落地',confirmed:true},expected());
  w.timeline.append({assetId:'p',duration:.05},expected());w.timeline.append({assetId:high.id,duration:.05,transition:.4},expected());w.timeline.append({assetId:land.id,duration:.1,transition:.4},expected());
  w.preview({time:.25,playing:false},expected());const top=w.modelInspect().rootTransform;assert.ok(Math.abs(top.position[1]-.5)<1e-6);assert.ok(Math.abs(top.position[0]-distance/4)<1e-6);
  const saved=await w.timeline.save({name:'跳跃',confirmed:true},expected()),decoded=decodeAction(state.customs.find(a=>a.id===saved.id),root);const seq=compileSequence(decoded,state.sampler);assert.ok(Math.abs(sampleSequence(seq,.9,state.sampler).pose[2].p[0]-distance)<1e-6);
  const clip=bakeExportAction(root,state.sampler,decoded,'跳跃');const track=clip.tracks.find(t=>t.name===state.bones[0].uuid+'.position');assert.ok(track);assert.ok(Math.abs(Math.max(...Array.from(track.values).filter((_,i)=>i%3===2))-1)<1e-6);
  await assert.rejects(w.timeline.save({name:'跳跃',confirmed:true},expected()),{code:'DUPLICATE_NAME'});
 }
});
