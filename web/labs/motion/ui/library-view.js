export function findLibraryRow(target){
 return target.closest('.library-entry')?.querySelector('[data-pose-id],[data-custom-id]')??target.closest('[data-pose-id],[data-custom-id],[data-clip-index]');
}

// 无应用状态与存储依赖；素材行同时供普通库和AI工作区使用。
export function createLibraryView({elements,icons,onTab,onActionGroup,onPreview,onEditPose,onRename,onDelete,editingEnabled=true}){
 const {container,search,count,actionsTab,poseTab,appendButton}=elements;
 const aiTab=document.createElement('button');
 aiTab.id='library-ai';aiTab.textContent='AI工作区';aiTab.setAttribute('role','tab');aiTab.setAttribute('aria-selected','false');aiTab.setAttribute('aria-controls',container.id);
 poseTab.after(aiTab);
 const tabButtons=[[actionsTab,'default'],[poseTab,'pose'],[aiTab,'ai']];
 const tabListeners=tabButtons.map(([button,key])=>{
  const listener=()=>onTab(key);button.addEventListener('click',listener);return [button,listener];
 });
 let tab='action',sourceRows=[];

 function empty(text){const node=document.createElement('p');node.className='empty';node.textContent=text;return node;}

 function wrapEditableRow(row,name){
  const entry=document.createElement('div');entry.className='library-entry';
  const rename=document.createElement('button');rename.className='library-rename';rename.innerHTML=icons.pencil;rename.title='重命名（F2）';rename.setAttribute('aria-label','重命名'+name);
  rename.onclick=event=>{event.stopPropagation();onRename(row);};
  const remove=document.createElement('button');remove.className='library-delete';remove.innerHTML=icons['trash-2'];remove.title='删除';remove.setAttribute('aria-label','删除'+name);
  remove.onclick=event=>{event.stopPropagation();onDelete(row);};
  remove.onkeydown=event=>{if(event.key==='Delete'){event.preventDefault();event.stopPropagation();onDelete(row);}};
  entry.append(row,rename,remove);return entry;
 }

 function createRow(model){
  const row=document.createElement('button'),name=document.createElement('span'),meta=document.createElement('small');
  name.textContent=model.name;meta.textContent=model.meta;row.append(name,meta);row.title=model.title;
  if(model.kind==='source'){
   row.dataset.clipIndex=model.index;row.dataset.clipName=model.clipName;row.dataset.searchName=model.searchName;
  }else row.dataset[model.kind==='pose'?'poseId':'customId']=model.id;
  row.onclick=()=>onPreview(model);
  if(model.editPose&&editingEnabled)row.ondblclick=()=>onEditPose(model);
  return model.kind==='source'||model.readonly?row:wrapEditableRow(row,model.name);
 }

 function setSources(models){
  sourceRows=models.map(createRow);container.replaceChildren(...sourceRows);
 }

 function applySearch(){
  container.querySelector('#librarySearchEmpty')?.remove();
  const query=search.value.trim().toLowerCase();
  search.placeholder=tab==='ai'?'搜索名称、任务或阶段':tab==='pose'?'搜索姿势':'搜索动作';
  for(const group of container.querySelectorAll('.library-group')){
   if(query&&group.dataset.searchOpen===undefined)group.dataset.searchOpen=String(group.open);
   let matches=0;
   for(const row of group.querySelectorAll('[data-clip-index],[data-custom-id],[data-pose-id]')){
    row.hidden=!!query&&!(row.dataset.searchName??row.textContent).toLowerCase().includes(query);
    if(row.parentElement.classList.contains('library-entry'))row.parentElement.hidden=row.hidden;
    if(!row.hidden)matches++;
   }
   group.hidden=!!query&&!matches;
   if(query)group.open=true;
   else if(group.dataset.searchOpen!==undefined){group.open=group.dataset.searchOpen==='true';delete group.dataset.searchOpen;}
  }
  if(query&&![...container.querySelectorAll('.library-group')].some(group=>!group.hidden)){
   const node=empty('没有匹配的素材');node.id='librarySearchEmpty';container.append(node);
  }
 }
 search.addEventListener('input',applySearch);container.tabIndex=0;

 function render(model,renderWorkspace){
  const focused=container.contains(document.activeElement)?findLibraryRow(document.activeElement):null;
  const focusKey=focused&&(focused.dataset.poseId?'poseId':focused.dataset.customId?'customId':'clipIndex'),focusId=focusKey&&focused.dataset[focusKey];
  container.replaceChildren();tab=model.tab;
  actionsTab.setAttribute('aria-selected',String(tab==='action'));poseTab.setAttribute('aria-selected',String(tab==='pose'));aiTab.setAttribute('aria-selected',String(tab==='ai'));
  appendButton.textContent=tab==='pose'?'导入姿势':'导入动作';appendButton.title=tab==='pose'?'导入同骨架的单帧或固定姿势动画':'导入与当前模型同骨架的源动作';
  if(tab==='ai')renderWorkspace(container);
  else for(const item of model.groups){
   const group=document.createElement('details'),head=document.createElement('summary'),body=document.createElement('div');
   group.className='library-group';group.open=item.open;head.id=item.id;head.textContent=item.label;body.className='library-group-body';
   if(tab==='action')head.onclick=event=>{event.preventDefault();onActionGroup(item.key);};
   for(const entry of item.entries){
    const row=entry.kind==='source'?sourceRows[entry.index]:createRow(entry);
    row.hidden=false;body.append(row);
   }
   const badge=document.createElement('small');badge.textContent=body.children.length;head.append(badge);
   if(!body.children.length)body.append(empty(item.empty));
   group.append(head,body);container.append(group);
  }
  if(model.empty)container.append(empty(model.empty));
  // 保留源动作按钮和稳定索引，切换Tab不重新解码素材或改变编排引用。
  if(tab!=='action')for(const row of sourceRows){row.hidden=true;container.append(row);}
  count.textContent=model.count;applySearch();
  if(focusKey){
   const row=[...container.querySelectorAll('[data-pose-id],[data-custom-id],[data-clip-index]')].find(row=>!row.hidden&&row.dataset[focusKey]===focusId);
   if(row){row.closest('details').open=true;row.focus({preventScroll:true});}
  }
 }

 function dispose(){
  search.removeEventListener('input',applySearch);
  for(const [button,listener] of tabListeners)button.removeEventListener('click',listener);
  sourceRows=[];container.replaceChildren();aiTab.remove();
 }
 return {render,setSources,createRow,dispose};
}
