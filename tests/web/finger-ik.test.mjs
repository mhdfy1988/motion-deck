import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector2,Vector3,Quaternion,PerspectiveCamera} from 'three';
import {loadRig} from '../helpers/load-rig.mjs';
import {jointLimits,projectJoint} from '../../web/labs/motion/pose/joint-limits.js';
import {FingerJointDrag} from '../../web/labs/motion/pose/finger-ik.js';
import {handCenter} from '../../web/labs/motion/pose/hand-rig.js';
import {jointRotation,handAngleCandidate} from '../../web/labs/motion/pose/hand-joint-motion.js';
import {capturePose,PoseSampler} from '../../web/labs/motion/core/sequence-core.js';
import {createSessionState} from '../../web/labs/motion/application/session-state.js';
import {createWorkbenchOperations} from '../../web/labs/motion/application/workbench-operations.js';
function cameraFor(hand){const camera=new PerspectiveCamera(38,1,.001,100),q=hand.wrist.getWorldQuaternion(new Quaternion());camera.up.set(0,1,0).applyQuaternion(q);camera.position.copy(handCenter(hand)).addScaledVector(hand.palm.clone().addScaledVector(hand.across,.8).applyQuaternion(q).normalize(),.4);camera.lookAt(handCenter(hand));camera.updateMatrixWorld(true);return camera;}
for(const file of ['fixtures/candidates/m2m-human-base-animations.glb','fixtures/quaternius/AnimationLibrary_Godot_Standard.gltf']){
 test(file+'双手五指三节点逐段拖动：只有一根骨旋转，上游固定，下游局部不变',async()=>{
  const root=await loadRig(file),rig=jointLimits(root),nodes=[];root.traverse(n=>nodes.push(n));let moved=0;
  for(const hand of rig.hands)for(const finger of hand.fingers)for(let segment=0;segment<3;segment++){
   for(const [b,c]of rig.joints)b.quaternion.copy(c.reference);finger.bones.forEach((b,i)=>b.quaternion.copy(jointRotation(finger.configs[i],[.2,0,0])));root.updateMatrixWorld(true);
   const solver=new FingerJointDrag(finger,{segment}),bone=finger.bones[segment],before=capturePose(root),camera=cameraFor(hand),origin=bone.getWorldPosition(new Vector3()),initial=bone.quaternion.clone();
   bone.quaternion.copy(handAngleCandidate(finger.configs[segment],initial,[.25,0,0],'natural').quaternion);root.updateMatrixWorld(true);const target=solver.node.getWorldPosition(new Vector3()).project(camera);bone.quaternion.copy(initial);root.updateMatrixWorld(true);
   assert.deepEqual(solver.bones,[bone]);solver.begin();for(let i=0;i<5;i++){const point=solver.node.getWorldPosition(new Vector3()).project(camera);solver.moveScreen(new Vector2(target.x-point.x,target.y-point.y),camera,new Vector2(500,500));}
   const after=capturePose(root);assert.ok(bone.quaternion.angleTo(initial)>.01,JSON.stringify({side:hand.side,finger:finger.name,segment,angle:bone.quaternion.angleTo(initial),target:target.toArray(),point:solver.node.getWorldPosition(new Vector3()).project(camera).toArray(),residual:solver.residual}));moved++;assert.ok(bone.getWorldPosition(new Vector3()).distanceTo(origin)<1e-10);
   nodes.forEach((n,i)=>{assert.deepEqual(after[i].p,before[i].p);assert.deepEqual(after[i].s,before[i].s);if(n!==bone)assert.deepEqual(after[i].q,before[i].q);});assert.equal(projectJoint(finger.configs[segment],bone.quaternion).clamped,false);
   for(let i=0;i<8;i++)solver.moveScreen(new Vector2(.5,-.5),camera,new Vector2(500,500));assert.ok(bone.getWorldPosition(new Vector3()).distanceTo(origin)<1e-10);assert.equal(projectJoint(finger.configs[segment],bone.quaternion).clamped,false);solver.dispose();
  }assert.equal(moved,30);
 });
 for(let segment=0;segment<3;segment++)test(file+'节点'+segment+'原事务撤销、取消与重做',async()=>{
  const root=await loadRig(file),rig=jointLimits(root);for(const [b,c]of rig.joints)b.quaternion.copy(c.reference);root.updateMatrixWorld(true);const state=createSessionState(null);state.root=root;state.modelKey='a'.repeat(64);state.bones=[];root.traverse(n=>{if(n.isBone)state.bones.push(n);});state.sampler=new PoseSampler(root);const w=createWorkbenchOperations(state);w.beginUserDraft();
  const hand=rig.hands[0],finger=hand.fingers[1],solver=new FingerJointDrag(finger,{segment}),camera=cameraFor(hand),bone=finger.bones[segment],initial=bone.quaternion.clone();bone.quaternion.copy(handAngleCandidate(finger.configs[segment],initial,[.3,0,0],'natural').quaternion);root.updateMatrixWorld(true);const target=solver.node.getWorldPosition(new Vector3()).project(camera);bone.quaternion.copy(initial);root.updateMatrixWorld(true);const before=capturePose(root);
  const gesture=cancel=>{w.beginUserPoseGesture(solver.bones);solver.begin();const p=solver.node.getWorldPosition(new Vector3()).project(camera);solver.moveScreen(new Vector2(target.x-p.x,target.y-p.y),camera,new Vector2(500,500));w.constrainUserGesture(solver);w.finishUserPoseGesture(cancel);};
  gesture(true);assert.deepEqual(capturePose(root),before);assert.equal(state.poseDraft.undo.length,0);gesture(false);const after=capturePose(root);assert.notDeepEqual(after,before);assert.equal(state.poseDraft.undo.length,1);w.draftHistory('undo');assert.deepEqual(capturePose(root),before);w.draftHistory('redo');assert.deepEqual(capturePose(root),after);
 });
}
