// 复用原模型选择器，只展示目录并转交选择/文件意图。
export function bindModelMenu({select,input,renameButton,builtins,getCurrent,onSelect,onFiles}){
 function sync(current=getCurrent()){
  select.value=builtins.some(model=>model.id===current.builtinId)?current.builtinId:current.modelKey??'';
  renameButton.hidden=!current.hasRoot||!!current.builtinId;
 }
 function render(catalog){
  select.replaceChildren();
  const builtinGroup=document.createElement('optgroup');builtinGroup.label='内置模型';
  const legend=document.createElement('legend');legend.textContent=builtinGroup.label;builtinGroup.append(legend);
  for(const model of builtins){const option=new Option(model.name,model.id);option.title=model.source;builtinGroup.append(option);}select.append(builtinGroup);
  const external=catalog.models.filter(model=>!model.builtinId);
  if(external.length){
   const group=document.createElement('optgroup');group.label='已导入模型';const title=document.createElement('legend');title.textContent=group.label;group.append(title);
   for(const model of external)group.append(new Option(model.name,model.key));select.append(group);
  }
  select.append(new Option('导入模型…','import'));sync();
 }
 const change=()=>{const value=select.value;sync();if(value==='import')input.click();else void onSelect(value);};
 const files=async()=>{if(input.files.length)await onFiles(input.files);input.value='';};
 select.addEventListener('change',change);input.addEventListener('change',files);
 return {sync,render,dispose(){select.removeEventListener('change',change);input.removeEventListener('change',files);}};
}
