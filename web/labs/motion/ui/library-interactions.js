import {findLibraryRow} from './library-view.js';

export function libraryIdentity(row){
 if(row.dataset.poseId)return {kind:'pose',id:row.dataset.poseId};
 if(row.dataset.customId)return {kind:'custom',id:row.dataset.customId};
 return {kind:'source',index:Number(row.dataset.clipIndex)};
}

// 菜单与快捷键只映射用户意图；不读写库、不判断默认素材身份。
export function bindLibraryInteractions({container,getMenu,showMenu,extraMenu,onCopy,onPaste,onRename,onDelete}){
 const listeners=[];
 function listen(type,handler){container.addEventListener(type,handler);listeners.push(()=>container.removeEventListener(type,handler));}
 listen('contextmenu',event=>{
  event.preventDefault();const row=findLibraryRow(event.target),menu=getMenu();
  showMenu(event,[{name:'复制（Ctrl+C）',disabled:!row||menu.copyDisabled,run:()=>onCopy(row)},
   {name:menu.kind==='pose'?'粘贴到自定义姿势库（Ctrl+V）':'粘贴到自定义动作库（Ctrl+V）',disabled:menu.pasteDisabled,run:onPaste},...extraMenu(row)]);
 });
 listen('keydown',event=>{
  if(event.target.closest('input,textarea,[contenteditable="true"]')||!(event.ctrlKey||event.metaKey)||event.altKey)return;
  const key=event.key.toLowerCase();if(!['c','v'].includes(key))return;
  event.preventDefault();event.stopPropagation();if(key==='c')onCopy(findLibraryRow(event.target));else void onPaste();
 });
 listen('keydown',event=>{
  if(!['Delete','F2'].includes(event.key))return;
  const row=event.target.closest('.library-entry')?.querySelector('[data-pose-id],[data-custom-id]')??event.target.closest('button');if(!row)return;
  event.preventDefault();event.stopPropagation();if(event.key==='F2')onRename(row);else void onDelete(row);
 });
 return {dispose(){for(const remove of listeners)remove();}};
}
