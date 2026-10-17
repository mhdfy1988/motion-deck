// 只刷新已有控件，不持有应用状态、执行事务或重复草稿拦截器。
export function createWorkbenchControls({getElement:$,body,icons,getWorkspaceButtons}){
 function render(model){
  body.classList.toggle('has-segments',model.hasItems);body.classList.toggle('has-model',model.hasModel);
  for(const [id,disabled] of Object.entries(model.disabled))$(id).disabled=disabled;
  for(const button of getWorkspaceButtons())button.disabled=model.workspaceDisabled;
  const record=$('recordVideo');record.classList.add('icon-button');record.classList.toggle('recording',model.recording);
  record.innerHTML=icons[model.recording?'square':'video'];record.setAttribute('aria-label',model.recordLabel);record.title=model.recordTitle;
 }
 function renderEditing({exportDisabled,canCut}){$('exportMotion').disabled=exportDisabled;for(const id of ['splitAction','trimLeft','trimRight'])$(id).disabled=!canCut;}
 function renderRootMotion({horizontal,vertical,disabled}){for(const [id,value] of [['previewHorizontalMotion',horizontal],['previewVerticalMotion',vertical]]){$(id).checked=value;$(id).disabled=disabled;}}
 function renderSource({name,range,disabled}){$('addAction').setAttribute('aria-disabled',String(disabled));$('dragSourceName').textContent=name;$('dragSourceRange').textContent=range;}
 function renderTransition({sourceDisabled,addDisabled}){$('transitionSource').setAttribute('aria-disabled',String(sourceDisabled));$('addTransition').disabled=addDisabled;}
 return {render,renderEditing,renderRootMotion,renderSource,renderTransition};
}
