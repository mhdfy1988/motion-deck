import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3,Group} from 'three';
import {loadRig} from '../helpers/load-rig.mjs';
import {calibrateJointLimits,jointLimits,projectJoint,enforceBones,constraintSummary,constrainBone} from '../../web/labs/motion/pose/joint-limits.js';
import {capturePose,applyPose,PoseSampler} from '../../web/labs/motion/core/sequence-core.js';
import {findEditableLimbChains,LimbIK} from '../../web/labs/motion/pose/pose-ik.js';
import {findBodyChain,TorsoDrag,PelvisDrag} from '../../web/labs/motion/pose/body-chain-controls.js';
import {createSessionState} from '../../web/labs/motion/application/session-state.js';
import {createWorkbenchOperations} from '../../web/labs/motion/application/workbench-operations.js';
import {answerControlQuery} from '../../web/labs/motion/application/control-queries.js';

const files=['fixtures/candidates/m2m-human-base-animations.glb','fixtures/quaternius/AnimationLibrary_Godot_Standard.gltf'];
const local=(c,x,y=0,t=0)=>{const a=Math.hypot(x,y),s=a?new Quaternion().setFromAxisAngle(new Vector3(x/a,y/a,0),a):new Quaternion();s.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),t));return c.reference.clone().multiply(c.frame).multiply(s).multiply(c.frame.clone().invert()).normalize();};
const valid=(rig,bones)=>{for(const b of bones){const c=rig.joints.get(b);if(c)assert.equal(projectJoint(c,b.quaternion).clamped,false,b.name);}};
function referencePose(root,rig){for(const [bone,c] of rig.joints)bone.quaternion.copy(c.reference);root.updateMatrixWorld(true);}
function workbench(root){const state=createSessionState(null);state.root=root;state.modelKey='a'.repeat(64);state.bones=[];root.traverse(n=>{if(n.isBone)state.bones.push(n);});state.sampler=new PoseSampler(root);return {state,w:createWorkbenchOperations(state)};}

for(const file of files){
 test(`${file} A1绑定标定稳定、左右弯曲方向与扭转轴独立`,async()=>{
  const root=await loadRig(file),before=capturePose(root),rig=calibrateJointLimits(root);assert.equal(rig.supported,true,rig.reason);assert.equal(rig.joints.size,50);assert.deepEqual(rig.twistBones,[]);assert.deepEqual(capturePose(root),before);
  const again=()=>calibrateJointLimits(root);root.rotation.set(.5,.8,-.4);root.scale.setScalar(1.7);root.position.set(3,4,-1);for(const [b] of rig.joints)b.rotation.set(.1,.5,-.7);
  for(const [b,c] of again().joints){const original=rig.joints.get(b);assert.ok(c.reference.angleTo(original.reference)<1e-6);assert.ok(c.frame.angleTo(original.frame)<1e-6);assert.ok(Math.abs(c.axis.dot(c.twistAxis))<1e-6);}
  // 回到绑定姿势后用骨轴的正向小幅旋转验证：肘朝前、膝朝后，不凭四元数正负判断。
  applyPose(root,before);referencePose(root,rig);
  for(const chain of findEditableLimbChains(root)){
   const c=rig.joints.get(chain.middle),start=chain.end.getWorldPosition(new Vector3());chain.middle.quaternion.copy(local(c,.15));root.updateMatrixWorld(true);
   const direction=chain.end.getWorldPosition(new Vector3()).sub(start),forward=new Vector3(...rig.axes.forward);assert.ok(direction.dot(forward)*(chain.name.includes('脚')?-1:1)>0,chain.name);chain.middle.quaternion.copy(c.reference);root.updateMatrixWorld(true);
  }
  root.scale.set(1,2,1);assert.equal(calibrateJointLimits(root).supported,false);
 });
 test(`${file} A2/A3铰链、摆动椭圆、前臂扭转及四元数边界`,async()=>{
  const root=await loadRig(file),rig=jointLimits(root);
  for(const c of rig.joints.values()){
   for(const [x,y,t] of [[-1,-1,-3],[3,2,3],[Math.PI,0,0],[0,Math.PI,0],[0,0,-Math.PI],[0,0,Math.PI],[.2,.1,.3]]){
    const q=local(c,x,y,t),result=projectJoint(c,q),neg=new Quaternion(...q.toArray().map(v=>-v));assert.ok(projectJoint(c,neg).quaternion.angleTo(result.quaternion)<1e-6);assert.ok(projectJoint(c,result.quaternion).quaternion.angleTo(result.quaternion)<1e-6,c.name);assert.equal(projectJoint(c,result.quaternion).clamped,false,c.name);
   }
   if(c.kind==='hinge'){assert.ok(projectJoint(c,local(c,-.4)).angles[0]>=0);assert.equal(projectJoint(c,local(c,.4,.6)).angles[1],0);}
   if(c.type==='elbow'){const q=local(c,.5,0,.8);assert.equal(projectJoint(c,q).clamped,false,'前臂扭转不是肘侧折');}
  }
  const c=[...rig.joints.values()][0];assert.throws(()=>projectJoint(c,new Quaternion(NaN,0,0,1)),{code:'INVALID_ARGUMENT'});
 });
 test(`${file} A2同层实时/命令、历史取消、自由模式与旧素材不被重写`,async()=>{
  const root=await loadRig(file),rig=jointLimits(root),{state,w}=workbench(root),original=capturePose(root);w.beginUserDraft();assert.deepEqual(capturePose(root),original);assert.equal(w.inspect().jointConstraints.supported,true);
  const [bone,c]=[...rig.joints].find(([,c])=>c.type==='elbow'),id=w.rigList({limit:100}).entries.find(e=>e.name===bone.name).id,q=local(c,-1,.5,2),expected=projectJoint(c,q).quaternion;
  w.beginUserPoseGesture([bone]);bone.quaternion.copy(q);assert.equal(w.constrainUserGesture().length,1);assert.ok(bone.quaternion.angleTo(expected)<1e-6);assert.throws(()=>w.setConstraintMode('free'),{code:'BUSY'});w.finishUserPoseGesture();assert.equal(state.poseDraft.undo.length,1);const after=capturePose(root);
  w.draftHistory('undo');assert.deepEqual(capturePose(root),original);w.draftHistory('redo');assert.deepEqual(capturePose(root),after);
  w.beginUserPoseGesture([bone]);bone.quaternion.copy(q);w.constrainUserGesture();w.finishUserPoseGesture(true);assert.deepEqual(capturePose(root),after);
  const query={requestId:'limits',sessionId:'test',modelKey:state.modelKey,expectedRevision:w.inspect().revision,operation:'pose.setBones',args:{changes:[{id,quaternion:q.toArray()}],constraintMode:'natural'}};
  const reply=await answerControlQuery(w,query);assert.equal(reply.ok,true,JSON.stringify(reply));assert.equal(reply.result.constraints.applied[0].clamped,true);assert.ok(bone.quaternion.angleTo(expected)<1e-6);
  const free=await answerControlQuery(w,{...query,expectedRevision:w.inspect().revision,args:{...query.args,constraintMode:'free'}});assert.equal(free.ok,true);assert.deepEqual(bone.quaternion.toArray(),q.toArray());assert.equal(w.inspect().jointConstraints.mode,'natural','一次命令覆盖不暗改用户模式');
  const saved=structuredClone(state.poseDraft.pose);w.setConstraintMode('free');w.setConstraintMode('natural');assert.deepEqual(state.poseDraft.pose,saved);assert.deepEqual(capturePose(root),saved);assert.ok(w.inspect().jointConstraints.violations.some(v=>v.joint===bone.name));
  const previous=state.poseDraft.undo.length;assert.throws(()=>w.setBones([{id,quaternion:q.toArray()},{id,quaternion:q.toArray()}]),{code:'INVALID_ARGUMENT'});assert.deepEqual(capturePose(root),saved);assert.equal(state.poseDraft.undo.length,previous);
  assert.throws(()=>w.setBones([{id,quaternion:c.reference.toArray(),position:[1,2,3]}]),{code:'INVALID_ARGUMENT'});assert.deepEqual(capturePose(root),saved);assert.equal(state.poseDraft.undo.length,previous);
  assert.throws(()=>w.setBones([{id,quaternion:c.reference.toArray()}],undefined,{constraintMode:'invalid'}),{code:'INVALID_ARGUMENT'});assert.deepEqual(capturePose(root),saved);
  const body=findBodyChain(root),pelvisQ=body.pelvis.quaternion.toArray();
  w.beginUserPoseGesture([body.pelvis,...body.legs.flatMap(l=>[l.upper,l.middle,l.end])],{positionBones:[body.pelvis]});
  assert.deepEqual(w.constrainUserGesture(),[],'未旋转的旧超限关节不能被顺带修正');w.finishUserPoseGesture();assert.deepEqual(capturePose(root),saved);assert.equal(state.poseDraft.undo.length,previous);
  w.beginUserPoseGesture([body.pelvis,...body.legs.flatMap(l=>[l.upper,l.middle,l.end])],{positionBones:[body.pelvis]});body.pelvis.position.y-=.01;w.constrainUserGesture();w.finishUserPoseGesture();assert.deepEqual(body.pelvis.quaternion.toArray(),pelvisQ,'只移动骨盆不能改其旧旋转');w.draftHistory('undo');assert.deepEqual(capturePose(root),saved);
 });
 test(`${file} A4拖动保留固定肘膝和腕踝，受限求解报告残差`,async()=>{
  const root=await loadRig(file),rig=jointLimits(root);root.rotation.set(.2,.4,-.1);root.scale.setScalar(1.4);referencePose(root,rig);const original=capturePose(root);
  for(const chain of findEditableLimbChains(root)){
   applyPose(root,original);const ik=new LimbIK(chain,{getMode:()=> 'natural'});ik.begin();const fixed=chain.middle.getWorldPosition(new Vector3()),q=chain.end.quaternion.toArray(),ps=capturePose(root).map(p=>[p.p,p.s]);
   ik.moveEnd(fixed.clone().add(new Vector3(10,10,-10)));assert.ok(chain.middle.getWorldPosition(new Vector3()).distanceTo(fixed)<1e-8);assert.deepEqual(chain.end.quaternion.toArray(),q);valid(rig,[chain.middle]);assert.ok(ik.residual>.1);assert.deepEqual(capturePose(root).map(p=>[p.p,p.s]),ps);
   ik.begin();ik.move(new Vector3(30,40,-30));valid(rig,[chain.upper,chain.middle,chain.end]);assert.ok(ik.residual>1);assert.deepEqual(capturePose(root).map(p=>[p.p,p.s]),ps);ik.dispose();
  }
  applyPose(root,original);const body=findBodyChain(root),torso=new TorsoDrag(body,{getMode:()=> 'natural'});torso.begin();torso.move(new Vector3(1,2,-3));valid(rig,torso.bones);assert.ok(torso.residual>0);torso.dispose();
  applyPose(root,original);const pelvis=new PelvisDrag(body,{getMode:()=> 'natural'}),feet=body.legs.map(l=>l.end.getWorldPosition(new Vector3()));pelvis.begin();pelvis.move(new Vector3(10,0,0));assert.ok(pelvis.residual>1);body.legs.forEach((l,i)=>assert.ok(l.end.getWorldPosition(new Vector3()).distanceTo(feet[i])<1e-4));pelvis.dispose();
 });
 test(`${file} A4可达目标确实能动，保脚下蹲不被限位锁死`,async()=>{
  const root=await loadRig(file),rig=jointLimits(root);referencePose(root,rig);const before=capturePose(root);
  for(const chain of findEditableLimbChains(root)){
   applyPose(root,before);const c=rig.joints.get(chain.middle),start=chain.end.getWorldPosition(new Vector3()),fixed=chain.middle.getWorldPosition(new Vector3());chain.middle.quaternion.copy(local(c,.5));root.updateMatrixWorld(true);const target=chain.end.getWorldPosition(new Vector3());chain.middle.quaternion.copy(c.reference);root.updateMatrixWorld(true);
   const ik=new LimbIK(chain,{getMode:()=> 'natural'});ik.begin();const applied=ik.moveEnd(target);assert.ok(applied.distanceTo(target)<1e-6,chain.name);assert.ok(applied.distanceTo(start)>.05);assert.ok(chain.middle.getWorldPosition(new Vector3()).distanceTo(fixed)<1e-8);ik.dispose();
  }
  applyPose(root,before);const body=findBodyChain(root),start=body.pelvis.getWorldPosition(new Vector3()),feet=body.legs.map(c=>c.end.getWorldPosition(new Vector3())),pelvis=new PelvisDrag(body,{getMode:()=> 'natural'});pelvis.begin();pelvis.move(new Vector3(0,-.1,0));assert.ok(body.pelvis.getWorldPosition(new Vector3()).distanceTo(start)>.09);assert.equal(pelvis.residual,0);valid(rig,pelvis.bones);body.legs.forEach((c,i)=>assert.ok(c.end.getWorldPosition(new Vector3()).distanceTo(feet[i])<1e-5));pelvis.dispose();
 });
}
test('未标定模型显式报告，不猜关节轴；自然模式拒绝，自由模式保持原值',()=>{
 const root=new Group(),rig=jointLimits(root);assert.equal(rig.supported,false);assert.match(constraintSummary(root).reason,/未标定/);assert.throws(()=>constrainBone(root,root,new Quaternion()),{code:'UNSUPPORTED_RIG'});assert.deepEqual(constrainBone(root,root,new Quaternion(),'free').quaternion.toArray(),[0,0,0,1]);
});
