import {THREE,modelInfo,compatibleClips} from './three-adapter.js';
import {mappedDefaultActions} from './default-poses.js';
import {capturePose,applyPose,PoseSampler} from './sequence-core.js';

// 只处理固定版本官方Mesh2Motion人体附加包，不放宽外部assertSameRig。
export function mesh2motionAddonActions(target,source,clips){
 const a=modelInfo(target).bones,b=modelInfo(source).bones,map=new Map(a.map(bone=>[bone.name,bone]));
 if(a.length!==66||b.length!==66||map.size!==66)throw new Error('Mesh2Motion附加包骨架版本不符');
 for(const bone of b){const match=map.get(bone.name);if(!match||(bone.parent?.isBone?bone.parent.name:'')!==(match.parent?.isBone?match.parent.name:''))throw new Error('Mesh2Motion附加包层级不符：'+bone.name);}
 return compatibleClips(target,clips.map(clip=>{const tracks=[];for(const original of clip.tracks){const binding=THREE.PropertyBinding.parseTrackName(original.name);if(binding.objectName||binding.propertyIndex!==undefined||!['position','quaternion','scale'].includes(binding.propertyName)||!map.has(binding.nodeName))throw new Error('Mesh2Motion未知附加轨道：'+original.name);
  // 与官方AnimationUtility.clean_track_data一致：旋转＋骨盆位置，RM才保留root位置；不改四肢长度。
  if(binding.propertyName==='quaternion'||binding.propertyName==='position'&&(binding.nodeName==='pelvis'||binding.nodeName==='root'&&/rm$/i.test(clip.name)))tracks.push(original.clone());
 }return new THREE.AnimationClip('M2M Addon · '+clip.name,clip.duration,tracks,clip.blendMode);}));
}
export function quaterniusRootMotionActions(target,source,clips,existing,prefix='UAL2'){
 const variants=mappedDefaultActions(target,source,clips),result=[];
 for(const variant of variants){const original=existing.find(clip=>clip.name===variant.name);if(!original)throw new Error('根位移动作缺少原地对照：'+variant.name);
  // 只新增根位移确有变化的版本，不把整包原样重复一遍。
  const changed=variant.tracks.some(track=>{const binding=THREE.PropertyBinding.parseTrackName(track.name);if(binding.nodeName!=='root'||binding.propertyName==='scale')return false;const other=original.tracks.find(t=>t.name===track.name);return !other||other.values.length!==track.values.length||track.values.some((value,i)=>Math.abs(value-other.values[i])>1e-5);});
  if(changed){variant.name=variant.name.replace(/^UAL2/,prefix)+' · 根位移';result.push(variant);}
 }return result;
}
const addonPoses=[['Rest Pose','标准站姿',.5],['Fighting Idle','格斗准备',.5],['Bow Pull Hold','拉弓瞄准',.5],['Meditate','盘坐冥想',.5],['Sleeping','躺卧睡眠',.5],['Ledge Hang','悬挂攀边',.5],['Ladder_Idle','攀梯停留',.5],['Glide','张臂滑翔',.5],['Flying Forward Super','超人飞行',.5],['Backflip','后空翻腾空',.5],['Land_Three_Point','三点落地',.75],['Kneeling Tired','疲惫跪姿',.5],['Victory Fist Pump','举拳庆祝',.5],['Attack_Ground_Pound','砸地攻击',.5],['Two-hand Blast','双手释放',.5],['Run_Anime','前倾跑步',.5]];
export function mesh2motionAddonPoses(root,clips){
 const visible=capturePose(root),sampler=new PoseSampler(root);try{return addonPoses.map(([name,label,ratio])=>{const clip=clips.find(c=>c.name==='M2M Addon · '+name);if(!clip)throw new Error('附加姿势来源动作缺失：'+name);return {id:'builtin:mesh2motion-addon-pose:'+name,name:label,pose:sampler.sample(clip,clip.duration*ratio)};});}finally{sampler.dispose();applyPose(root,visible);}
}
export async function verifiedBuiltinFile(url,name,sha256){const response=await fetch(url);if(!response.ok)throw new Error('内置扩充资源未准备：'+name);const bytes=await response.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==sha256)throw new Error('内置扩充资源版本变化：'+name);return new File([bytes],name);}
