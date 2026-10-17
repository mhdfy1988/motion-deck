// 绑定原名称表单；只持有本次输入上下文，不持有素材、草稿或保存规则。
export function bindSaveNameForm({dialog,form,input,submit,cancelButtons,emptyMessage,isBusy,onSubmit}){
 let context=null,submitting=false;
 const listeners=[];
 function listen(element,type,handler){element.addEventListener(type,handler);listeners.push([element,type,handler]);}
 for(const button of cancelButtons)listen(button,'click',()=>dialog.close());
 listen(dialog,'close',()=>{context=null;});
 listen(input,'input',()=>input.setCustomValidity(''));
 listen(form,'submit',async event=>{
  event.preventDefault();
  const name=input.value.trim();
  if(!name){input.setCustomValidity(emptyMessage);input.reportValidity();return;}
  if(submitting||isBusy()||context===null)return;
  const payload=context;submitting=true;submit.disabled=true;
  try{if(await onSubmit(name,payload))dialog.close();}
  finally{submitting=false;submit.disabled=false;}
 });
 return {
  open(name='',payload=true){context=payload;input.value=name;dialog.showModal();input.focus();},
  dispose(){for(const [element,type,handler] of listeners)element.removeEventListener(type,handler);context=null;}
 };
}
