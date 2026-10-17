import {assetOwner} from '../core/ai-workspace.js';

export const isDefaultPose=pose=>pose.id.startsWith('builtin:');

// 展示模型只描述条目，不持有DOM、骨架、草稿或另一份素材状态。
export function assetPresentation(asset,kind,duration){
 const readonly=kind==='pose'&&isDefaultPose(asset);
 return {
  kind,id:asset.id,name:asset.name,readonly,
  meta:kind==='pose'?'姿势':duration.toFixed(2)+' s',
  title:readonly?'默认姿势 · 不可删除':kind==='pose'?'单击查看 · 拖入时间轴':'单击查看 · 拖入使用'
 };
}

export function sourcePresentations(clips,displayAction){
 return clips.map((clip,index)=>({
  kind:'source',index,name:displayAction(clip.name),clipName:clip.name,
  searchName:clip.name+' '+displayAction(clip.name),
  meta:clip.duration.toFixed(2)+' s',title:clip.name+' · 单击预览，拖到时间轴放置'
 }));
}

export function createLibraryPresentation({activeLibrary,clips,poses,customs,aiWorkspace},getDuration){
 const tab=activeLibrary==='pose'?'pose':activeLibrary==='ai'?'ai':'action';
 const ordinaryPoses=poses.filter(pose=>!assetOwner(aiWorkspace,pose.id));
 const ordinaryActions=customs.filter(action=>!assetOwner(aiWorkspace,action.id));
 let groups=[];
 if(tab==='pose'){
  const expanded=ordinaryPoses.some(pose=>!isDefaultPose(pose))?'custom':'default';
  groups=[['default','默认姿势库'],['custom','自定义姿势库']].map(([key,label])=>({
   key,id:'pose-library-'+key,label,open:key===expanded,
   entries:ordinaryPoses.filter(pose=>isDefaultPose(pose)===(key==='default')).map(pose=>({...assetPresentation(pose,'pose'),editPose:true})),
   empty:key==='custom'?'暂无自定义姿势':'此模型暂无默认姿势'
  }));
 }else if(tab==='action'){
  groups=[['default','默认动作库'],['thirdparty','第三方动作库'],['custom','自定义动作库']].map(([key,label])=>({
   key,id:'library-'+key,label,open:activeLibrary===key,
   entries:key==='custom'?ordinaryActions.map(action=>assetPresentation(action,'custom',getDuration(action))):
    clips.flatMap((clip,index)=>!!clip.thirdParty===(key==='thirdparty')?[{kind:'source',index}]:[]),
   empty:key==='custom'?'暂无自定义动作':key==='thirdparty'?'暂无第三方动作':'此模型暂无默认动作'
  }));
 }
 return {
  tab,groups,
  count:tab==='ai'?aiWorkspace.tasks.reduce((sum,task)=>sum+task.entries.filter(entry=>entry.state!=='trash').length,0):tab==='pose'?ordinaryPoses.length:clips.length+ordinaryActions.length,
  empty:tab==='pose'&&!poses.length?'导入姿势，或从预览中保存':''
 };
}
