import {decideDraftInput} from '../application/edit-input-policy.js';

// 绑定原节点和捕获阶段输入；只持有监听/自有重做按钮，不拥有草稿。
export function bindEditSessionView({documentTarget,windowTarget,body,panel,sourcePanel,editButton,undoButton,resetButton,timeline,poseLayout,advancedTools,icons,stopMotion,onToggle,onPanelChanged,onHistory,getInputState,preventUnload,onBlocked,onTimelineHistory,onTimelineAll}){
 const listeners=[];
 function listen(target,type,handler,capture=false){const options={capture};target.addEventListener(type,handler,options);listeners.push(()=>target.removeEventListener(type,handler,options));}
 undoButton.title='撤销姿势调整';undoButton.setAttribute('aria-label','撤销姿势调整');resetButton.hidden=true;
 listen(undoButton,'click',()=>onHistory('undo'));
 let redoButton=null;
 if(!advancedTools){
  redoButton=undoButton.ownerDocument.createElement('button');redoButton.id='redoRotation';redoButton.className='icon-button';redoButton.innerHTML=icons['redo-2'];redoButton.title='重做姿势调整';redoButton.setAttribute('aria-label','重做姿势调整');undoButton.after(redoButton);
  listen(redoButton,'click',()=>onHistory('redo'));
 }
 listen(editButton,'click',onToggle);listen(panel,'toggle',onPanelChanged);
 function guard(event){
  const context=getInputState();if(!context.hasDraft)return;
  const target=event.target,control=target.closest('button,input,select,a'),dialog=control?.closest('dialog');
  const result=decideDraftInput(context,{type:event.type,key:event.key,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey,textInput:target.matches('input,textarea'),hasControl:!!control,inTimeline:!!target.closest('.timeline'),
   userEditorControl:!!control&&(!!control.closest('#posePanel,.body-handles,#viewportPoseTools')||control.id==='editPose'),assistantTools:!!control?.closest('#assistantPoseTools'),inDialog:!!dialog,dialogId:dialog?.id,controlId:control?.id});
  if(result.action==='allow')return;
  event.preventDefault();event.stopImmediatePropagation();
  if(result.action==='history')onHistory(result.direction);else if(control)onBlocked();
 }
 for(const type of ['click','input','change','keydown'])listen(documentTarget,type,guard,true);
 listen(windowTarget,'beforeunload',event=>{if(preventUnload()){event.preventDefault();event.returnValue='';}});
 listen(timeline,'keydown',event=>{
  if(event.target.matches('input,textarea,select'))return;
  if(event.ctrlKey||event.metaKey){
   if(event.key.toLowerCase()==='z'){event.preventDefault();onTimelineHistory(event.shiftKey?'redo':'undo');}
   else if(event.key.toLowerCase()==='y'){event.preventDefault();onTimelineHistory('redo');}
   else if(event.key.toLowerCase()==='a'){event.preventDefault();onTimelineAll();}
  }
 });
 function renderEditing(editing){
  body.classList.toggle('pose-editing',editing);if(!editing)stopMotion();
  if(poseLayout)poseLayout.sync(editing);else editButton.textContent=editing?'退出编辑':'编辑姿势';
  sourcePanel.hidden=editing;panel.querySelector('.mode-label').textContent=editing?'退出编辑':'进入编辑';
 }
 function renderHistory({undoDisabled,redoDisabled}){undoButton.disabled=undoDisabled;if(redoButton)redoButton.disabled=redoDisabled;}
 return {renderEditing,renderHistory,dispose(){for(const remove of listeners)remove();redoButton?.remove();}};
}
