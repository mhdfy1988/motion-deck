import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AnimationMixer,Vector2,Vector3,Quaternion,PerspectiveCamera} from 'three';
import {loadRigAsset} from '../helpers/load-rig.mjs';
import {jointLimits,projectJoint} from '../../web/labs/motion/pose/joint-limits.js';
import {FingerJointDrag} from '../../web/labs/motion/pose/finger-ik.js';
import {handCenter} from '../../web/labs/motion/pose/hand-rig.js';
import {jointAngles,handAngleCandidate} from '../../web/labs/motion/pose/hand-joint-motion.js';
import {capturePose,PoseSampler} from '../../web/labs/motion/core/sequence-core.js';
import {createSessionState} from '../../web/labs/motion/application/session-state.js';
import {createWorkbenchOperations} from '../../web/labs/motion/application/workbench-operations.js';
const files=['fixtures/candidates/m2m-human-base-animations.glb','fixtures/quaternius/AnimationLibrary_Godot_Standard.gltf'];
function cameraFor(hand){const c=new PerspectiveCamera(38,1,.001,100),q=hand.wrist.getWorldQuaternion(new Quaternion());c.up.set(0,1,0).applyQuaternion(q);c.position.copy(handCenter(hand)).addScaledVector(hand.palm.clone().addScaledVector(hand.across,.3).applyQuaternion(q).normalize(),.4);c.lookAt(handCenter(hand));c.updateMatrixWorld(true);return c;}
for(const file of files){
 test(file+'真实动作超限末节首次拖动解锁、零增量不修改、只改一骨',async()=>{
  const asset=await loadRigAsset(file),root=asset.scene,rig=jointLimits(root),mixer=new AnimationMixer(root),nodes=[];root.traverse(n=>nodes.push(n));let count=0,pinky=0;
  for(const clip of asset.animations){mixer.stopAllAction();mixer.clipAction(clip).reset().play();mixer.setTime(clip.duration*.5);root.updateMatrixWorld(true);
   for(const hand of rig.hands)for(const name of ['thumb','pinky']){const f=hand.fingers.find(f=>f.name===name),bone=f.bones[2],config=f.configs[2],original=bone.quaternion.clone();if(projectJoint(config,original).error<=.40001)continue;
    const before=capturePose(root),solver=new FingerJointDrag(f,{segment:2}),camera=cameraFor(hand);solver.begin();solver.moveScreen(new Vector2(),camera,new Vector2(500,500));assert.deepEqual(capturePose(root),before,'无输入不能修正旧姿势');
    const result=solver.moveScreen(new Vector2(.02,0),camera,new Vector2(500,500));assert.ok(result.changed,clip.name+'/'+hand.side+'/'+name);assert.equal(result.recovered,true);assert.equal(projectJoint(config,bone.quaternion).clamped,false);const after=capturePose(root);nodes.forEach((n,i)=>{assert.deepEqual(after[i].p,before[i].p);assert.deepEqual(after[i].s,before[i].s);if(n!==bone)assert.deepEqual(after[i].q,before[i].q);});count++;if(name==='pinky')pinky++;
    const legal=bone.quaternion.clone(),angle=jointAngles(config,legal)[0],amount=angle>config.ranges[0][1]/2?-.25:.25;bone.quaternion.copy(handAngleCandidate(config,legal,[amount,0,0],'natural').quaternion);root.updateMatrixWorld(true);const target=solver.node.getWorldPosition(new Vector3()).project(camera);bone.quaternion.copy(legal);root.updateMatrixWorld(true);const start=solver.node.getWorldPosition(new Vector3()).project(camera);solver.moveScreen(new Vector2(target.x-start.x,target.y-start.y),camera,new Vector2(500,500));assert.ok(bone.quaternion.angleTo(legal)>1e-5,'校正之后仍应能继续控制：'+clip.name+'/'+hand.side+'/'+name);
    bone.quaternion.copy(original);root.updateMatrixWorld(true);new FingerJointDrag(f,{segment:2,getMode:()=> 'free'}).moveScreen(new Vector2(),camera,new Vector2(500,500));assert.deepEqual(capturePose(root),before,'自由模式不能偷偷修正');solver.dispose();
   }
  }assert.ok(count>20);if(file.endsWith('.glb'))assert.ok(pinky>0,'必须包含实际小指23度超限案例');
 });
 test(file+'超限姿势恢复沿原事务取消、提交、撤销、重做',async()=>{
  const asset=await loadRigAsset(file),root=asset.scene,rig=jointLimits(root),mixer=new AnimationMixer(root);let hand,finger;
  outer:for(const clip of asset.animations){mixer.stopAllAction();mixer.clipAction(clip).reset().play();mixer.setTime(clip.duration*.5);root.updateMatrixWorld(true);for(const h of rig.hands){const f=h.fingers[0];if(projectJoint(f.configs[2],f.bones[2].quaternion).error>.42){hand=h;finger=f;break outer;}}}
  assert.ok(finger); // 后续不推进mixer，保留选中的实际动作采样，不重置为标定姿势。
  const state=createSessionState(null);state.root=root;state.modelKey='b'.repeat(64);state.bones=[];root.traverse(n=>{if(n.isBone)state.bones.push(n);});state.sampler=new PoseSampler(root);const w=createWorkbenchOperations(state);w.beginUserDraft();const before=capturePose(root),camera=cameraFor(hand),solver=new FingerJointDrag(finger,{segment:2});
  const gesture=cancel=>{w.beginUserPoseGesture(solver.bones);solver.begin();solver.moveScreen(new Vector2(.02,0),camera,new Vector2(500,500));w.constrainUserGesture(solver);w.finishUserPoseGesture(cancel);};gesture(true);assert.deepEqual(capturePose(root),before);assert.equal(state.poseDraft.undo.length,0);gesture(false);const after=capturePose(root);assert.notDeepEqual(after,before);assert.equal(state.poseDraft.undo.length,1);assert.equal(projectJoint(finger.configs[2],finger.bones[2].quaternion).clamped,false);w.draftHistory('undo');assert.deepEqual(capturePose(root),before);w.draftHistory('redo');assert.deepEqual(capturePose(root),after);
 });
}
