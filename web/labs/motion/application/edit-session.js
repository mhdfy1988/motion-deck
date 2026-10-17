// 草稿/历史只归原工作台；面板开关是现有DOM投影，不另存编辑状态。
export function createEditSession({state,workbench,isEnabled,isOpen,setOpen,confirm,message,clearSelection,renderEditing,renderHistory,onChange,notifyDraft}){
 let disposed=false;
 async function toggle(){
  if(disposed||!isEnabled()||state.busy||!state.root)return;
  if(isOpen()){
   if(state.poseDraft&&!await confirm('放弃未保存的姿势修改？','放弃','退出编辑'))return;
   if(disposed)return;
   if(state.poseDraft)workbench.discardDraft();setOpen(false);
  }else{
   if(state.poseDraft?.origin!=='user'){
    if(state.poseDraft){message('请先保存或放弃当前姿势草稿');return;}
    workbench.beginUserDraft();
   }
   setOpen(true);
  }
 }
 function panelChanged(){
  if(disposed)return;const editing=isOpen();
  if(editing&&!state.poseDraft)workbench.beginUserDraft();
  if(editing&&state.poseDraft?.origin!=='user'){setOpen(false);return;}
  renderEditing(editing);if(editing)state.playing=false;onChange();
 }
 function sync(){
  if(disposed)return;
  if(state.poseDraft?.origin!=='user'){setOpen(false);clearSelection();}
  renderHistory({undoDisabled:state.busy||!state.poseDraft?.undo.length,redoDisabled:state.busy||!state.poseDraft?.redo.length});
 }
 const unsubscribe=workbench.subscribe(sync);
 function history(direction){if(!disposed&&!state.busy&&state.poseDraft?.[direction].length)workbench.draftHistory(direction);}
 function inputState(){return {hasDraft:!!state.poseDraft,origin:state.poseDraft?.origin};}
 function preventUnload(){return !!(state.poseDraft?.dirty||state.busy&&state.poseDraft);}
 function reportDraft(){if(!disposed&&!state.closed&&state.root)notifyDraft(!!state.poseDraft?.dirty);}
 function canEditTimeline(){return !state.busy&&!state.poseDraft;}
 return {toggle,panelChanged,history,inputState,preventUnload,reportDraft,canEditTimeline,dispose(){if(disposed)return;disposed=true;unsubscribe();}};
}
