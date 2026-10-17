import * as THREE from 'three';
import {CCDIKSolver} from 'three/addons/animation/CCDIKSolver.js';
import {enforceBones} from './joint-limits.js';
// 只识别明确的末端命名；父链必须属于同一蒙皮骨架。
export function findLimbChains(root){const meshes=[];root.traverse(n=>{if(n.isSkinnedMesh)meshes.push(n);});const chains=[];
  for(const [name,pattern] of [['左手',/^(DEF-hand[._]?L|mixamorigLeftHand|LeftHand|hand_l)$/i],['右手',/^(DEF-hand[._]?R|mixamorigRightHand|RightHand|hand_r)$/i],['左脚',/^(DEF-foot[._]?L|mixamorigLeftFoot|LeftFoot|foot_l)$/i],['右脚',/^(DEF-foot[._]?R|mixamorigRightFoot|RightFoot|foot_r)$/i]]){
    for(const mesh of meshes){const candidates=mesh.skeleton.bones.filter(b=>pattern.test(b.name));if(candidates.length!==1)continue;const end=candidates[0],middle=end.parent,upper=middle?.parent;
      if(!middle?.isBone||!upper?.isBone||!mesh.skeleton.bones.includes(middle)||!mesh.skeleton.bones.includes(upper))continue;
      const clean=b=>b.name.replace(/[._-]/g,'').toLowerCase(),leg=name.includes('脚');
      const expected=leg?[['calfl','thighl'],['calfr','thighr'],['defshinl','defthighl'],['defshinr','defthighr']]:[['lowerarml','upperarml'],['lowerarmr','upperarmr'],['defforearml','defupperarml'],['defforearmr','defupperarmr']];
      const constrained=expected.some(([m,u])=>clean(middle)===m&&clean(upper)===u);
      chains.push({name,mesh,end,middle,upper,root,constraint:constrained?{maxBend:THREE.MathUtils.degToRad(leg?160:155),poleZ:leg?1:-1}:null});break;
    }
  }return chains;
}
// 正式手动入口仅开放已映射的解析两骨链；未知骨架不静默改走旧CCD分支。
export function findEditableLimbChains(root){return findLimbChains(root).filter(chain=>{
 if(!chain.constraint)return false;
 // 内置glTF大腿存在约1.7e-6的导出误差，仅接受相对1e-5内的近似均匀缩放。
 for(let node=chain.end;node;node=node.parent){const s=node.scale.toArray();if(!s.every(v=>Number.isFinite(v)&&v>0)||Math.max(...s)-Math.min(...s)>Math.max(...s)*1e-5)return false;}
 root.updateMatrixWorld(true);const a=chain.upper.getWorldPosition(new THREE.Vector3()),b=chain.middle.getWorldPosition(new THREE.Vector3()),c=chain.end.getWorldPosition(new THREE.Vector3());
 return a.distanceTo(b)>1e-6&&b.distanceTo(c)>1e-6;
});}
export class LimbIK{
  constructor(chain,{getMode=()=> 'free'}={}){this.chain=chain;this.getMode=getMode;this.feedback=[];this.residual=0;if(chain.constraint)return;this.target=new THREE.Bone();this.target.name='pose-drag-target';
    // 临时蒙皮容器引用原骨骼，额外目标不加入模型/原骨架，不污染姿势快照。
    this.proxy=new THREE.SkinnedMesh();this.proxy.skeleton=new THREE.Skeleton([...chain.mesh.skeleton.bones,this.target]);
    const bones=this.proxy.skeleton.bones;this.ik={target:bones.length-1,effector:bones.indexOf(chain.end),links:[{index:bones.indexOf(chain.middle)},{index:bones.indexOf(chain.upper)}],iteration:24,maxAngle:.18};this.solver=new CCDIKSolver(this.proxy,[this.ik]);
  }
  begin(){
    const {upper,middle,end,root,constraint}=this.chain;if(!constraint)return;
    root.updateMatrixWorld(true);const a=upper.getWorldPosition(new THREE.Vector3()),b=middle.getWorldPosition(new THREE.Vector3()),c=end.getWorldPosition(new THREE.Vector3()),axis=c.clone().sub(a).normalize();
    let pole=b.clone().sub(a).addScaledVector(axis,-b.clone().sub(a).dot(axis));
    if(pole.lengthSq()<1e-8){pole=new THREE.Vector3(0,0,constraint.poleZ).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));pole.addScaledVector(axis,-pole.dot(axis));}
    if(pole.lengthSq()<1e-8){pole=new THREE.Vector3(0,1,0);pole.addScaledVector(axis,-pole.dot(axis));}
    this.start={a,b,c,pole:pole.normalize(),l1:a.distanceTo(b),l2:b.distanceTo(c),upper:upper.quaternion.clone(),upperWorld:upper.getWorldQuaternion(new THREE.Quaternion()).normalize(),middle:middle.quaternion.clone(),end:end.quaternion.clone(),endWorld:end.getWorldQuaternion(new THREE.Quaternion())};
  }
  // 两骨链的目标和弯曲方向分离；仅旋转节点，原局部位移/缩放不变。
  solve(target,pole){
    if(!this.start)this.begin();const s=this.start,{upper,middle,end,constraint}=this.chain;
    upper.quaternion.copy(s.upper);middle.quaternion.copy(s.middle);upper.updateWorldMatrix(true,true);
    const axis=target.clone().sub(s.a),raw=axis.length();if(raw<1e-8)axis.copy(s.c).sub(s.a);axis.normalize();
    const min=Math.sqrt(s.l1*s.l1+s.l2*s.l2+2*s.l1*s.l2*Math.cos(constraint.maxBend)),max=(s.l1+s.l2)*(1-1e-7),d=THREE.MathUtils.clamp(raw,min,max);
    const bend=pole.clone().addScaledVector(axis,-pole.dot(axis));if(bend.lengthSq()<1e-8)bend.copy(s.pole).addScaledVector(axis,-s.pole.dot(axis));if(bend.lengthSq()<1e-8)return end.getWorldPosition(new THREE.Vector3());bend.normalize();
    const x=(s.l1*s.l1-s.l2*s.l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,s.l1*s.l1-x*x)),joint=s.a.clone().addScaledVector(axis,x).addScaledVector(bend,height),goal=s.a.clone().addScaledVector(axis,d);
    const oldDir=s.b.clone().sub(s.a).normalize(),newDir=joint.clone().sub(s.a).normalize(),swing=new THREE.Quaternion().setFromUnitVectors(oldDir,newDir);
    // 同时对齐弯曲平面，避免只对齐端点时上臂/大腿累积扭转。
    const oldNormal=new THREE.Vector3().crossVectors(s.c.clone().sub(s.a).normalize(),s.pole).normalize().applyQuaternion(swing),normal=new THREE.Vector3().crossVectors(axis,bend).normalize();
    const twist=Math.atan2(newDir.dot(new THREE.Vector3().crossVectors(oldNormal,normal)),oldNormal.dot(normal));
    const upperWorld=upper.getWorldQuaternion(new THREE.Quaternion()).premultiply(swing).premultiply(new THREE.Quaternion().setFromAxisAngle(newDir,twist));setWorldRotation(upper,upperWorld);
    this.feedback=enforceBones(this.chain.root,[upper],this.getMode());
    const current=end.getWorldPosition(new THREE.Vector3()).sub(middle.getWorldPosition(new THREE.Vector3())).normalize(),wanted=goal.clone().sub(middle.getWorldPosition(new THREE.Vector3())).normalize();
    setWorldRotation(middle,middle.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromUnitVectors(current,wanted)));
    this.feedback.push(...enforceBones(this.chain.root,[middle],this.getMode()));setWorldRotation(end,s.endWorld);
    this.feedback.push(...enforceBones(this.chain.root,[end],this.getMode()));this.residual=end.getWorldPosition(new THREE.Vector3()).distanceTo(target);this.orientationResidual=end.getWorldQuaternion(new THREE.Quaternion()).angleTo(s.endWorld);
    return end.getWorldPosition(new THREE.Vector3());
  }
  move(world){if(this.chain.constraint){if(!this.start)this.begin();return this.solve(world,this.start.pole);}this.chain.upper.updateWorldMatrix(true,true);this.target.position.copy(world);this.target.updateMatrixWorld(true);this.solver.update();this.chain.upper.updateWorldMatrix(true,true);return this.chain.end.getWorldPosition(new THREE.Vector3());}
  // 拖肘/膝摆整条肢体：只转父骨，保留子骨局部姿态；不固定手脚或重解弯曲角。
  moveJoint(world){
    if(!this.chain.constraint)throw new Error('当前骨链不支持直接摆动');
    if(!this.start)this.begin();const s=this.start,{upper,middle,end}=this.chain,from=s.b.clone().sub(s.a),to=world.clone().sub(s.a);
    if(from.lengthSq()<1e-12)throw new Error('肢体骨长无效');
    // 鼠标接近支点时方向无定义，保持最后一次有效姿态，不跳转或改变骨长。
    if(to.length()<s.l1*.005)return middle.getWorldPosition(new THREE.Vector3());
    const swing=new THREE.Quaternion().setFromUnitVectors(from.normalize(),to.normalize());
    middle.quaternion.copy(s.middle);end.quaternion.copy(s.end);setWorldRotation(upper,s.upperWorld.clone().premultiply(swing));
    this.feedback=enforceBones(this.chain.root,[upper],this.getMode());this.residual=middle.getWorldPosition(new THREE.Vector3()).distanceTo(world);
    return middle.getWorldPosition(new THREE.Vector3());
  }
  // 拖手脚只转小臂/小腿，肘膝固定；腕踝局部姿态及下游自然跟随。
  moveEnd(world){
    if(!this.chain.constraint)throw new Error('当前骨链不支持直接摆动');
    if(!this.start)this.begin();const s=this.start,{middle,end}=this.chain,to=world.clone().sub(s.b);
    if(!to.toArray().every(Number.isFinite))throw new Error('拖动目标无效');
    if(to.length()<s.l2*.005)return end.getWorldPosition(new THREE.Vector3());
    const from=s.c.clone().sub(s.b).normalize(),swing=new THREE.Quaternion().setFromUnitVectors(from,to.normalize());
    end.quaternion.copy(s.end);
    const parent=middle.parent.getWorldQuaternion(new THREE.Quaternion()).normalize();
    setWorldRotation(middle,parent.multiply(s.middle).premultiply(swing));
    this.feedback=enforceBones(this.chain.root,[middle],this.getMode());this.residual=end.getWorldPosition(new THREE.Vector3()).distanceTo(world);
    return end.getWorldPosition(new THREE.Vector3());
  }
  assertPoleEditable(){
    if(!this.chain.constraint)throw new Error('当前骨链不支持弯曲方向调整');
    if(!this.start)this.begin();const s=this.start,axis=s.c.clone().sub(s.a),length=axis.length();
    if(length<1e-8)throw new Error('手脚与根关节重合，请先拖动手脚展开肢体');
    axis.divideScalar(length);const radial=s.b.clone().sub(s.a).addScaledVector(axis,-s.b.clone().sub(s.a).dot(axis));
    if(radial.length()/(s.l1+s.l2)<.005)throw new Error('肢体接近伸直，请先拖动手脚稍微弯曲');
  }
  movePole(world){
    this.assertPoleEditable();const s=this.start,{upper,middle,end}=this.chain,axis=s.c.clone().sub(s.a).normalize(),radial=world.clone().sub(s.a);radial.addScaledVector(axis,-radial.dot(axis));
    // 沿肩—手／髋—脚轴转动原弯曲平面，不重新求解长度或回收末端。
    if(radial.length()/(s.l1+s.l2)<.005)return end.getWorldPosition(new THREE.Vector3());
    radial.normalize();const angle=Math.atan2(axis.dot(new THREE.Vector3().crossVectors(s.pole,radial)),s.pole.dot(radial));
    middle.quaternion.copy(s.middle);setWorldRotation(upper,s.upperWorld.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(axis,angle)));setWorldRotation(end,s.endWorld);
    return end.getWorldPosition(new THREE.Vector3());
  }
  dispose(){if(!this.proxy)return;this.proxy.geometry.dispose();this.proxy.material.dispose();this.proxy.skeleton.dispose();}
}
function setWorldRotation(bone,world){const parent=bone.parent?.getWorldQuaternion(new THREE.Quaternion())??new THREE.Quaternion();bone.quaternion.copy(parent.normalize().invert().multiply(world)).normalize();bone.updateWorldMatrix(true,true);}
