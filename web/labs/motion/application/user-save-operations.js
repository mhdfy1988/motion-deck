import {encodeAction} from '../core/action-codec.js';
import {assetOwner,protectWorkspaceEntry} from '../core/ai-workspace.js';
import {isDefaultPose} from './library-presentation.js';

// 用户确认覆盖与助手命令的拒绝重名语义不同；草稿仍复用工作台唯一保存事务。
export function createUserSaveOperations({state,workbench,confirm,saveEntries,onBusyChange}){
 async function preparePose(){
  if(!state.root||state.busy)return null;
  const overwritePoseId=state.poseDraft?.origin==='user'?state.poseDraft.sourcePoseId:undefined;
  if(!overwritePoseId)return {mode:'prompt',pose:workbench.captureCurrent()};
  const target=state.poses.find(pose=>pose.id===overwritePoseId);
  if(!target||isDefaultPose(target))throw new Error('来源姿势已变化，未保存');
  const expected={modelKey:state.modelKey,revision:workbench.inspect().revision};
  if(!await confirm(`保存后将覆盖“${target.name}”。`,'覆盖','覆盖姿势'))return null;
  return {mode:'overwrite',name:target.name,pose:workbench.captureCurrent(),overwritePoseId,expected};
 }
 async function commit(prepare){
  state.busy=true;onBusyChange();
  try{const plan=prepare();await saveEntries(plan.entries);return plan.apply();}
  finally{state.busy=false;onBusyChange();}
 }
 async function savePose(name,pose,{overwritePoseId,expected}={}){
  if(state.busy||!state.root)return null;
  if(state.poseDraft){
   const assistant=state.poseDraft.origin!=='user';
   const result=await workbench.saveDraft({name,confirmed:true,assistant,overwritePoseId},expected??{modelKey:state.modelKey,revision:workbench.inspect().revision});
   return {kind:'pose',draft:true,overwrite:!!overwritePoseId,...result};
  }
  const duplicate=state.poses.find(entry=>!isDefaultPose(entry)&&entry.name===name);
  if(duplicate&&!await confirm('已有同名姿势，是否覆盖？','覆盖','覆盖姿势'))return null;
  const poses=state.poses.filter(entry=>entry.id!==duplicate?.id);
  const entry={id:duplicate?.id??crypto.randomUUID(),name,pose:structuredClone(pose)};poses.push(entry);
  const workspace=protectWorkspaceEntry(state.aiWorkspace,duplicate?.id);
  return commit(()=>({entries:{actions:state.customs,poses,aiWorkspace:workspace},apply:()=>{
    state.poses=poses;state.aiWorkspace=workspace;
    return {kind:'pose',id:entry.id,name,index:poses.length-1,library:assetOwner(workspace,duplicate?.id)?'ai':'pose'};
  }}));
 }
 async function saveAction(name){
  if(state.busy||!state.items.length)return null;
  const duplicate=state.customs.find(action=>action.name===name);
  if(duplicate&&duplicate.id!==state.editingActionId&&!await confirm('已有同名动作，是否覆盖？','覆盖','覆盖动作'))return null;
  const id=duplicate?.id??(state.customs.find(action=>action.id===state.editingActionId)?.name===name?state.editingActionId:crypto.randomUUID());
  return commit(()=>{
   const action=encodeAction(state.items,id,name,state.root),actions=state.customs.filter(entry=>entry.id!==id),workspace=protectWorkspaceEntry(state.aiWorkspace,id);
   actions.push(action);
   return {entries:{actions,poses:state.poses,aiWorkspace:workspace},apply:()=>{
    state.customs=actions;state.aiWorkspace=workspace;state.editingActionId=id;
    return {kind:'custom',id,name,library:assetOwner(workspace,id)?'ai':'custom'};
   }};
  });
 }
 function actionName(title){return state.customs.find(action=>action.id===state.editingActionId)?.name??(title==='未命名动作'?'':title);}
 return {preparePose,savePose,saveAction,actionName};
}
