import {THREE,modelInfo,compatibleClips} from './three-adapter.js';
import {capturePose} from './sequence-core.js';
import {importPoseClips} from './pose-import.js';

// 仅适配已核对的两份Quaternius人偶导出，不作为外部骨架通用回退。
export function defaultBoneName(name){
 name=name.replace(/^DEF-spine00([123])$/,(_,n)=>'DEF-spine.00'+n).replace(/^(DEF-.*)([LR])$/,(_,base,side)=>base+'.'+side).replace(/^(DEF-(?:f_)?(?:index|middle|pinky|ring|thumb))0([123])\./,(_,base,n)=>base+'.0'+n+'.');
 const fixed={'DEF-hips':'pelvis','DEF-neck':'neck_01','DEF-head':'Head','DEF-spine.001':'spine_01','DEF-spine.002':'spine_02','DEF-spine.003':'spine_03'};
 return fixed[name]??name.replace(/^DEF-/,'').replace(/\.L$/,'_l').replace(/\.R$/,'_r').replace(/^shoulder/,'clavicle').replace(/^upper_arm/,'upperarm').replace(/^forearm/,'lowerarm').replace(/^shin/,'calf').replace(/^toe/,'ball').replace(/^f_/,'').replace(/\.(0[123])/,(_,value)=>'_'+value);
}
function defaultBonePairs(target,source){
 const a=modelInfo(target).bones,b=modelInfo(source).bones,byName=new Map(b.map(bone=>[bone.name,bone]));
 if(a.length!==53||b.length!==65||byName.size!==65)throw new Error('内置姿势包骨架版本不符');
 const pairs=a.map(bone=>{const match=byName.get(defaultBoneName(bone.name));
  if(!match||(bone.parent?.isBone?defaultBoneName(bone.parent.name):'')!==(match.parent?.isBone?match.parent.name:''))throw new Error('内置骨架映射缺失或层级不符：'+bone.name);
  if(bone.position.distanceTo(match.position)>.00001||bone.quaternion.clone().normalize().angleTo(match.quaternion.clone().normalize())>.001||bone.scale.distanceTo(match.scale)>.00001)throw new Error('内置骨架绑定姿态不符：'+bone.name);
  return [bone,match];
 });
 const used=new Set(pairs.map(([,match])=>match));for(const bone of b)if(!used.has(bone)&&(!/_leaf_[lr]$/.test(bone.name)||bone.children.some(child=>child.isBone)))throw new Error('内置骨架存在未知差异：'+bone.name);
 return pairs;
}
export function mappedDefaultActions(target,source,clips){
 const pairs=defaultBonePairs(target,source),names=new Map(pairs.map(([a,b])=>[b.name,a.name]));
 const mapped=clips.map(clip=>{
  const tracks=[];
  for(const original of clip.tracks){const binding=THREE.PropertyBinding.parseTrackName(original.name),name=names.get(binding.nodeName);
   if(!name){if(/_leaf_[lr]$/.test(binding.nodeName))continue;throw new Error('内置动作存在未知轨道：'+original.name);}
   if(binding.objectName||binding.propertyIndex!==undefined||!['position','quaternion','scale'].includes(binding.propertyName))throw new Error('内置动作轨道不支持：'+original.name);
   const track=original.clone();track.name=name+'.'+binding.propertyName;tracks.push(track);
  }
  return new THREE.AnimationClip('UAL2 · '+clip.name,clip.duration,tracks,clip.blendMode);
 });
 return compatibleClips(target,mapped);
}
export function mappedDefaultPoses(target,source,clips){
 const pairs=defaultBonePairs(target,source);
 const targetNodes=[],sourceNodes=[];target.traverse(n=>targetNodes.push(n));source.traverse(n=>sourceNodes.push(n));
 const poses=importPoseClips(source,source,source,clips);
 return poses.map((entry,index)=>{const pose=capturePose(target);for(const [bone,match] of pairs){const value=entry.pose[sourceNodes.indexOf(match)];pose[targetNodes.indexOf(bone)]={p:[...value.p],q:new THREE.Quaternion().fromArray(value.q).normalize().toArray(),s:[...value.s]};}return {id:'builtin:quaternius-pose:'+index,name:entry.name,pose};});
}
