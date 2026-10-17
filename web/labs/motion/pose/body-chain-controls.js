import * as THREE from 'three';
import {CCDIKSolver} from 'three/addons/animation/CCDIKSolver.js';
import {findEditableLimbChains,LimbIK} from './pose-ik.js';
import {enforceBones} from './joint-limits.js';

const world=node=>node.getWorldPosition(new THREE.Vector3());
const uniform=node=>{for(;node;node=node.parent){const s=node.scale.toArray();if(!s.every(v=>Number.isFinite(v)&&v>0)||Math.max(...s)-Math.min(...s)>Math.max(...s)*1e-5)return false;}return true;};

// 显式映射两种内置骨架；不按模糊名称猜陌生骨架的躯干或骨盆。
export function findBodyChain(root){
 const layouts=[['pelvis','spine_01','spine_02','spine_03','neck_01','head'],['DEF-hips','DEF-spine.001','DEF-spine.002','DEF-spine.003','DEF-neck','DEF-head']];
 const meshes=[];root.traverse(n=>{if(n.isSkinnedMesh)meshes.push(n);});root.updateMatrixWorld(true);
 for(const mesh of meshes)for(const names of layouts){
  const nodes=names.map(name=>mesh.skeleton.bones.filter(b=>b.name===THREE.PropertyBinding.sanitizeNodeName(name)));if(nodes.some(n=>n.length!==1))continue;
  const [pelvis,...spine]=nodes.map(n=>n[0]);if(!uniform(spine.at(-1))||spine.some((n,i)=>n.parent!==(i?spine[i-1]:pelvis)))continue;
  if(spine.some((n,i)=>world(n).distanceTo(world(i?spine[i-1]:pelvis))<1e-6))continue;
  const legs=findEditableLimbChains(root).filter(c=>c.name.includes('脚')&&c.upper.parent===pelvis&&c.mesh===mesh);
  return {root,mesh,pelvis,links:spine.slice(0,-1),head:spine.at(-1),legs};
 }return null;
}

export class TorsoDrag{
 constructor(chain,{getMode=()=> 'free'}={}){
  this.chain=chain;this.getMode=getMode;this.feedback=[];this.residual=0;this.bones=chain.links;this.target=new THREE.Bone();
  this.proxy=new THREE.SkinnedMesh();this.proxy.skeleton=new THREE.Skeleton([...chain.mesh.skeleton.bones,this.target]);
  const bones=this.proxy.skeleton.bones;
  this.config={target:bones.length-1,effector:bones.indexOf(chain.head),links:[...this.bones].reverse().map(b=>({index:bones.indexOf(b)})),iteration:1,maxAngle:.12};
  this.solver=new CCDIKSolver(this.proxy,[this.config]);
 }
 begin(){this.chain.root.updateMatrixWorld(true);this.start=this.bones.map(b=>b.quaternion.clone());this.head=world(this.chain.head);this.length=this.bones.reduce((sum,b,i)=>sum+world(b).distanceTo(world(this.bones[i+1]??this.chain.head)),0);}
 move(delta){
  if(!delta.toArray().every(Number.isFinite))throw new Error('拖动目标无效');
  this.bones.forEach((b,i)=>b.quaternion.copy(this.start[i]));this.chain.root.updateMatrixWorld(true);
  this.target.position.copy(this.head).add(delta.clone().clampLength(0,this.length*.6));this.target.updateMatrixWorld(true);
  // 限制每次手势各节相对起点的转角，防止CCD为追目标无限折腰；不是人体关节极限模型。
  this.feedback=[];
  for(let pass=0;pass<20;pass++)for(const link of this.config.links){
   this.solver.updateOne({...this.config,links:[link]});const b=this.proxy.skeleton.bones[link.index],i=this.bones.indexOf(b);b.quaternion.normalize();const angle=this.start[i].angleTo(b.quaternion);if(angle>.5)b.quaternion.copy(this.start[i].clone().slerp(b.quaternion,.5/angle));
   this.feedback.push(...enforceBones(this.chain.root,[b],this.getMode()));
  }
  this.feedback=[...new Map(this.feedback.map(r=>[r.joint,r])).values()];this.residual=world(this.chain.head).distanceTo(this.target.position);
 }
 dispose(){this.proxy.geometry.dispose();this.proxy.material.dispose();this.proxy.skeleton.dispose();}
}

export class PelvisDrag{
 constructor(chain,options={}){this.chain=chain;this.legs=chain.legs.map(c=>new LimbIK(c,options));this.bones=[chain.pelvis,...chain.legs.flatMap(c=>[c.upper,c.middle,c.end])];this.positionBones=[chain.pelvis];this.feedback=[];this.residual=0;}
 begin(){
  this.chain.root.updateMatrixWorld(true);this.start=world(this.chain.pelvis);this.local=this.chain.pelvis.position.clone();this.rotations=this.bones.map(b=>b.quaternion.clone());
  this.feet=this.chain.legs.map(c=>world(c.end));this.length=this.chain.legs.map(c=>world(c.upper).distanceTo(world(c.middle))+world(c.middle).distanceTo(world(c.end)));
 }
 restore(){this.chain.pelvis.position.copy(this.local);this.bones.forEach((b,i)=>b.quaternion.copy(this.rotations[i]));this.chain.root.updateMatrixWorld(true);}
 attempt(delta,ratio){
  this.restore();const pelvis=this.chain.pelvis;pelvis.position.copy(pelvis.parent.worldToLocal(this.start.clone().addScaledVector(delta,ratio)));this.chain.root.updateMatrixWorld(true);
  let valid=true;this.legs.forEach((ik,i)=>{ik.begin();ik.move(this.feet[i]);if(world(ik.chain.end).distanceTo(this.feet[i])>this.length[i]*1e-5||ik.orientationResidual>1e-4)valid=false;});return valid;
 }
 move(delta){
  if(!delta.toArray().every(Number.isFinite))throw new Error('拖动目标无效');
  this.feedback=[];this.residual=0;if(this.attempt(delta,1))return;
  // 从起点向目标找首个可达区间，超过腿长时缩短本次位移，不偷偷滑脚。
  let low=0,high=1;
  for(let i=1;i<=16;i++){const ratio=i/16;if(!this.attempt(delta,ratio)){high=ratio;break;}low=ratio;}
  for(let i=0;i<20;i++){const mid=(low+high)/2;if(this.attempt(delta,mid))low=mid;else high=mid;}
  if(low>1e-6)this.attempt(delta,low);else this.restore();
  this.feedback=[{joint:this.chain.pelvis.name,reason:'保脚目标不可达，已限制骨盆位移'}];this.residual=delta.length()*(1-low);
 }
 dispose(){this.legs.forEach(ik=>ik.dispose());}
}
