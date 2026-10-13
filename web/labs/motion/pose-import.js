import {THREE,assertSameRig,compatibleClips} from './three-adapter.js';
import {capturePose} from './sequence-core.js';

// 外部姿势只接受固定的骨架动画，不把连续动作第一帧悄悄当成完整姿势包。
export function importPoseClips(target,rig,source,clips){
 assertSameRig(rig,source);
 if(!clips.length)throw new Error('文件没有姿势动画；静态模型不能自动认定为骨架姿势');
 const nodes=[];target.traverse(node=>nodes.push(node));
 return clips.map(clip=>{
  if(!Number.isFinite(clip.duration)||clip.duration<0||!clip.validate()||!clip.tracks.length)throw new Error('姿势轨道无效');
  // 单关键帧动画时长可以为0；仅借助已有绑定检查，不修改原动画。
  const check=clip.clone();check.duration=Math.max(.001,clip.duration);compatibleClips(target,[check]);
  const pose=capturePose(rig);
  for(const track of clip.tracks){
   const binding=THREE.PropertyBinding.parseTrackName(track.name),node=THREE.PropertyBinding.findNode(target,binding.nodeName),index=nodes.indexOf(node),size=track.getValueSize();
   if(index<0||!node.isBone)throw new Error('姿势仅支持骨骼的位置、旋转与缩放轨道');
   const values=Array.from(track.values),first=values.slice(0,size);
   for(let offset=size;offset<values.length;offset+=size){const next=values.slice(offset,offset+size);const same=binding.propertyName==='quaternion'?new THREE.Quaternion().fromArray(first).normalize().angleTo(new THREE.Quaternion().fromArray(next).normalize())<.0001:first.every((v,i)=>Math.abs(v-next[i])<.00001);if(!same)throw new Error(`“${clip.name}”是连续动作，请用导入动作后定位并保存姿势`);}
   if(!first.every(Number.isFinite))throw new Error('姿势数值无效');
   pose[index][{position:'p',quaternion:'q',scale:'s'}[binding.propertyName]]=first;
  }
  return {id:crypto.randomUUID(),name:clip.name||'导入姿势',pose};
 });
}
