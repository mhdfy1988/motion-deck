import * as THREE from 'three';
import valid from './library-validator.generated.js';
import {actionRange,makeCompositeClip} from './sequence-core.js';
// 动作编解码与校验不依赖界面或存储，保持已有库协议。
export function encodeAction(items,id,name,root,depth=0){
 if(depth>8)throw new Error('合并动作嵌套不能超过8层');
 const clips=[],indices=new Map();
 const nodes=[];root?.traverse(node=>nodes.push(node));
 const saved=items.map(item=>{const row={kind:item.kind,name:item.name,transition:item.transition??0};if(item.duration!==undefined)row.duration=item.duration;
  if(item.kind==='action'){actionRange(item);if(!indices.has(item.clip)){indices.set(item.clip,clips.length);const json=item.clip.toJSON();if(item.clip.recipeItems)json.recipe=encodeAction(item.clip.recipeItems,'embedded',item.clip.name,root,depth+1);for(const track of json.tracks){const binding=THREE.PropertyBinding.parseTrackName(track.name),index=nodes.findIndex(node=>node.uuid===binding.nodeName);if(index>=0)track.nodeIndex=index;}clips.push(json);}row.clipIndex=indices.get(item.clip);if(item.in!==undefined)row.in=item.in;if(item.out!==undefined)row.out=item.out;}else row.pose=structuredClone(item.pose);
  return row;
 });
 return {id,name:name.trim(),clips,items:saved};
}
export function decodeAction(action,rootOrCount,depth=0){
 if(depth>8)throw new Error('合并动作嵌套不能超过8层');
 const nodes=[];if(typeof rootOrCount!=='number')rootOrCount.traverse(node=>nodes.push(node));const nodeCount=typeof rootOrCount==='number'?rootOrCount:nodes.length;
 // 无名称节点的动画绑定可能使用运行时UUID；按同一模型的稳定节点顺序恢复绑定。
 const clips=action.clips.map(json=>{if(json.recipe){const clip=makeCompositeClip(decodeAction(json.recipe,rootOrCount,depth+1),json.name);if(Math.abs(clip.duration-json.duration)>1e-6)throw new Error('合并动作时长与内容不一致');return clip;}const saved=structuredClone(json);for(const track of saved.tracks)if(track.nodeIndex!==undefined){const node=nodes[track.nodeIndex];if(!node)throw new Error('保存的动画节点缺失');const binding=THREE.PropertyBinding.parseTrackName(track.name);track.name=track.name.replace(binding.nodeName,node.uuid);delete track.nodeIndex;}const clip=THREE.AnimationClip.parse(saved);if(!clip.validate())throw new Error('保存的动作关键帧损坏');return clip;});
 return action.items.map(item=>{const result={...item,id:crypto.randomUUID()};delete result.clipIndex;
  if(item.kind==='action'){result.clip=clips[item.clipIndex];if(!result.clip)throw new Error('保存的源动作缺失');actionRange(result);}else if(!item.pose||item.pose.length!==nodeCount)throw new Error('保存的姿势与当前模型不匹配');
  return result;
 });
}
export function validateLibrary(data,key){
 if(!valid(data)||data.modelKey!==key)throw new Error('自定义动作库数据损坏或模型不匹配');
 if(data.version===1&&[...data.actions,...(data.thirdParty??[])].some(a=>a.clips.some(c=>c.recipe)))throw new Error('合并动作需要版本2的保存格式');
 if(new Set(data.actions.map(a=>a.id)).size!==data.actions.length||new Set(data.actions.map(a=>a.name)).size!==data.actions.length)throw new Error('自定义动作库存在重复条目');
 const poses=data.poses??[];
 const external=data.thirdParty??[];
 if(new Set(external.map(a=>a.id)).size!==external.length||external.some(a=>a.items.length!==1||a.items[0].kind!=='action'))throw new Error('第三方动作库记录无效');
 if(new Set(poses.map(p=>p.id)).size!==poses.length||new Set(poses.map(p=>(p.id.startsWith('builtin:')?'default:':'custom:')+p.name)).size!==poses.length)throw new Error('姿势库存在重复条目');
 return data;
}
export function validatePoses(poses,root){let count=0;root.traverse(()=>count++);for(const pose of poses)if(pose.pose.length!==count)throw new Error('保存的姿势与当前模型不匹配');}
