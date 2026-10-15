import {Matrix4,Quaternion,Vector3} from 'three';

// 输出策略不写进姿势或动作配方；去掉的是相对动作首帧的世界位移，不是根高度归零。
export function rootMotionOptions(value={horizontal:true,vertical:true}){
 if(!value||Object.keys(value).some(k=>!['horizontal','vertical'].includes(k))||typeof value.horizontal!=='boolean'||typeof value.vertical!=='boolean')throw Object.assign(new Error('位移设置须包含horizontal和vertical布尔值'),{code:'INVALID_ARGUMENT'});
 return {horizontal:value.horizontal,vertical:value.vertical};
}
export function createRootMotionFilter(root,reference,options){
 const policy=rootMotionOptions(options);if(policy.horizontal&&policy.vertical)return pose=>pose;
 const nodes=[],indices=new Map();root.traverse(n=>{indices.set(n,nodes.length);nodes.push(n);});
 const roots=nodes.filter(n=>n.isBone&&!n.parent?.isBone);
 const unsupported=()=>Object.assign(new Error('位移过滤要求唯一骨架根及可逆父变换'),{code:'UNSUPPORTED_RIG'});
 if(roots.length!==1)throw unsupported();
 const carrier=roots[0],index=indices.get(carrier),chain=[];for(let n=carrier.parent;n&&indices.has(n);n=n.parent)chain.unshift(indices.get(n));
 const external=root.parent;external?.updateWorldMatrix(true,false);
 const outside=external?external.matrixWorld.clone():new Matrix4(),p=new Vector3(),q=new Quaternion(),s=new Vector3(),local=new Matrix4();
 function parentMatrix(pose){const matrix=outside.clone();for(const i of chain){const v=pose[i];matrix.multiply(local.compose(p.fromArray(v.p),q.fromArray(v.q),s.fromArray(v.s)));}if(Math.abs(matrix.determinant())<1e-12)throw unsupported();return matrix;}
 const origin=new Vector3().fromArray(reference[index].p).applyMatrix4(parentMatrix(reference));
 return pose=>{
  const parent=parentMatrix(pose),world=new Vector3().fromArray(pose[index].p).applyMatrix4(parent);
  if(!policy.horizontal){world.x=origin.x;world.z=origin.z;}if(!policy.vertical)world.y=origin.y;
  const result=pose.slice();result[index]={...pose[index],p:world.applyMatrix4(parent.invert()).toArray()};return result;
 };
}
