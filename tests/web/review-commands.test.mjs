import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group,Bone,AnimationClip,Vector3,PerspectiveCamera,Mesh,BoxGeometry,MeshBasicMaterial} from 'three';
import {createSessionState} from '../../web/labs/motion/application/session-state.js';
import {createWorkbenchOperations} from '../../web/labs/motion/application/workbench-operations.js';
import {createTimelineHistory} from '../../web/labs/motion/core/timeline-history.js';
import {capturePose,compileSequence,PoseSampler,applyPose} from '../../web/labs/motion/core/sequence-core.js';
import {reviewTimes} from '../../web/labs/motion/core/review-plan.js';
import {createControlMedia} from '../../web/labs/motion/platform/control-media.js';
function setup(extra={}){
 const state=createSessionState(null),root=new Group(),bone=new Bone(),child=new Bone();root.add(bone);bone.add(child);child.position.y=1;state.root=root;state.bones=[bone,child];state.modelKey='a'.repeat(64);state.sampler=new PoseSampler(root);state.clips=[new AnimationClip('idle',1,[])];
 state.poses=[{id:'a',name:'低',pose:capturePose(root)}];bone.position.y=2;state.poses.push({id:'b',name:'高',pose:capturePose(root)});bone.position.y=0;
 const w=createWorkbenchOperations(state),refresh=()=>{state.sequence=compileSequence(state.items,state.sampler);},history=createTimelineHistory(()=>({items:state.items.map(i=>({...i}))}),saved=>{state.items=saved.items.map(i=>({...i}));refresh();},()=>{});
 w.configure({savePose:async()=>{},timeline:{history,refresh,save:async()=>{},saved:()=>{}},...extra});const expected=()=>({modelKey:state.modelKey,revision:w.inspect().revision});
 w.timeline.append({assetId:'a',duration:.2,interpolation:'continuous'},expected());w.timeline.append({assetId:'b',duration:.2,transition:1,interpolation:'continuous'},expected());
 return {state,root,bone,child,w,expected};
}
test('编排过渡取帧完整保留位移及子骨，放弃恢复原姿势、播放头，失败不污染草稿',()=>{
 const {w,state,root,bone,expected}=setup();w.preview({time:.25,playing:false},expected());const before=capturePose(root),beforeTime=state.time;
 w.fromSequence({time:.7,...expected()});assert.equal(state.poseDraft.dirty,true);assert.ok(Math.abs(bone.position.y-1)<1e-8);assert.equal(state.time,.7);assert.equal(state.items.length,2);
 assert.throws(()=>w.fromSequence({time:.8,...expected()}),{code:'BUSY'});w.discardDraft(expected());assert.deepEqual(capturePose(root),before);assert.equal(state.time,beforeTime);
 const revision=expected().revision;assert.throws(()=>w.fromSequence({time:2,...expected()}),{code:'INVALID_ARGUMENT'});assert.equal(expected().revision,revision);assert.equal(state.poseDraft,null);
});
test('插入姿势自动拆分过渡且总时长不变，一步撤销重做；边界和停留拒绝',()=>{
 const {w,state,expected}=setup(),before=state.items.map(i=>({...i}));
 const result=w.timeline.insertPoseAt({time:.7,poseId:'a'},expected());assert.equal(state.items.length,3);assert.equal(state.items[1].id,result.id);assert.ok(Math.abs(state.items[1].transition-.5)<1e-8);assert.ok(Math.abs(state.items[2].transition-.5)<1e-8);assert.equal(state.items[1].duration,0);assert.ok(Math.abs(w.timeline.inspect().duration-1.4)<1e-8);
 w.timeline.history('undo',expected());assert.deepEqual(state.items,before);w.timeline.history('redo',expected());assert.equal(state.items.length,3);
 for(const time of [0,.1,.2,.7,1.2,1.3])assert.throws(()=>w.timeline.insertPoseAt({time,poseId:'a'},expected()),{code:'INVALID_ARGUMENT'});
});
test('批量采样绑定版本、保留预览及根状态，按世界坐标返回并拒绝超量',()=>{
 const {w,state,root,expected}=setup();w.preview({time:.4,playing:false},expected());const before=capturePose(root),info=w.inspect(),ids=w.rigList().entries.map(b=>b.id);
 const result=w.sampleSequenceRange({times:[.2,.7,1.2],boneIds:ids},expected());assert.ok(Math.abs(result.samples[1].bones[0].position[1]-1)<1e-8);assert.ok(Math.abs(result.samples[1].bones[1].position[1]-2)<1e-8);assert.deepEqual(capturePose(root),before);assert.deepEqual(w.inspect(),info);
 assert.throws(()=>w.sampleSequenceRange({start:0,end:1.4,step:.001,boneIds:ids},expected()),{code:'INVALID_ARGUMENT'});assert.throws(()=>w.sampleSequenceRange({times:[.4],boneIds:['node:999']},expected()),{code:'INVALID_ARGUMENT'});assert.equal(state.busy,false);
 assert.throws(()=>w.sampleSequenceRange({times:[.4],boneIds:ids},{...expected(),revision:0}),{code:'REVISION_CONFLICT'});
});
test('批量媒体失败也恢复可见姿势及播放状态，执行时拒绝编辑，预算先于适配器执行',async()=>{
 let calls=0,release;const {w,state,root,expected}=setup({captureSequence:async plan=>{calls++;plan.sample(.7);await new Promise(r=>release=r);throw new Error('编码失败');}});
 w.preview({time:.4,playing:true},expected());const before=capturePose(root),info=w.inspect();
 await assert.rejects(w.captureSequence({start:0,end:1.4,step:.01,views:['right']},expected()),{code:'INVALID_ARGUMENT'});assert.equal(calls,0);
 const pending=w.captureSequence({times:[.2,.7],views:['right'],options:{ground:true}},expected());assert.equal(state.busy,true);assert.throws(()=>w.timeline.remove({ids:[state.items[0].id]},expected()),{code:'BUSY'});release();await assert.rejects(pending,/编码失败/);assert.deepEqual(capturePose(root),before);assert.deepEqual(w.inspect(),info);
});
test('截图适配使用同一相机贯穿批次，索引包含准确时间，pose取景才逐帧重建',async()=>{
 const {state,root,bone}=setup(),camera=new PerspectiveCamera(),created=[],files=[];let samples=0;bone.add(new Mesh(new BoxGeometry(1,2,1),new MeshBasicMaterial()));
 const adapter=createControlMedia({state,getCamera:()=>camera,getBridge:()=>({saveControlCapture:async()=>({path:'mock-'+files.length}),saveControlManifest:async manifest=>{files.push(manifest);return {path:'index'};}}),createCapture:options=>{created.push(options);return {photo:async()=>new Blob(['png']),dispose(){}};}});
 const before=capturePose(root);const plan={options:{framing:'motion',width:640,height:480},times:[.2,.7,1.2],views:['right'],modelKey:state.modelKey,revision:0,sample:time=>{samples++;const pose=structuredClone(before);pose[1].p[1]=time;applyPose(root,pose);return pose;}};
 const result=await adapter.captureSequence(plan);assert.equal(created.length,1);assert.equal(result.files.length,3);assert.deepEqual(files[0].frames.map(f=>f.time),plan.times);assert.ok(samples>3);assert.ok(created[0].camera.position.distanceTo(new Vector3())>0);
});
test('范围取样含起终点且无重复，混合口径、越界和无限值拒绝',()=>{
 assert.deepEqual(reviewTimes({start:0,end:1,step:.3},1),[0,.3,.6,.8999999999999999,1]);
 for(const args of [{times:[.1,.1]},{times:[0],start:0},{start:0,end:1,step:0},{times:[Infinity]},{start:0,end:2,step:.2}])assert.throws(()=>reviewTimes(args,1),{code:'INVALID_ARGUMENT'});
});
test('视频沿共享采样恢复姿势，非法时长/确认先拒绝；失败不留下busy',async()=>{
 let called=0;const {w,root,state,expected}=setup({exportVideo:async plan=>{called++;plan.sample(.7);throw new Error('视频写入失败');}});w.preview({time:.3,playing:false},expected());const before=capturePose(root),info=w.inspect();
 await assert.rejects(w.exportVideo({name:'测试',start:0,end:1,confirmed:false},expected()),{code:'INVALID_ARGUMENT'});assert.equal(called,0);
 await assert.rejects(w.exportVideo({name:'测试',start:0,end:1.2,confirmed:true},expected()),/视频写入失败/);assert.equal(called,1);assert.deepEqual(capturePose(root),before);assert.deepEqual(w.inspect(),info);assert.equal(state.busy,false);
});
