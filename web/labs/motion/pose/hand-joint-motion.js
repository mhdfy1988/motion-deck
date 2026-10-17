import {Quaternion,Vector2,Vector3,Matrix3,MathUtils} from 'three';
import {projectJoint} from './joint-limits.js';

const rad=MathUtils.degToRad;
// 控制角属于标定关节空间，不把原骨XYZ或模型位置作为可编辑状态。
export function jointAngles(config,q){return projectJoint({...config,type:'controlAngles',kind:'ball',ranges:[[-Math.PI,Math.PI],[-Math.PI,Math.PI],[-Math.PI,Math.PI]]},q).angles.map(rad);}
export function jointRotation(config,angles){
 const [x,y,t]=angles,a=Math.hypot(x,y),s=a?new Quaternion().setFromAxisAngle(new Vector3(x/a,y/a,0),a):new Quaternion();
 return config.reference.clone().multiply(config.frame).multiply(s.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),t))).multiply(config.frame.clone().invert()).normalize();
}
export function handAngleCandidate(config,initial,delta,mode){
 const angles=jointAngles(config,initial).map((v,i)=>v+(delta[i]??0));
 // 小样工程初值：拇指根屈曲联动受限转向；不把对掌转向塞进末节。
 if(config.type==='thumbBase'&&mode==='natural')angles[2]+=(delta[0]??0)*.4;
 const q=jointRotation(config,angles);return mode==='natural'?projectJoint(config,q):{quaternion:q,clamped:false};
}

// 屏幕空间低维阻尼步进；候选先限位再投影验算，不退回已知会反向的三维追点路径。
export function dragHandJoint({bone,node,config,camera,delta,mode='natural',pixels=new Vector2(500,500)}){
 // 不因选中/零输入修正旧姿势。真正拖动时只校正当前一骨，并以合法姿态建立增量基准。
 const before=bone.quaternion.clone();
 if(delta.lengthSq()<1e-16)return {residual:0,limited:false,changed:false,recovered:false};
 const recovery=mode==='natural'?projectJoint(config,before):null;
 if(recovery?.clamped){bone.quaternion.copy(recovery.quaternion);bone.updateWorldMatrix(true,true);}
 const original=bone.quaternion.clone(),point=()=>node.getWorldPosition(new Vector3()).project(camera),start=point(),target=new Vector2(start.x+delta.x,start.y+delta.y),params=[0,0,0];
 const update=()=>bone.updateWorldMatrix(true,true),project=()=>{const p=point();return new Vector2(p.x,p.y);},cost=p=>p.clone().sub(target).multiply(pixels).lengthSq();
 let best=original.clone(),bestPoint=new Vector2(start.x,start.y),bestCost=cost(bestPoint),limited=false;
 const sample=values=>{const c=handAngleCandidate(config,original,values,mode);bone.quaternion.copy(c.quaternion);update();return {p:project(),q:c.quaternion,limited:c.clamped};};
 const accept=(s,values)=>{const movement=s.p.clone().sub(new Vector2(start.x,start.y)),forward=movement.clone().multiply(pixels).dot(delta.clone().multiply(pixels));const error=cost(s.p);
  if(forward>=-1e-7&&error<bestCost-1e-7&&s.q.angleTo(original)<.4){bestCost=error;best.copy(s.q);bestPoint.copy(s.p);params.splice(0,3,...values);limited=s.limited;return true;}return false;};
 for(let k=0;k<10;k++){
  const current=params.slice(),cols=[];
  for(let i=0;i<2;i++){const a=current.slice(),b=current.slice();a[i]+=.002;b[i]-=.002;cols.push(sample(a).p.sub(sample(b).p).multiply(pixels).multiplyScalar(250));}
  const error=target.clone().sub(bestPoint).multiply(pixels),[u,v]=cols,A=u.dot(u)+36,B=u.dot(v),C=v.dot(v)+36,step=new Vector3(u.dot(error),v.dot(error),0).applyMatrix3(new Matrix3().set(A,B,0,B,C,0,0,0,1).invert());
  // 两轴必须同比缩步；分别clamp会改变阻尼解方向，甚至把可改善候选变成反向。
  step.multiplyScalar(Math.min(1,.1/Math.max(Math.abs(step.x),Math.abs(step.y),1e-12)));
  let improved=false;
  for(const scale of [1,.5,.25]){const candidate=current.slice();candidate[0]+=step.x*scale;candidate[1]+=step.y*scale;if(accept(sample(candidate),candidate)){improved=true;break;}}
  if(!improved)break;
 }
 bone.quaternion.copy(best);update();return {residual:Math.sqrt(bestCost),limited:limited||!!recovery?.clamped,changed:best.angleTo(before)>1e-7,recovered:!!recovery?.clamped};
}
