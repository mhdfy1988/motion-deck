// 只负责输入；校验与持久化走共享工作台，不复制素材业务逻辑。
export function createLibraryRename({rename,onSaved}){
 const dialog=document.createElement('dialog');dialog.id='libraryRenameDialog';dialog.setAttribute('aria-labelledby','libraryRenameTitle');
 dialog.innerHTML='<form id="libraryRenameForm"><div class="dialog-head"><h2 id="libraryRenameTitle">重命名</h2><button type="button" id="closeLibraryRename" aria-label="关闭重命名">×</button></div><label for="libraryRenameName">名称</label><input id="libraryRenameName" required maxlength="80" autocomplete="off"><p id="libraryRenameError" role="alert" hidden></p><div class="dialog-actions"><button type="button" id="cancelLibraryRename">取消</button><button type="submit" id="confirmLibraryRename" class="primary">保存</button></div></form>';
 document.body.append(dialog);const $=id=>dialog.querySelector('#'+id);let target=null,busy=false;
 const close=()=>{if(!busy)dialog.close();};$('closeLibraryRename').onclick=$('cancelLibraryRename').onclick=close;
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('libraryRenameForm').onsubmit=async event=>{event.preventDefault();if(busy||!target)return;const name=$('libraryRenameName').value.trim();if(!name){$('libraryRenameName').setCustomValidity('请输入名称');$('libraryRenameName').reportValidity();return;}
  busy=true;$('libraryRenameError').hidden=true;for(const id of ['libraryRenameName','confirmLibraryRename','cancelLibraryRename','closeLibraryRename'])$(id).disabled=true;
  try{await rename({...target,name});dialog.close();onSaved(name);}catch(error){$('libraryRenameError').textContent=error.message;$('libraryRenameError').hidden=false;}
  finally{busy=false;for(const id of ['libraryRenameName','confirmLibraryRename','cancelLibraryRename','closeLibraryRename'])$(id).disabled=false;}
 };
 $('libraryRenameName').oninput=()=>$('libraryRenameName').setCustomValidity('');
 return {open(entry){if(busy||dialog.open)return;target=entry;$('libraryRenameTitle').textContent=entry.kind==='pose'?'重命名姿势':'重命名动作';$('libraryRenameName').value=entry.name;$('libraryRenameName').setCustomValidity('');$('libraryRenameError').hidden=true;dialog.showModal();$('libraryRenameName').focus();$('libraryRenameName').select();}};
}
