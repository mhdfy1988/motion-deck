import {emptyWorkspace,assetOwner} from '../core/ai-workspace.js';
import {isDefaultPose} from './library-presentation.js';

// 管理原会话的模型切换；文件解析/场景资源/菜单DOM分别由现有适配器承担。
export function createModelLifecycle({state,workbench,builtins,storage,prepareModel,fetchModelFiles,modelScene,history,confirm,message,onBusyChange,refreshMenu,syncMenu,onInstalled,onReady,onRestored}){
 function menuState(){return {modelKey:state.modelKey,builtinId:state.model?.builtinId,hasRoot:!!state.root};}
 function busy(value){state.busy=value;onBusyChange();}
 async function allowSwitch(){
  if(state.busy)return false;
  if(state.poseDraft){
   if(!await confirm(state.poseDraft.origin==='user'?'姿势修改尚未保存，放弃修改再切换模型？':'助手姿势尚未保存，放弃试摆再切换模型？','放弃','离开姿势草稿'))return false;
   workbench.discardDraft();
  }
  return !state.items.length||await confirm('切换模型会清空当前未保存的编排，已保存内容保留。是否继续？','切换','切换模型');
 }
 async function importModel(files,builtin=null){
  if(state.busy)return false;
  busy(true);message('正在导入模型…');let candidate,published=false,retiring=false,committed=false;
  try{
   const retainedFiles=[...files],key=await storage.modelKey(retainedFiles),savedLibrary=await storage.readLibrary(key);
   candidate=await prepareModel(retainedFiles,{savedLibrary,builtin,builtins});
   // 保存完整模型资料与恢复指针后，才触碰旧场景；不承诺发布后UI失败也能回滚。
   await storage.saveLibrary(candidate.data,retainedFiles);committed=true;await refreshMenu();
   retiring=true;state.playing=false;modelScene.releaseCurrent();
   state.sampler=null;state.helper=null;state.selection.clear();state.anchor=null;history.reset();
   state.root=candidate.root;published=true;state.rig=candidate.rig;state.sampler=modelScene.createSampler(state.root);
   state.clips=candidate.clips;state.model=candidate.metadata;state.modelKey=key;state.modelFiles=retainedFiles;
   state.customs=savedLibrary.actions;state.aiWorkspace=structuredClone(savedLibrary.aiWorkspace??emptyWorkspace());state.editingActionId=null;
   state.bones=candidate.info.bones;state.rootMotion={horizontal:true,vertical:true};state.poses=structuredClone(candidate.poses);
   state.items=[];state.selected=-1;state.selectedTransition=false;state.sequence=null;state.time=0;state.sourceTime=0;state.customPreview=null;state.playing=false;
   modelScene.attach(candidate);onInstalled(candidate);
   state.busy=false;onReady(candidate);syncMenu();
   message(`已载入 · ${state.bones.length} 骨骼 · ${state.clips.length} 动作${state.poses.length?' · '+state.poses.length+' 姿势':''}`);return true;
  }catch(error){
   let cleanupError;
   try{
    if(published)modelScene.releaseCurrent();
    else if(candidate)modelScene.releaseCandidate(candidate);
   }catch(cause){cleanupError=cause;}
   if(retiring){
    // 已开始释放旧场景，不能再暴露旧采样器或半初始化的新模型。
    Object.assign(state,{root:null,rig:null,sampler:null,helper:null,model:null,modelKey:null,modelFiles:[],clips:[],bones:[],poses:[],customs:[],items:[],sequence:null,customPreview:null,playing:false,poseDraft:null,selected:-1,selectedTransition:false,anchor:null,time:0,sourceTime:0,customTime:0,sourceIndex:0,editingActionId:null,aiWorkspace:emptyWorkspace()});
    state.selection.clear();
   }
   const status=retiring?'（新模型已提交，初始化未完成；请重新加载模型）':committed?'（新模型已保存，原场景保留）':state.root?'（原模型保留）':'';
   message(`导入失败：${error.message}${status}${cleanupError?'；资源清理失败：'+cleanupError.message:''}`,true);return false;
  }finally{state.busy=false;syncMenu();onBusyChange();}
 }
 async function demo(names,prefix,builtin=null){
  if(state.busy||!await allowSwitch())return;
  busy(true);message('正在载入模型…');
  try{const files=await fetchModelFiles(names,prefix,builtin);state.busy=false;await importModel(files,builtin);}
  catch(error){message(error.message,true);}
  finally{state.busy=false;syncMenu();onBusyChange();}
 }
 async function pick(files){if(files.length&&await allowSwitch())await importModel(files);}
 async function select(value){
  const builtin=builtins.find(model=>model.id===value);
  if(builtin){if(state.model?.builtinId!==value)await demo(builtin.files,builtin.prefix,builtin);return;}
  if(value&&value!==state.modelKey&&await allowSwitch()){
   busy(true);
   try{const record=await storage.savedModel(value);state.busy=false;await importModel(record.files);}
   catch(error){message('切换失败：'+error.message,true);}
   finally{state.busy=false;syncMenu();onBusyChange();}
  }
 }
 async function restore(){
  busy(true);message('正在载入模型…');
  try{
   await storage.removeLegacyTestModels();await refreshMenu();const record=await storage.lastSavedModel();state.busy=false;
   if(!record){const builtin=builtins.find(model=>model.id==='mesh2motion');await demo(builtin.files,builtin.prefix,builtin);return;}
   if(!await importModel(record.files))return;
   if(state.aiWorkspace.tasks.length&&!state.customs.some(action=>!assetOwner(state.aiWorkspace,action.id))&&!state.poses.some(pose=>!isDefaultPose(pose)&&!assetOwner(state.aiWorkspace,pose.id)))
    onRestored({library:'ai',message:'已恢复模型和AI工作区'});
   else if(state.modelKey===record.data.modelKey&&state.customs.length)onRestored({library:'custom',message:'已恢复模型和素材库'});
   else if(state.modelKey===record.data.modelKey&&state.poses.length)onRestored({library:'pose',pose:state.poses.findLast(pose=>!assetOwner(state.aiWorkspace,pose.id)),message:'已恢复上次保存的姿势库'});
  }catch(error){message('恢复失败：'+error.message,true);}
  finally{state.busy=false;onBusyChange();}
 }
 return {menuState,allowSwitch,importModel,demo,pick,select,restore};
}
