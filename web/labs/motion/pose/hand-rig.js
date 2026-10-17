import {Matrix4,Quaternion,Vector3,PropertyBinding,MathUtils} from 'three';

const names=['thumb','index','middle','ring','pinky'],labels=['拇指','食指','中指','无名指','小指'];
const rotation=m=>new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(m)).normalize();
const position=m=>new Vector3().setFromMatrixPosition(m),rad=MathUtils.degToRad;

// 固定两种实际骨架，末端缺leaf时从远节骨真实蒙皮顶点测量，不猜骨长/新增素材骨。
export function calibrateHands(mesh,profile,matrices){
 const bones=mesh.skeleton.bones,find=name=>{const hits=bones.filter(b=>b.name===PropertyBinding.sanitizeNodeName(name));if(hits.length!==1)throw new Error('手骨未标定：'+name);return hits[0];},joints=new Map(),hands=[];
 const p=b=>position(matrices.get(b)),q=b=>rotation(matrices.get(b));
 for(const side of ['l','r']){
  const suffix=side.toUpperCase(),wrist=find(profile==='mesh2motion'?`hand_${side}`:`DEF-hand.${suffix}`);
  const fingers=names.map((name,i)=>({name,label:labels[i],bones:[1,2,3].map(n=>find(profile==='mesh2motion'?`${name}_0${n}_${side}`:`DEF-${name==='thumb'?'thumb':'f_'+name}.0${n}.${suffix}`))}));
  if(fingers.some(f=>f.bones[0].parent!==wrist||f.bones[1].parent!==f.bones[0]||f.bones[2].parent!==f.bones[1]))throw new Error('手指父链不匹配');
  const index=fingers[1].bones[0],pinky=fingers[4].bones[0],thumb=fingers[0].bones[0],middle=fingers[2].bones[0];
  const palm=p(index).sub(p(wrist)).cross(p(pinky).sub(p(wrist))).normalize();
  // 拇指根相对掌面的偏置确定掌心一侧，左右镜像均向掌内，不套世界XYZ。
  if(palm.dot(p(thumb).sub(p(wrist)))<0)palm.negate();
  if(palm.lengthSq()<.99)throw new Error('掌面退化');
  const across=p(index).sub(p(pinky)).normalize(),hand={side,label:side==='l'?'左手':'右手',wrist,mesh,fingers,palm:palm.clone().applyQuaternion(q(wrist).invert()),across:across.clone().applyQuaternion(q(wrist).invert()),bones:fingers.flatMap(f=>f.bones),width:p(index).distanceTo(p(pinky)),length:p(middle).distanceTo(p(wrist))};
  for(const [fi,finger]of fingers.entries()){
   const last=finger.bones[2],lastQ=q(last),direction=p(last).sub(p(finger.bones[1])).normalize();
   if(profile==='mesh2motion'){
    const leaf=find(`${finger.name}_04_leaf_${side}`);if(leaf.parent!==last)throw new Error('指尖父链不匹配');finger.tip=leaf.position.clone();finger.tipSource='leaf';
   }else{
    const index=bones.indexOf(last),inverse=mesh.skeleton.boneInverses[index].clone().multiply(mesh.bindMatrix),vertices=mesh.geometry.attributes.position,weights=mesh.geometry.attributes.skinWeight,indices=mesh.geometry.attributes.skinIndex,localDirection=direction.clone().applyQuaternion(lastQ.clone().invert());let maximum=0;
    for(let v=0;v<vertices.count;v++){let influence=0;for(let k=0;k<4;k++)if(indices.getComponent(v,k)===index)influence+=weights.getComponent(v,k);if(influence<.5)continue;const local=new Vector3().fromBufferAttribute(vertices,v).applyMatrix4(inverse);maximum=Math.max(maximum,local.dot(localDirection));}
    if(maximum<=1e-5||maximum>p(last).distanceTo(p(finger.bones[1]))*2)throw new Error('无法从蒙皮确定指尖：'+last.name);finger.tip=localDirection.multiplyScalar(maximum);finger.tipSource='skin';
   }
   finger.hand=hand;finger.length=p(finger.bones[0]).distanceTo(p(finger.bones[1]))+p(finger.bones[1]).distanceTo(p(last))+finger.tip.length();
   finger.configs=finger.bones.map((bone,i)=>{
    const worldQ=q(bone),z=(i<2?p(finger.bones[i+1]).sub(p(bone)):direction.clone()).normalize();
    // 四指屈曲朝掌内，拇指根允许独立外展/对掌；后两节仍是铰链。
    const toward=fi===0?p(middle).sub(p(bone)).addScaledVector(palm,hand.width*.3):palm.clone(),x=z.clone().cross(toward).normalize(),y=z.clone().cross(x).normalize();if(x.lengthSq()<.99)throw new Error('手指弯曲轴退化');
    const inverse=worldQ.clone().invert(),frame=rotation(new Matrix4().makeBasis(x.clone().applyQuaternion(inverse),y.applyQuaternion(inverse),z.clone().applyQuaternion(inverse)));
    const type=fi===0?(i===0?'thumbBase':'thumbHinge'):(i===0?'fingerBase':'fingerHinge'),limits=fi===0?(i===0?[[-15,65],[-40,40],[-35,35]]:[[0,i===1?65:80],[0,0],[0,0]]):(i===0?[[0,85],[-22,22],[0,0]]:[[0,i===1?105:75],[0,0],[0,0]]);
    const config={name:bone.name,type,kind:i===0?'ball':'hinge',reference:rotation(matrices.get(bone.parent).clone().invert().multiply(matrices.get(bone))),frame,ranges:limits.map(p=>p.map(rad)),axis:x.applyQuaternion(inverse),twistAxis:z.applyQuaternion(inverse),finger:finger.name,side};
    joints.set(bone,config);return config;
   });
  }
  hands.push(hand);
 }
 return {hands,joints};
}

export function fingerTip(finger){const last=finger.bones[2];return last.localToWorld(finger.tip.clone());}
export function handCenter(hand){return hand.wrist.localToWorld(new Vector3(0,hand.length*.65,0));}

// 只按被击中表面的真实蒙皮归属选指，不用最近关节猜测，避免掌面误选。
export function fingerForHit(hand,hit){
 if(hit?.object!==hand.mesh||!hit.face)return null;
 const mesh=hand.mesh,{skinIndex:indices,skinWeight:weights}=mesh.geometry.attributes;let best=null,maximum=.55;
 for(const finger of hand.fingers){let total=0;const accepted=new Set(finger.bones);
  for(const vertex of [hit.face.a,hit.face.b,hit.face.c])for(let k=0;k<4;k++)if(accepted.has(mesh.skeleton.bones[indices.getComponent(vertex,k)]))total+=weights.getComponent(vertex,k);
  if(total/3>maximum){maximum=total/3;best=finger;}
 }return best;
}

// 掌面拾取用实际射线击中的蒙皮三角形权重，不能用大球碰撞抢走前臂或空白。
export function handForHit(hands,hit){
 if(!hit?.object?.isSkinnedMesh||!hit.face)return null;
 const mesh=hit.object,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
 for(const hand of hands){let total=0;const accepted=new Set([hand.wrist,...hand.bones]);for(const v of [hit.face.a,hit.face.b,hit.face.c])for(let k=0;k<4;k++)if(accepted.has(mesh.skeleton.bones[indices.getComponent(v,k)]))total+=weights.getComponent(v,k);if(total/3>.55)return hand;}
 return null;
}
