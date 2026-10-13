// 复用页面既有dialog布局；关闭、Esc和取消都返回false，不调用浏览器confirm。
export function createMotionPrompts(){
 const dialog=document.createElement('dialog');dialog.id='motionConfirmDialog';dialog.setAttribute('aria-labelledby','motionConfirmTitle');
 const head=document.createElement('div');head.className='dialog-head';const title=document.createElement('h2');title.id='motionConfirmTitle';const close=document.createElement('button');close.textContent='×';close.type='button';close.setAttribute('aria-label','关闭确认');head.append(title,close);
 const text=document.createElement('p');text.id='motionConfirmText';dialog.setAttribute('aria-describedby',text.id);const actions=document.createElement('div');actions.className='dialog-actions';const cancel=document.createElement('button'),ok=document.createElement('button');cancel.textContent='取消';cancel.autofocus=true;ok.className='primary';actions.append(cancel,ok);dialog.append(head,text,actions);document.body.append(dialog);
 let settle=null;const finish=value=>{if(!settle)return;const done=settle;settle=null;dialog.close();done(value);};close.onclick=cancel.onclick=()=>finish(false);ok.onclick=()=>finish(true);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});dialog.addEventListener('close',()=>{if(!dialog.open)finish(false);});
 return {ask(message,label='确认',heading='确认操作'){if(settle)return Promise.resolve(false);title.textContent=heading;text.textContent=message;ok.textContent=label;return new Promise(resolve=>{settle=resolve;dialog.showModal();cancel.focus();});}};
}
let closeMenu=null;
export function showMotionMenu(event,items){
 closeMenu?.();const menu=document.createElement('div');menu.id='motionContextMenu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','素材操作');
 let onOutside,onKey;const close=()=>{document.removeEventListener('pointerdown',onOutside,true);document.removeEventListener('keydown',onKey,true);menu.remove();if(closeMenu===close)closeMenu=null;};closeMenu=close;
 for(const item of items){const b=document.createElement('button');b.setAttribute('role','menuitem');b.textContent=item.name;b.disabled=!!item.disabled;b.onclick=()=>{close();item.run();};menu.append(b);}
 document.body.append(menu);const rect=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(event.clientX,innerWidth-rect.width-8))+'px';menu.style.top=Math.max(8,Math.min(event.clientY,innerHeight-rect.height-8))+'px';
 onOutside=e=>{if(!menu.contains(e.target))close();};onKey=e=>{if(e.key==='Escape'){e.preventDefault();close();}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const buttons=[...menu.querySelectorAll('button:not(:disabled)')],i=buttons.indexOf(document.activeElement);buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}};
 document.addEventListener('pointerdown',onOutside,true);document.addEventListener('keydown',onKey,true);menu.querySelector('button:not(:disabled)')?.focus();
}
