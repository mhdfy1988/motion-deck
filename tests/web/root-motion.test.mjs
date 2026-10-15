import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRootMotionFilter} from '../../web/labs/motion/core/root-motion.js';
import {capturePose,applyPose,PoseSampler,compileSequence,sampleSequence} from '../../web/labs/motion/core/sequence-core.js';
import {bakeExportAction} from '../../web/labs/motion/platform/motion-export.js';
import {createSessionState} from '../../web/labs/motion/application/session-state.js';
import {createWorkbenchOperations} from '../../web/labs/motion/application/workbench-operations.js';

function fixture(){const root=new THREE.Group(),axis=new THREE.Group(),bone=new THREE.Bone(),child=new THREE.Bone();root.add(axis);axis.rotation.x=-Math.PI/2;axis.position.set(2,3,4);axis.add(bone);bone.add(child);child.position.y=1;bone.name='root';child.name='head';const base=capturePose(root);bone.position.set(2,-3,4);child.rotation.z=.6;const high=capturePose(root);applyPose(root,base);const sampler=new PoseSampler(root),items=[{id:'a',kind:'pose',pose:base,name:'base',duration:.1,transition:0},{id:'b',kind:'pose',pose:high,name:'high',duration:.1,transition:.8}];return {root,axis,bone,child,base,high,sampler,items};}
for(const horizontal of [true,false])for(const vertical of [true,false])test(`根位移四组合 ${horizontal}/${vertical}：按世界轴过滤，保留基准与子骨，无源修改`,()=>{
 const f=fixture(),{root,bone,base,high}=f,before=structuredClone(high);applyPose(root,base);const start=bone.getWorldPosition(new THREE.Vector3());applyPose(root,high);const end=bone.getWorldPosition(new THREE.Vector3());const filter=createRootMotionFilter(root,base,{horizontal,vertical}),result=filter(high);applyPose(root,result);const actual=bone.getWorldPosition(new THREE.Vector3());assert(actual.distanceTo(new THREE.Vector3(horizontal?end.x:start.x,vertical?end.y:start.y,horizontal?end.z:start.z))<1e-8);assert.deepEqual(high,before);assert.deepEqual(result.at(-1),high.at(-1));assert.deepEqual(result[0],high[0]);f.sampler.dispose();
});
test('父级随姿势变化也按世界轴过滤；不支持多根/奇异父变换时明确拒绝，保留全部不受限',()=>{
 const f=fixture();f.high[1].q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.7).toArray();const filter=createRootMotionFilter(f.root,f.base,{horizontal:false,vertical:false});applyPose(f.root,f.base);const origin=f.bone.getWorldPosition(new THREE.Vector3());applyPose(f.root,filter(f.high));assert(f.bone.getWorldPosition(new THREE.Vector3()).distanceTo(origin)<1e-8);f.root.add(new THREE.Bone());assert.throws(()=>createRootMotionFilter(f.root,f.base,{horizontal:false,vertical:true}),{code:'UNSUPPORTED_RIG'});assert.equal(createRootMotionFilter(f.root,f.base,{horizontal:true,vertical:true})(f.high),f.high);f.sampler.dispose();
});
test('预览/轨迹/导出同策略，草稿取帧和保存仍原始；切回立即恢复，不改动作配方',()=>{
 const f=fixture(),state=createSessionState(null);Object.assign(state,{root:f.root,sampler:f.sampler,bones:[f.bone,f.child],modelKey:'a'.repeat(64),items:f.items,sequence:compileSequence(f.items,f.sampler),clips:[new THREE.AnimationClip('source',1,[])]});
 const w=createWorkbenchOperations(state),expected=()=>({modelKey:state.modelKey,revision:w.inspect().revision}),before=JSON.stringify(state.items);w.sequence(.9);
 w.setRootMotion({horizontal:true,vertical:false},expected());const origin=createRootMotionFilter(f.root,f.base,{horizontal:false,vertical:false})(f.base);applyPose(f.root,origin);const y=f.bone.getWorldPosition(new THREE.Vector3()).y;w.sequence(.9);assert(Math.abs(f.bone.getWorldPosition(new THREE.Vector3()).y-y)<1e-8);
 const raw=w.captureCurrent();assert.deepEqual(raw,f.high);const id=w.rigList().entries[0].id,samples=w.sampleSequenceRange({times:[0,.5,.9],boneIds:[id]},expected());assert(samples.samples.every(s=>Math.abs(s.bones[0].position[1]-y)<1e-8));
 const clip=bakeExportAction(f.root,f.sampler,state.items,'filtered',{bytes:0},state.rootMotion),bakedSampler=new PoseSampler(f.root),pose=bakedSampler.sample(clip,.5);applyPose(f.root,pose);assert(Math.abs(f.bone.getWorldPosition(new THREE.Vector3()).y-y)<1e-5);bakedSampler.dispose();
 w.fromSequence({time:.9,...expected()});assert.deepEqual(state.poseDraft.pose,f.high);assert.throws(()=>w.setRootMotion({horizontal:true,vertical:true},expected()),{code:'BUSY'});w.discardDraft(expected());w.setRootMotion({horizontal:true,vertical:true},expected());w.sequence(.9);applyPose(f.root,f.high);const end=f.bone.getWorldPosition(new THREE.Vector3());w.sequence(.9);assert(f.bone.getWorldPosition(new THREE.Vector3()).distanceTo(end)<1e-8);assert.equal(JSON.stringify(state.items),before);f.sampler.dispose();
});
test('源动作过滤不污染取帧，错误策略/版本拒绝且不改变可见状态',()=>{
 const f=fixture(),state=createSessionState(null);Object.assign(state,{root:f.root,sampler:f.sampler,bones:[f.bone,f.child],modelKey:'a'.repeat(64),clips:[new THREE.AnimationClip('move',1,[new THREE.VectorKeyframeTrack(f.bone.uuid+'.position',[0,1],[0,0,0,2,-3,4])])]});
 const w=createWorkbenchOperations(state),expected=()=>({modelKey:state.modelKey,revision:w.inspect().revision});w.source(0,.5);const original=capturePose(f.root);w.setRootMotion({horizontal:false,vertical:false},expected());const visible=capturePose(f.root),revision=w.inspect().revision;
 assert.throws(()=>w.setRootMotion({horizontal:false},expected()),{code:'INVALID_ARGUMENT'});assert.throws(()=>w.setRootMotion({horizontal:true,vertical:true},{...expected(),revision:revision-1}),{code:'REVISION_CONFLICT'});assert.deepEqual(capturePose(f.root),visible);assert.equal(w.inspect().revision,revision);
 w.fromClip({clipId:w.libraryList().entries[0].id,time:.5,...expected()});assert.deepEqual(state.poseDraft.pose,original);f.sampler.dispose();
});
