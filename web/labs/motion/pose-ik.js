import * as THREE from 'three';
import {CCDIKSolver} from 'three/addons/animation/CCDIKSolver.js';
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
export class LimbIK{
  constructor(chain){this.chain=chain;if(chain.constraint)return;this.target=new THREE.Bone();this.target.name='pose-drag-target';
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
    this.start={a,b,c,pole:pole.normalize(),l1:a.distanceTo(b),l2:b.distanceTo(c),upper:upper.quaternion.clone(),middle:middle.quaternion.clone(),endWorld:end.getWorldQuaternion(new THREE.Quaternion())};
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
    const current=end.getWorldPosition(new THREE.Vector3()).sub(middle.getWorldPosition(new THREE.Vector3())).normalize(),wanted=goal.clone().sub(joint).normalize();
    setWorldRotation(middle,middle.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromUnitVectors(current,wanted)));setWorldRotation(end,s.endWorld);
    return end.getWorldPosition(new THREE.Vector3());
  }
  move(world){if(this.chain.constraint){if(!this.start)this.begin();return this.solve(world,this.start.pole);}this.chain.upper.updateWorldMatrix(true,true);this.target.position.copy(world);this.target.updateMatrixWorld(true);this.solver.update();this.chain.upper.updateWorldMatrix(true,true);return this.chain.end.getWorldPosition(new THREE.Vector3());}
  movePole(world){if(!this.chain.constraint)return;if(!this.start)this.begin();const s=this.start,goal=s.c.clone(),axis=goal.clone().sub(s.a).normalize();
    // 完全伸直时没有弯曲平面；首次拖肘膝留35°轻弯，末端仅轻微回收。
    const soft=Math.sqrt(s.l1*s.l1+s.l2*s.l2+2*s.l1*s.l2*Math.cos(THREE.MathUtils.degToRad(35)));if(goal.distanceTo(s.a)>soft)goal.copy(s.a).addScaledVector(axis,soft);
    return this.solve(goal,world.clone().sub(s.a));
  }
  dispose(){if(!this.proxy)return;this.proxy.geometry.dispose();this.proxy.material.dispose();this.proxy.skeleton.dispose();}
}
function setWorldRotation(bone,world){const parent=bone.parent?.getWorldQuaternion(new THREE.Quaternion())??new THREE.Quaternion();bone.quaternion.copy(parent.invert().multiply(world));bone.updateWorldMatrix(true,true);}
