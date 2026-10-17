import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector2,Vector3,PerspectiveCamera,Raycaster,Plane} from 'three';
import {loadRig} from '../helpers/load-rig.mjs';
import {jointLimits,projectJoint} from '../../web/labs/motion/pose/joint-limits.js';
import {FingerJointDrag} from '../../web/labs/motion/pose/finger-ik.js';
import {LimbIK} from '../../web/labs/motion/pose/pose-ik.js';
import {handCenter} from '../../web/labs/motion/pose/hand-rig.js';
import {jointRotation,handAngleCandidate,jointAngles} from '../../web/labs/motion/pose/hand-joint-motion.js';
for(const file of ['fixtures/candidates/m2m-human-base-animations.glb','fixtures/quaternius/AnimationLibrary_Godot_Standard.gltf']){
 test(file+'斜视角屏幕拖动不反向、不拉骨长，下游保持局部姿态',async()=>{
  const root=await loadRig(file),rig=jointLimits(root);for(const [b,c]of rig.joints)b.quaternion.copy(c.reference);root.updateMatrixWorld(true);let oldReverse=0,moved=0,total=0;
  for(const hand of rig.hands)for(const f of [hand.fingers[0],hand.fingers[1]])for(const x of [0,.5])for(const y of [-.3,.3]){
   const config=f.configs[0],initial=projectJoint(config,jointRotation(config,[x,y,0])).quaternion;
   for(let a=0;a<8;a++)for(const elevation of [-.7,.8])for(const delta of [new Vector2(.04,0),new Vector2(-.04,0),new Vector2(0,.04),new Vector2(0,-.04)]){
    f.bones[0].quaternion.copy(initial);root.updateMatrixWorld(true);const q=hand.wrist.getWorldQuaternion(new Quaternion()),up=new Vector3(0,1,0).applyQuaternion(q),dir=hand.palm.clone().applyQuaternion(q).multiplyScalar(Math.cos(a*Math.PI/4)).addScaledVector(hand.across.clone().applyQuaternion(q),Math.sin(a*Math.PI/4)).addScaledVector(up,elevation).normalize(),camera=new PerspectiveCamera(38,1,.001,100);camera.up.copy(up);camera.position.copy(handCenter(hand)).addScaledVector(dir,.4);camera.lookAt(handCenter(hand));camera.updateMatrixWorld(true);
    const world=f.bones[1].getWorldPosition(new Vector3()),before=world.clone().project(camera),ray=new Raycaster();ray.setFromCamera(new Vector2(before.x+delta.x,before.y+delta.y),camera);const target=ray.ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()),world),new Vector3()),legacy=new LimbIK({root,mesh:hand.mesh,upper:f.bones[0],middle:f.bones[1],end:f.bones[2],constraint:{poleZ:1}},{getMode:()=> 'natural'});legacy.begin();legacy.moveJoint(target);const old=f.bones[1].getWorldPosition(new Vector3()).project(camera);if((old.x-before.x)*delta.x+(old.y-before.y)*delta.y < -1e-6)oldReverse++;legacy.dispose();const solver=new FingerJointDrag(f);
    f.bones[0].quaternion.copy(initial);root.updateMatrixWorld(true);const child=f.bones.slice(1).map(b=>b.quaternion.toArray()),positions=f.bones.map(b=>b.position.toArray());solver.moveScreen(delta,camera,new Vector2(500,500));const after=f.bones[1].getWorldPosition(new Vector3()).project(camera),dot=(after.x-before.x)*delta.x+(after.y-before.y)*delta.y;
    assert.ok(dot>=-1e-9,JSON.stringify({side:hand.side,finger:f.name,a,elevation,delta:delta.toArray(),dot}));if(after.distanceTo(before)>1e-5)moved++;total++;assert.deepEqual(f.bones.slice(1).map(b=>b.quaternion.toArray()),child);assert.deepEqual(f.bones.map(b=>b.position.toArray()),positions);assert.equal(projectJoint(config,f.bones[0].quaternion).clamped,false);solver.dispose();
   }
   f.bones[0].quaternion.copy(config.reference);root.updateMatrixWorld(true);
  }
  assert.ok(oldReverse>0,'必须先复现旧路径反向');assert.ok(moved>total*.3,`不能靠冻结规避反向：${moved}/${total}`);
 });
 test(file+'拇指根部屈曲联动受限转向，自由模式不暗中联动',async()=>{
  const root=await loadRig(file),rig=jointLimits(root);for(const hand of rig.hands){const f=hand.fingers[0],c=f.configs[0],before=f.bones.map(b=>b.quaternion.toArray()),result=handAngleCandidate(c,c.reference,[.5,0,0],'natural'),angles=jointAngles(c,result.quaternion);assert.ok(angles[0]>.4);assert.ok(angles[2]>.15&&angles[2]<.3);assert.equal(projectJoint(c,result.quaternion).clamped,false);assert.deepEqual(f.bones.map(b=>b.quaternion.toArray()),before);assert.ok(Math.abs(jointAngles(c,handAngleCandidate(c,c.reference,[.5,0,0],'free').quaternion)[2])<1e-7);
   for(const config of f.configs){const outside=jointRotation(config,[.7,.4,-.3]),roundTrip=handAngleCandidate(config,outside,[0,0,0],'free').quaternion;assert.ok(roundTrip.angleTo(outside)<1e-7,'自由模式不能暗中把起点投回自然范围');}
  }
 });
}
