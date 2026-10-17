import {capturePose,applyPose} from '../core/sequence-core.js';
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_ARGUMENT'});

function commitPose(root,draft,candidate){
 const before=capturePose(root);
 try{applyPose(root,candidate);}catch(error){applyPose(root,before);throw error;}
 draft.undo.push(structuredClone(draft.pose));if(draft.undo.length>100)draft.undo.shift();draft.redo=[];draft.pose=candidate;draft.dirty=true;
}

// 整体移动使用骨架公共根骨，不移动glTF场景容器，保证可烘焙到动画轨道。
export function setDraftRoot(root,nodeMap,draft,carrier,position,quaternion){
 const index=nodeMap.get(carrier);
 if(!Number.isInteger(index))throw invalid('整体变换节点无效');
 if(!Array.isArray(position)||position.length!==3||!position.every(Number.isFinite)||!Array.isArray(quaternion)||quaternion.length!==4||!quaternion.every(Number.isFinite)||Math.abs(Math.hypot(...quaternion)-1)>1e-5)throw invalid('整体变换参数无效');
 const candidate=structuredClone(draft.pose);candidate[index].p=position.slice();candidate[index].q=quaternion.slice();commitPose(root,draft,candidate);
}

// 每条历史保存完整节点快照，不共享可变骨骼数组，不复制网格。
export function createPoseDraft(root,modelKey,before){
 const initial=capturePose(root);
 return {modelKey,before,pose:structuredClone(initial),undo:[],redo:[],dirty:true};
}
export function setDraftBones(root,bones,nodeMap,draft,changes,project=null){
 if(!Array.isArray(changes)||!changes.length||changes.length>256)throw invalid('骨骼修改数量必须为1到256');
 const candidate=structuredClone(draft.pose),ids=new Set(),allowed=new Set(bones.map(b=>nodeMap.get(b)));
 for(const change of changes){
  if(!change||Object.keys(change).some(key=>!['id','quaternion','position'].includes(key))||!/^node:\d+$/.test(change.id))throw invalid('骨骼修改结构无效');
  const index=Number(change.id.slice(5)),q=change.quaternion;
  if(!allowed.has(index)||ids.has(index))throw invalid('未知或重复骨骼：'+change.id);
  if(!Array.isArray(q)||q.length!==4||!q.every(Number.isFinite)||Math.abs(Math.hypot(...q)-1)>1e-5)throw invalid('局部四元数必须归一化：'+change.id);
  if(change.position!==undefined&&(!Array.isArray(change.position)||change.position.length!==3||!change.position.every(v=>Number.isFinite(v)&&Math.abs(v)<=100)))throw invalid('局部位置必须为有效模型坐标：'+change.id);
  ids.add(index);candidate[index].q=q.slice();if(change.position!==undefined)candidate[index].p=change.position.slice();
 }
 const constraints=project?project(candidate,changes):null;
 commitPose(root,draft,candidate);
 return {changedBones:changes.length,...(constraints?{constraints}:{})};
}
export function travelDraftHistory(root,draft,direction){
 const from=direction==='undo'?draft.undo:draft.redo,to=direction==='undo'?draft.redo:draft.undo;
 if(!from.length)throw Object.assign(new Error('没有可'+(direction==='undo'?'撤销':'重做')+'的姿势操作'),{code:'NO_HISTORY'});
 const target=from.at(-1),before=capturePose(root);
 try{applyPose(root,target);}catch(error){applyPose(root,before);throw error;}
 to.push(structuredClone(draft.pose));from.pop();draft.pose=structuredClone(target);draft.dirty=true;
}
