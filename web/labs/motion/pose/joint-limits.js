import {Matrix4,Quaternion,Vector3,MathUtils,PropertyBinding} from 'three';
import {calibrateHands} from './hand-rig.js';

const rad=MathUtils.degToRad,cache=new WeakMap(),Z=new Vector3(0,0,1);
const fail=message=>Object.assign(new Error(message),{code:'UNSUPPORTED_RIG'});
const layouts=[
 {id:'mesh2motion',body:['pelvis','spine_01','spine_02','spine_03','neck_01','head'],limb:s=>[`clavicle_${s}`,`upperarm_${s}`,`lowerarm_${s}`,`hand_${s}`,`thigh_${s}`,`calf_${s}`,`foot_${s}`],tips:s=>[`index_01_${s}`,`pinky_01_${s}`,`ball_${s}`]},
 {id:'quaternius',body:['DEF-hips','DEF-spine.001','DEF-spine.002','DEF-spine.003','DEF-neck','DEF-head'],limb:s=>[`DEF-shoulder.${s.toUpperCase()}`,`DEF-upper_arm.${s.toUpperCase()}`,`DEF-forearm.${s.toUpperCase()}`,`DEF-hand.${s.toUpperCase()}`,`DEF-thigh.${s.toUpperCase()}`,`DEF-shin.${s.toUpperCase()}`,`DEF-foot.${s.toUpperCase()}`],tips:s=>[`DEF-f_index.01.${s.toUpperCase()}`,`DEF-f_pinky.01.${s.toUpperCase()}`,`DEF-toe.${s.toUpperCase()}`]},
];
// 工程初值而非医学标准。角度处于“绑定姿态+标定关节坐标系”，不直接限制原始XYZ。
const ranges={
 clavicle:[[-25,35],[-25,25],[-25,25]],shoulder:[[-110,140],[-110,110],[-95,95]],
 elbow:[[0,150],[0,0],[-80,80]],wrist:[[-70,70],[-30,30],[-25,25]],
 hip:[[-35,125],[-55,55],[-45,45]],knee:[[0,155],[0,0],[-5,5]],
 ankle:[[-50,30],[-20,20],[-20,20]],pelvis:[[-25,25],[-20,20],[-30,30]],
 spine:[[-25,30],[-20,20],[-25,25]],neck:[[-35,45],[-35,35],[-60,60]],head:[[-25,25],[-20,20],[-35,35]],
};
const uniform=node=>{for(;node;node=node.parent){const s=node.scale.toArray();if(s.some(v=>!Number.isFinite(v)||v<=0)||Math.max(...s)-Math.min(...s)>Math.max(...s)*1e-5)return false;}return true;};
const qFrom=m=>new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(m)).normalize();
const position=m=>new Vector3().setFromMatrixPosition(m);
const canonical=q=>{q.normalize();const halfTurn=Math.abs(q.w)<1e-12;if(halfTurn)q.w=0;const flip=halfTurn?[q.x,q.y,q.z].find(v=>Math.abs(v)>1e-12)<0:q.w<0;if(flip)q.set(-q.x,-q.y,-q.z,-q.w);return q;};

// 输入输出都是局部四元数；摆动用旋转向量椭圆、扭转独立限幅，不作Euler逐轴截断。
export function projectJoint(config,quaternion){
 if(!quaternion.toArray().every(Number.isFinite)||quaternion.lengthSq()<1e-12)throw Object.assign(new Error('关节四元数无效'),{code:'INVALID_ARGUMENT'});
 const input=quaternion.clone().normalize(),relative=canonical(config.reference.clone().invert().multiply(input));
 const q=canonical(config.frame.clone().invert().multiply(relative).multiply(config.frame));
 const twist=new Quaternion(0,0,q.z,q.w);if(twist.lengthSq()<1e-16)twist.identity();else canonical(twist);
 const swing=canonical(q.clone().multiply(twist.clone().invert()));
 const length=Math.hypot(swing.x,swing.y),angle=2*Math.atan2(length,Math.max(0,swing.w));
 let x=length>1e-12?swing.x/length*angle:0,y=length>1e-12?swing.y/length*angle:0;
 const limits=config.ranges.map(pair=>pair.slice());
 if(config.kind==='hinge'){x=MathUtils.clamp(x,...limits[0]);y=0;}
 else if(config.type==='fingerBase'){
  x=Math.max(0,x);const rx=limits[0][1],ry=Math.abs(y<0?limits[1][0]:limits[1][1]);
  // 屈曲越深越难分指。沿同一摆动方向求边界，避免先收窄后投椭圆导致二次投影漂移。
  const inside=t=>{const factor=Math.max(0,1-t*x/rx);return Math.hypot(t*x/rx,Math.abs(t*y)<1e-12?0:factor>1e-12?t*y/(ry*factor):Infinity)<=1+1e-12;};
  if(!inside(1)){let low=0,high=1;for(let i=0;i<42;i++){const mid=(low+high)/2;if(inside(mid))low=mid;else high=mid;}x*=low;y*=low;}
 }
 else{
  const rx=Math.abs(x<0?limits[0][0]:limits[0][1]),ry=Math.abs(y<0?limits[1][0]:limits[1][1]);
  if(rx===0)x=0;if(ry===0)y=0;
  const ellipse=Math.hypot(rx?x/rx:0,ry?y/ry:0);if(ellipse>1){x/=ellipse;y/=ellipse;}
 }
 const t=MathUtils.clamp(2*Math.atan2(twist.z,twist.w),...limits[2]),a=Math.hypot(x,y);
 const restricted=a>1e-12?new Quaternion().setFromAxisAngle(new Vector3(x/a,y/a,0),a):new Quaternion();
 restricted.multiply(new Quaternion().setFromAxisAngle(Z,t));
 const result=config.reference.clone().multiply(config.frame).multiply(restricted).multiply(config.frame.clone().invert()).normalize();
 const error=input.angleTo(result),clamped=error>1e-6;
 // 原本合法时保留原始分量，避免无操作造成历史/保存漂移及q/-q符号改写。
 return {quaternion:clamped?result:quaternion.clone(),clamped,error,angles:[x,y,t].map(MathUtils.radToDeg)};
}

export function calibrateJointLimits(root){
 const unsupported=reason=>({supported:false,reason,profile:null,joints:new Map(),roots:[],twistBones:[]});
 const meshes=[];root.traverse(n=>{if(n.isSkinnedMesh)meshes.push(n);});
 for(const mesh of meshes)for(const layout of layouts){
  const named=name=>mesh.skeleton.bones.filter(b=>b.name===PropertyBinding.sanitizeNodeName(name));
  const names=[...layout.body,...layout.limb('l'),...layout.limb('r'),...layout.tips('l'),...layout.tips('r')];
  if(names.some(n=>named(n).length!==1))continue;
  if(!uniform(mesh)||mesh.skeleton.bones.some(b=>!uniform(b)))return unsupported('关节标定不支持非均匀或反向缩放');
  const body=layout.body.map(n=>named(n)[0]),left=layout.limb('l').map(n=>named(n)[0]),right=layout.limb('r').map(n=>named(n)[0]);
  if(body.slice(1).some((b,i)=>b.parent!==body[i])||[left,right].some(l=>l[1].parent!==l[0]||l[2].parent!==l[1]||l[3].parent!==l[2]||l[4].parent!==body[0]||l[5].parent!==l[4]||l[6].parent!==l[5]))return unsupported('骨链层级与标定配置不匹配');
  const matrices=new Map(mesh.skeleton.bones.map((b,i)=>[b,mesh.skeleton.boneInverses[i].clone().invert()]));
  if([...matrices.values()].some(m=>!m.elements.every(Number.isFinite)||Math.abs(m.determinant())<1e-12))return unsupported('绑定矩阵无效');
  const p=b=>position(matrices.get(b)),q=b=>qFrom(matrices.get(b));
  const up=p(body.at(-1)).sub(p(body[0])).normalize(),side=p(left[4]).sub(p(right[4])).normalize(),forward=side.clone().cross(up).normalize();
  if(forward.lengthSq()<.99)return unsupported('绑定姿态方向退化');
  const joints=new Map();
  function add(bone,kind,direction,bendToward,type){
   const worldQ=q(bone),d=direction.normalize();let flex=d.clone().cross(bendToward).normalize();
   if(d.lengthSq()<.99||flex.lengthSq()<.99)throw fail('标定骨轴退化：'+bone.name);
   const inv=worldQ.clone().invert(),z=d.applyQuaternion(inv),x=flex.applyQuaternion(inv),y=z.clone().cross(x).normalize();
   const frame=qFrom(new Matrix4().makeBasis(x,y,z));
   const parent=matrices.get(bone.parent);if(!parent)throw fail('标定缺少父骨绑定矩阵：'+bone.name);
   const reference=qFrom(parent.clone().invert().multiply(matrices.get(bone)));
   joints.set(bone,{name:bone.name,kind,type,reference,frame,ranges:ranges[type].map(pair=>pair.map(rad)),axis:x,twistAxis:z});
  }
  try{
   body.forEach((b,i)=>add(b,'ball',i<body.length-1?p(body[i+1]).sub(p(b)):up.clone(),forward.clone(),i===0?'pelvis':i===4?'neck':i===5?'head':'spine'));
   for(const [side,limb] of [['l',left],['r',right]]){
    const [clav,arm,fore,hand,thigh,shin,foot]=limb;
    const [index,pinky,toe]=layout.tips(side).map(n=>named(n)[0]);
    if(index.parent!==hand||pinky.parent!==hand||toe.parent!==foot)throw fail('掌面/脚掌标定层级不匹配');
    const palm=p(index).sub(p(hand)).cross(p(pinky).sub(p(hand))).normalize();
    add(clav,'ball',p(arm).sub(p(clav)),forward.clone(),'clavicle');
    add(arm,'ball',p(fore).sub(p(arm)),forward.clone(),'shoulder');
    add(fore,'hinge',p(hand).sub(p(fore)),forward.clone(),'elbow');
    add(hand,'ball',p(hand).sub(p(fore)),palm,'wrist');
    add(thigh,'ball',p(shin).sub(p(thigh)),forward.clone(),'hip');
    add(shin,'hinge',p(foot).sub(p(shin)),forward.clone().negate(),'knee');
    add(foot,'ball',p(toe).sub(p(foot)),up.clone(),'ankle');
   }
  }catch(error){return unsupported(error.message);}
  let hands=[],handReason=null;try{const result=calibrateHands(mesh,layout.id,matrices);hands=result.hands;for(const [bone,config]of result.joints)joints.set(bone,config);}catch(error){handReason=error.message;}
  return {supported:true,reason:null,profile:layout.id,joints,hands,handReason,roots:mesh.skeleton.bones.filter(b=>!b.parent?.isBone),twistBones:mesh.skeleton.bones.filter(b=>/twist/i.test(b.name)).map(b=>b.name),axes:{up:up.toArray(),left:side.toArray(),forward:forward.toArray()}};
 }
 return unsupported('未标定骨架：自然约束不可用，请显式选择自由编辑');
}

export function jointLimits(root){if(!cache.has(root))cache.set(root,calibrateJointLimits(root));return cache.get(root);}
export function constrainBone(root,bone,quaternion,mode='natural'){
 if(!['natural','free'].includes(mode))throw Object.assign(new Error('约束模式无效'),{code:'INVALID_ARGUMENT'});
 if(mode==='free')return {quaternion:quaternion.clone(),clamped:false,status:'free'};
 const rig=jointLimits(root);
 // 唯一根的整体变换不属于解剖关节；未知骨架仍需显式自由编辑。
 if(!rig.supported)throw fail(rig.reason);
 const config=rig.joints.get(bone);
 if(!config)return {quaternion:quaternion.clone(),clamped:false,status:rig.roots.includes(bone)?'root':'unmanaged'};
 return {...projectJoint(config,quaternion),status:'calibrated',joint:config.name};
}
export function enforceBones(root,bones,mode='natural'){
 const results=bones.map(bone=>({bone,...constrainBone(root,bone,bone.quaternion,mode)}));
 for(const result of results)result.bone.quaternion.copy(result.quaternion);
 root.updateMatrixWorld(true);
 return results.filter(r=>r.clamped).map(r=>({joint:r.bone.name,error:r.error,angles:r.angles}));
}
export function constraintSummary(root,mode='natural'){
 if(!root)return {mode,supported:false,profile:null,violations:[],reason:'模型未就绪'};
 const rig=jointLimits(root),violations=[];
 for(const [bone,config] of rig.joints){const result=projectJoint(config,bone.quaternion);if(result.clamped)violations.push({joint:bone.name,error:result.error});}
 return {mode,supported:rig.supported,profile:rig.profile,reason:rig.reason,calibrated:rig.joints.size,hands:rig.hands?.map(h=>h.side)??[],handReason:rig.handReason??null,twistBones:rig.twistBones,violations};
}
