import * as THREE from 'three';
import {Joint,Link,Goal,Solver,DOF,SOLVE_STATUS_NAMES} from 'closed-chain-ik/core';

// 试验适配层：求解骨架独立于蒙皮树，只有骨盆允许平移，其余骨骼只旋转。
const definitions=[['头','head','head'],['脖子','neck','neck_01'],['胸','spine003','spine_03'],['腰','spine001','spine_01'],['骨盆','hips','pelvis'],['左肩','shoulderL','clavicle_l'],['右肩','shoulderR','clavicle_r'],['左上臂','upper_armL','upperarm_l'],['右上臂','upper_armR','upperarm_r'],['左肘','forearmL','lowerarm_l'],['右肘','forearmR','lowerarm_r'],['左膝','shinL','calf_l'],['右膝','shinR','calf_r'],['左大腿','thighL','thigh_l'],['右大腿','thighR','thigh_r'],['左手','handL','hand_l'],['右手','handR','hand_r'],['左脚','footL','foot_l'],['右脚','footR','foot_r']];
const norm=s=>s.replace(/[._-]/g,'').toLowerCase();
// 限制的是相对手势起始姿势的调整预算，不是人体生理角度或逐关节软刚度。
function adjustmentPolicy(name,mode){
 const angles=new Map(definitions.map(([part])=>[part,.5]));let translation=.002,label='局部优先';
 const set=(names,degrees)=>names.forEach(n=>angles.set(n,degrees));
 const arms=side=>[side+'肩',side+'上臂',side+'肘',side+'手'];
 const legs=side=>[side+'大腿',side+'膝',side+'脚'];
 if(/[肩臂肘手]/.test(name)){
  const side=name[0];set(arms(side),100);angles.set(side+'肩',20);set(['胸','腰'],1);angles.set('骨盆',.25);label='手臂优先';
 }else if(/[腿膝脚]/.test(name)){
  const side=name[0];set(legs(side),100);set(legs(side==='左'?'右':'左'),12);angles.set('骨盆',1.5);set(['腰','胸'],.75);translation=.0075;label='腿部优先';
 }else if(name==='头'||name==='脖子'){
  set(['头','脖子'],55);set(['胸','腰'],8);angles.set('骨盆',1);translation=.003;label='头颈优先';
 }else if(name==='骨盆'){
  set(['骨盆'],25);set([...legs('左'),...legs('右')],80);set(['腰','胸'],8);translation=.16;label='骨盆与腿配合';
 }else{
  set(['腰','胸'],40);angles.set('骨盆',8);set([...legs('左'),...legs('右')],35);translation=.07;label='躯干优先';
 }
 if(mode==='rotation'&&name!=='骨盆'){
  // 旋转当前关节，不用相邻节点分摊一次本来可由当前节点完成的旋转。
  for(const part of angles.keys())angles.set(part,part===name?100:.5);translation=.002;label='当前关节优先';
 }
 let primary,near;
 if(/[肩臂肘手]/.test(name)){primary=new Set(arms(name[0]).filter(n=>!n.endsWith('肩')||n===name));near=new Set(name.endsWith('肩')?['胸']: [name[0]+'肩']);}
 else if(/[腿膝脚]/.test(name)){primary=new Set(legs(name[0]));near=new Set(['骨盆',...legs(name[0]==='左'?'右':'左')]);}
 else if(name==='头'||name==='脖子'){primary=new Set(['头','脖子']);near=new Set(['胸']);}
 else if(name==='骨盆'){primary=new Set(['骨盆',...legs('左'),...legs('右')]);near=new Set(['腰','胸']);}
 else{primary=new Set(['腰','胸']);near=new Set(['骨盆',...legs('左'),...legs('右')]);}
 return {angles,translation,label,primary,near};
}
// 误差均已按身高归一化；平滑曲线在起点/终点斜率为零，避免阈值一到突然放开。
const activation=(error,start,width)=>{const t=THREE.MathUtils.clamp((error-start)/width,0,1);return t*t*(3-2*t);};
export class FullBodyRig{
 constructor(root){
  this.root=root;root.updateMatrixWorld(true);const bones=[];root.traverse(n=>{if(n.isBone)bones.push(n);});
  this.parts=new Map();for(const [name,suffix,alias] of definitions){const found=bones.filter(b=>b.name===alias||norm(b.name)===norm('DEF'+suffix));if(found.length!==1)throw new Error(`试验不支持此骨架：${name}映射缺失或歧义`);this.parts.set(name,found[0]);}
  this.pelvis=this.parts.get('骨盆');this.bones=[];this.pelvis.traverse(b=>{if(b.isBone)this.bones.push(b);});
  for(const bone of this.parts.values())if(!this.bones.includes(bone))throw new Error('控制点不属于同一骨盆子树');
  const box=new THREE.Box3().setFromPoints(bones.map(b=>b.getWorldPosition(new THREE.Vector3())));this.size=Math.max(box.getSize(new THREE.Vector3()).y,.01);
  for(const bone of this.bones){const s=bone.getWorldScale(new THREE.Vector3());if(Math.min(s.x,s.y,s.z)<=0||Math.max(s.x,s.y,s.z)-Math.min(s.x,s.y,s.z)>Math.max(s.x,s.y,s.z)*1e-4)throw new Error('试验仅支持正等比骨架缩放');}
 }
 point(name){return this.parts.get(name).getWorldPosition(new THREE.Vector3());}
 orientation(name){return this.parts.get(name).getWorldQuaternion(new THREE.Quaternion()).normalize();}
 begin(name,pins=new Map(),mode='position'){
  if(!this.parts.has(name))throw new Error('未知身体部位');this.root.updateMatrixWorld(true);this.entries=new Map();this.world=new Link();
  const mobile=new Set(this.parts.values()),names=new Map([...this.parts].map(([part,bone])=>[bone,part]));this.policy=adjustmentPolicy(name,mode);this.mode=mode;
  for(const bone of this.bones){
   const parent=this.entries.get(bone.parent),q=bone.getWorldQuaternion(new THREE.Quaternion()).normalize(),p=bone.getWorldPosition(new THREE.Vector3()).divideScalar(this.size);
   const parentQ=parent?.initialQ??new THREE.Quaternion(),parentP=parent?.initialP??new THREE.Vector3();
   const joint=new Joint(),link=new Link();joint.name=bone.name;
   joint.setPosition(...p.clone().sub(parentP).applyQuaternion(parentQ.clone().invert()).toArray());
   joint.setQuaternion(...parentQ.clone().invert().multiply(q).toArray());
   if(bone===this.pelvis)joint.setDoF(DOF.X,DOF.Y,DOF.Z,DOF.EX,DOF.EY,DOF.EZ);
   else if(mobile.has(bone))joint.setDoF(DOF.EX,DOF.EY,DOF.EZ);
   for(const dof of joint.dof){const limit=dof<3?this.policy.translation:THREE.MathUtils.degToRad(this.policy.angles.get(names.get(bone))??.5);joint.setMinLimit(dof,-limit);joint.setMaxLimit(dof,limit);}
   joint.restPoseSet=true;
   (parent?.link??this.world).addChild(joint);joint.addChild(link);this.entries.set(bone,{joint,link,initialP:p,initialQ:q,part:names.get(bone)});
  }
  this.goals=[];for(const [part,pin] of pins)if(part!==name)this.addGoal(part,pin.position,pin.rotation);
  this.drag=this.addGoal(name,this.point(name),mode==='rotation'?this.orientation(name):null);
  this.solver=new Solver([this.world,...this.goals.map(g=>g.frame)]);
  Object.assign(this.solver,{maxIterations:12,dampingFactor:.03,restPoseFactor:.04,translationConvergeThreshold:.001,rotationConvergeThreshold:.003,translationErrorClamp:.06,rotationErrorClamp:.12,useSVD:false});
 }
 addGoal(name,position,rotation){
  const frame=new Goal();frame.name=name;frame.setGoalDoF(...[...(position?[DOF.X,DOF.Y,DOF.Z]:[]),...(rotation?[DOF.EX,DOF.EY,DOF.EZ]:[])]);
  frame.setPosition(...(position??this.point(name)).clone().divideScalar(this.size).toArray());if(rotation)frame.setQuaternion(...rotation.toArray());
  frame.makeClosure(this.entries.get(this.parts.get(name)).link);const goal={name,frame,position:!!position,rotation:!!rotation};this.goals.push(goal);return goal;
 }
 setParticipation(near,support,reset=false){
  for(const {joint,part} of this.entries.values()){
   const factor=this.policy.primary.has(part)?1:this.policy.near.has(part)?near:support;
   for(const d of joint.dof){const cap=d<3?this.policy.translation:THREE.MathUtils.degToRad(this.policy.angles.get(part)??.5);joint.setMinLimit(d,-cap*factor);joint.setMaxLimit(d,cap*factor);if(reset)joint.setDoFValue(d,0);}
  }
 }
 remainingError(){
  this.world.updateMatrixWorld(true);let error=0;
  for(const {name,frame,position,rotation} of this.goals){const link=this.entries.get(this.parts.get(name)).link,p=new Float32Array(3),q=new Float32Array(4);link.getWorldPosition(p);link.getWorldQuaternion(q);
   if(position)error=Math.max(error,new THREE.Vector3().fromArray(p).distanceTo(new THREE.Vector3().fromArray(frame.position)));
   // 朝向保持冲突也需要配合，换算为身高10%力臂上的位移；不是物理拉力。
   if(rotation)error=Math.max(error,new THREE.Quaternion().fromArray(q).normalize().angleTo(new THREE.Quaternion().fromArray(frame.quaternion).normalize())*.1);
  }return error;
 }
 move(position,rotation=null){
  if(!this.solver)throw new Error('尚未开始操作');if(!position.toArray().every(Number.isFinite)||rotation&&!rotation.toArray().every(Number.isFinite))throw new Error('目标无效');
  this.drag.frame.setPosition(...position.clone().divideScalar(this.size).toArray());if(rotation)this.drag.frame.setQuaternion(...rotation.clone().normalize().toArray());
  const start=performance.now();let states,participation=null;
  if(this.mode==='position'){
   // 每次预探都从本次手势基准重求，不把上一帧已经放开的参与范围累积到下一帧。
   this.setParticipation(0,0,true);this.solver.maxIterations=24;states=this.solver.solve();const localError=this.remainingError(),near=activation(localError,.003,.035);
   let support=0,neighborError=localError;
   if(near>0){this.setParticipation(near,0);states=this.solver.solve();neighborError=this.remainingError();support=activation(neighborError,.015,.06);
    if(support>0){this.setParticipation(near,support);states=this.solver.solve();}}
   participation={near,support,localError,neighborError};
  }else states=this.solver.solve();
  this.world.updateMatrixWorld(true);
  const outputs=[];for(const [bone,e] of this.entries){const q=new Float32Array(4),p=new Float32Array(3);e.link.getWorldQuaternion(q);e.link.getWorldPosition(p);if(![...q,...p].every(Number.isFinite))throw new Error('求解产生无效姿势');outputs.push({bone,q:new THREE.Quaternion().fromArray(q).normalize(),p:new THREE.Vector3().fromArray(p).multiplyScalar(this.size)});}
  // 先校验整个结果再写入，不在骨长异常时退回旧IK路径。
  for(const {bone,q,p} of outputs){if(bone===this.pelvis)bone.position.copy(bone.parent.worldToLocal(p));const parentQ=bone.parent.getWorldQuaternion(new THREE.Quaternion()).normalize();bone.quaternion.copy(parentQ.invert().multiply(q));bone.updateMatrixWorld(true);}
  this.root.updateMatrixWorld(true);
  const errors=this.goals.map(({name,frame,position,rotation})=>({name,position:position?this.point(name).divideScalar(this.size).distanceTo(new THREE.Vector3().fromArray(frame.position)):0,rotation:rotation?this.orientation(name).angleTo(new THREE.Quaternion().fromArray(frame.quaternion).normalize()):0}));
  const atBoundary=[...this.entries.values()].some(({joint})=>joint.dof.some(d=>Math.min(Math.abs(joint.getDoFValue(d)-joint.getMinLimit(d)),Math.abs(joint.getDoFValue(d)-joint.getMaxLimit(d)))<1e-5));
  return {states:states.map(s=>SOLVE_STATUS_NAMES[s]),milliseconds:performance.now()-start,errors,scope:this.policy.label,participation,limited:atBoundary&&(errors.at(-1).position>.003||errors.at(-1).rotation>.01)};
 }
}
