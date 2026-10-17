import {assetOwner} from '../core/ai-workspace.js';
import {isDefaultPose} from './library-presentation.js';

// 素材维护复用工作台剪贴板/重命名/AI事务及同一存储适配。
export function createLibraryManagement({state,workbench,confirm,persist,onBusyChange}){
 function target({kind,id}){return (kind==='pose'?state.poses:state.customs).find(entry=>entry.id===id);}
 function renameRequest(identity){
  if(state.busy||state.poseDraft)return null;
  const entry=target(identity);if(!entry||identity.kind==='pose'&&isDefaultPose(entry))return null;
  const current=workbench.inspect();return {...identity,name:entry.name,expected:{modelKey:current.modelKey,revision:current.revision}};
 }
 async function remove(identity){
  if(state.busy)return null;
  const owner=assetOwner(state.aiWorkspace,identity.id);
  if(owner){
   if(!await confirm('将此AI素材移入可恢复的回收区？已放入编排的内容不变。','移入回收区','整理AI素材'))return null;
   await workbench.aiWorkspace.trash({taskId:owner.task.id,assetId:owner.entry.assetId,confirmed:true});
   return {trashed:true};
  }
  const entry=target(identity),pose=identity.kind==='pose';
  if(!entry||pose&&isDefaultPose(entry))return {readonly:true};
  if(!await confirm('删除“'+entry.name+'”？已放入时间轴的片段保留，素材删除不能撤销。','删除','删除素材'))return null;
  state.busy=true;onBusyChange();
  try{
   const poses=pose?state.poses.filter(item=>item.id!==entry.id):state.poses,actions=pose?state.customs:state.customs.filter(item=>item.id!==entry.id);
   await persist({actions,poses});
   state.poses=poses;state.customs=actions;
   const resetActionTitle=!pose&&state.editingActionId===entry.id,resetPreview=!pose&&state.mode==='custom'&&state.customPreview?.id===entry.id;
   if(resetActionTitle)state.editingActionId=null;if(resetPreview)state.customPreview=null;
   return {name:entry.name,resetActionTitle,resetPreview};
  }finally{state.busy=false;onBusyChange();}
 }
 function pasteKind(library){return library==='ai'?(workbench.libraryClipboard.inspect()?.kind??'custom'):library==='pose'?'pose':'custom';}
 function copy(identity){
  if(identity.kind!=='source')return workbench.libraryClipboard.copy(identity);
  const clip=state.clips[identity.index];return workbench.libraryClipboard.copy({kind:'action',id:clip.libraryId??`source:${identity.index}:${clip.name}`});
 }
 async function paste(library){const kind=pasteKind(library);return {kind,...await workbench.libraryClipboard.paste(kind)};}
 function menu(library){const clipboard=workbench.libraryClipboard.inspect(),kind=pasteKind(library);return {kind,copyDisabled:state.busy,pasteDisabled:state.busy||!!state.poseDraft||!clipboard||clipboard.kind!==kind||clipboard.modelKey!==state.modelKey};}
 return {renameRequest,remove,copy,paste,menu};
}
