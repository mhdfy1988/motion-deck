// 时间轴只负责手势，片段修改仍交给宿主统一处理。
export function bindTimelineEdit({container,scroll,track,select,resize,move,remove,refresh,scale,snapshot,restore,begin,end,selected,library,sourceCard,transitionSource,prepareInsert,canInsert,insert,canEdit=()=>true}){
 let drag=null,external=null,suppressClick=false;
 let edgeMode='trim';
 const tools=document.createElement('div');tools.className='timeline-duration-tools';tools.hidden=true;
 const modes=document.createElement('div');modes.className='timeline-edge-modes';modes.setAttribute('role','group');modes.setAttribute('aria-label','边缘拖动模式');
 for(const [value,text,tip] of [['trim','裁剪','拖动边缘裁掉部分动作'],['duration','变速','拖动边缘调整速度，保留完整源范围']]){
  const button=document.createElement('button');button.type='button';button.textContent=text;button.dataset.mode=value;button.title=tip;button.onclick=()=>{if(drag||!canEdit())return;edgeMode=value;syncTools();};modes.append(button);
 }
 tools.append(modes);container.closest('.timeline').querySelector('.timeline-head').prepend(tools);
 function syncTools(){
  tools.hidden=!container.querySelector('button.action.selected');
  for(const mode of modes.children){mode.setAttribute('aria-pressed',String(mode.dataset.mode===edgeMode));mode.disabled=!canEdit();}
  container.dataset.edgeMode=edgeMode;
  for(const action of container.querySelectorAll('button.action'))for(const handle of action.querySelectorAll('.resize-handle'))handle.title=edgeMode==='trim'?'裁剪：拖动裁掉部分动作；Alt拖动临时变速':'变速：拖动调整时长，保留完整源范围';
 }
 const toolsObserver=new MutationObserver(syncTools);
 toolsObserver.observe(container,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});syncTools();
 const marker=document.createElement('div');marker.className='timeline-drop';marker.hidden=true;track.append(marker);
 function clearPreview(){document.querySelectorAll('.timeline-swap-preview').forEach(n=>n.remove());container.querySelectorAll('.swap-target').forEach(b=>b.classList.remove('swap-target'));}
 function floatingCopy(button,className){const copy=button.cloneNode(true),rect=button.getBoundingClientRect();copy.className=className;copy.removeAttribute('id');copy.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));copy.removeAttribute('aria-pressed');copy.setAttribute('aria-hidden','true');copy.querySelectorAll('.resize-handle').forEach(n=>n.remove());Object.assign(copy.style,{width:`${rect.width}px`,height:`${rect.height}px`,left:`${rect.left}px`,top:`${rect.top}px`,flexBasis:'auto'});document.body.append(copy);return copy;}
 function externalStart(event){
  const button=event.target.closest('[data-clip-index],[data-custom-id],[data-pose-id],#addAction,#transitionSource');if(!button||event.button!==0||drag||external)return;
  document.activeElement?.blur();const item=prepareInsert(button);if(!item)return;
  external={button,item,x:event.clientX,y:event.clientY,pointerId:event.pointerId,offset:event.clientX-button.getBoundingClientRect().left,moved:false,valid:false};button.setPointerCapture(event.pointerId);
 }
 function externalMove(event){
  if(!external||event.pointerId!==external.pointerId)return;
  if(!external.moved&&Math.hypot(event.clientX-external.x,event.clientY-external.y)<5)return;
  if(!external.moved){external.ghost=floatingCopy(external.button,'timeline-drag-ghost');external.button.classList.add('library-drag-source');external.moved=true;}
  const ghost=external.ghost.getBoundingClientRect();external.ghost.style.left=`${Math.max(8,Math.min(event.clientX-external.offset,innerWidth-ghost.width-8))}px`;external.ghost.style.top=`${Math.max(8,Math.min(event.clientY-25,innerHeight-ghost.height-8))}px`;
  const bounds=scroll.getBoundingClientRect(),area=container.getBoundingClientRect();external.valid=event.clientX>=bounds.left&&event.clientX<=bounds.right&&event.clientY>=area.top&&event.clientY<=area.bottom;
  external.ghost.classList.toggle('invalid',!external.valid);scroll.classList.toggle('drop-ready',external.valid);marker.hidden=!external.valid;
  if(!external.valid)return;
  if(event.clientX>bounds.right-25)scroll.scrollLeft+=15;else if(event.clientX<bounds.left+25)scroll.scrollLeft-=15;
  const blocks=[...container.querySelectorAll('button.action,button.pose')],target=blocks.find(b=>{const r=b.getBoundingClientRect();return event.clientX<r.left+r.width/2;})||blocks.at(-1);
  const rect=target?.getBoundingClientRect();external.target=target?.dataset.key;external.after=!!rect&&event.clientX>=rect.left+rect.width/2;
  external.valid=canInsert(external.item,external.target,external.after);external.ghost.classList.toggle('invalid',!external.valid);scroll.classList.toggle('drop-ready',external.valid);marker.hidden=!external.valid;if(!external.valid)return;
  // 插在目标之前时，把其前置过渡一起让到右侧。
  const preceding=target?.previousElementSibling,edge=!external.after&&preceding?.classList.contains('transition')?preceding.getBoundingClientRect().left:rect?(external.after?rect.right:rect.left):track.getBoundingClientRect().left;
  marker.style.left=`${edge-track.getBoundingClientRect().left}px`;marker.classList.add('adding');marker.classList.toggle('transition-placement',external.item.kind==='transition');
 }
 function externalFinish(cancel=false){
  if(!external)return;const current=external;external=null;current.ghost?.remove();current.button.classList.remove('library-drag-source');scroll.classList.remove('drop-ready');marker.hidden=true;marker.classList.remove('adding','transition-placement');
  if(current.moved&&!cancel&&current.valid)insert(current.item,current.target,current.after);
  if(current.button.hasPointerCapture(current.pointerId))current.button.releasePointerCapture(current.pointerId);
  suppressClick=current.moved;setTimeout(()=>{suppressClick=false;},0);
 }
 const preventSourceClick=event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();}};
 for(const source of [library,sourceCard,transitionSource]){source.addEventListener('pointerdown',externalStart);source.addEventListener('click',preventSourceClick,true);source.addEventListener('lostpointercapture',()=>externalFinish(true));}
 document.addEventListener('pointermove',externalMove);const externalUp=()=>externalFinish(),externalCancel=()=>externalFinish(true);
 document.addEventListener('pointerup',externalUp);document.addEventListener('pointercancel',externalCancel);library.addEventListener('lostpointercapture',externalCancel);sourceCard.addEventListener('lostpointercapture',externalCancel);
 function lift(event){
  drag.sources=[...container.querySelectorAll('button.action,button.pose')].filter(b=>selected(b.dataset.key));
  drag.sources.forEach(b=>b.classList.add('drag-source'));
  drag.ghost=floatingCopy(drag.button,'timeline-drag-ghost');
  if(drag.sources.length>1){const badge=document.createElement('b');badge.textContent=`${drag.sources.length} 个片段`;drag.ghost.append(badge);drag.ghost.classList.add('group');}
 }
 function finish(cancel=false){
  if(!drag)return;
  const current=drag,positions=new Map([...container.children].map(b=>[b.dataset.key,b.getBoundingClientRect()]));drag=null;marker.hidden=true;container.classList.remove('editing');clearPreview();current.ghost?.remove();container.querySelectorAll('.drag-source').forEach(b=>b.classList.remove('drag-source'));current.button.classList.remove('dragging');
  if(current.resize){if(cancel)restore(current.key,current.snapshot);scale(null);refresh();}
  else if(current.moved&&!cancel&&current.target)move(current.key,current.target,current.after,current.swap);
  if(!current.moved&&!current.modified&&!current.resize)select(current.button,{},false);
  end();
  // 动画使用独立视觉副本，真实片段坐标始终是最终位置，避免下一次拖动命中漂移。
  if(current.moved&&!cancel&&!current.resize)for(const button of container.children){const old=positions.get(button.dataset.key),next=button.getBoundingClientRect();if(old&&Math.abs(old.left-next.left)>1){const copy=floatingCopy(button,'timeline-settle');const animation=copy.animate([{transform:`translateX(${old.left-next.left}px)`,opacity:.9},{transform:'translateX(0)',opacity:0}],{duration:220,easing:'ease-out'});animation.onfinish=()=>copy.remove();animation.oncancel=()=>copy.remove();}}
  if(current.button.hasPointerCapture(current.pointerId))current.button.releasePointerCapture(current.pointerId);
  suppressClick=current.moved;setTimeout(()=>{suppressClick=false;},0);
 }
 container.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();}},true);
 container.addEventListener('pointerdown',event=>{
  const button=event.target.closest('button[data-key]');if(!button||event.button!==0||drag||!canEdit())return;
  // 先提交旧输入，再切换片段，防止失焦事件写到新选择。
  document.activeElement?.blur();select(button,event,true);const isResize=!!event.target.closest('.resize-handle');
  if(!selected(button.dataset.key))return;
  // 过渡附属于后一个动作，不允许单独挪动。
  if(!isResize&&button.classList.contains('transition'))return;
  const pps=track.clientWidth/Number(document.getElementById('seek').max);
  document.querySelectorAll('.timeline-settle').forEach(n=>n.remove());begin();drag={button,key:button.dataset.key,offset:event.clientX-button.getBoundingClientRect().left,modified:event.ctrlKey||event.metaKey||event.shiftKey,resize:isResize,side:event.target.closest('.resize-left')?'left':'right',resizeMode:event.altKey?'duration':edgeMode,snapshot:snapshot(button.dataset.key),duration:Number(button.dataset.duration),x:event.clientX,scroll:scroll.scrollLeft,pps,pointerId:event.pointerId,moved:false};
  button.setPointerCapture(event.pointerId);event.preventDefault();if(isResize)scale(pps);
 });
 container.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.pointerId)return;
  const bounds=scroll.getBoundingClientRect();if(event.clientX>bounds.right-25)scroll.scrollLeft+=15;else if(event.clientX<bounds.left+25)scroll.scrollLeft-=15;
  const delta=event.clientX-drag.x+scroll.scrollLeft-drag.scroll;if(Math.abs(delta)<4&&!drag.moved)return;
  if(!drag.moved&&!drag.resize)lift(event);drag.moved=true;container.classList.add('editing');drag.button.classList.add('dragging');
  if(drag.resize){resize(drag.key,Math.round((drag.duration+(drag.side==='left'?-1:1)*delta/drag.pps)*100)/100,drag.side,drag.snapshot,drag.resizeMode);return;}
  drag.ghost.style.left=`${event.clientX-drag.offset}px`;drag.ghost.style.top=`${event.clientY-30}px`;
  const blocks=[...container.querySelectorAll('button.action,button.pose')].filter(b=>!selected(b.dataset.key));
  const hit=blocks.find(b=>{const r=b.getBoundingClientRect();return event.clientX>=r.left&&event.clientX<=r.right;});
  const target=hit||blocks.find(b=>{const r=b.getBoundingClientRect();return event.clientX<r.left+r.width/2;})||blocks.at(-1);if(!target)return;
  const rect=target.getBoundingClientRect();drag.target=target.dataset.key;drag.after=event.clientX>=rect.left+rect.width/2;
  drag.swap=!!hit&&event.clientX>rect.left+rect.width*.25&&event.clientX<rect.right-rect.width*.25;
  clearPreview();if(drag.swap){
   const all=[...container.querySelectorAll('button.action,button.pose')],targets=all.slice(all.indexOf(target),all.indexOf(target)+drag.sources.length);
   if(targets.length!==drag.sources.length||targets.some(b=>selected(b.dataset.key))){drag.swap=false;drag.target=null;marker.hidden=true;drag.ghost.classList.add('invalid');return;}
   drag.ghost.classList.remove('invalid');targets.forEach((b,i)=>{b.classList.add('swap-target');const preview=floatingCopy(b,'timeline-swap-preview'),source=drag.sources[i].getBoundingClientRect();Object.assign(preview.style,{left:`${source.left}px`,top:`${source.top}px`,width:`${source.width}px`});});
  }else drag.ghost.classList.remove('invalid');
  marker.style.left=`${(drag.after?rect.right:rect.left)-track.getBoundingClientRect().left}px`;marker.hidden=drag.swap;
 });
 container.addEventListener('pointerup',()=>finish());container.addEventListener('pointercancel',()=>finish(true));container.addEventListener('lostpointercapture',()=>finish(true));
 container.addEventListener('keydown',event=>{
  if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();finish(true);remove();}
 });
 const escape=event=>{if(event.key==='Escape'){finish(true);externalFinish(true);}};window.addEventListener('keydown',escape);
 return ()=>{toolsObserver.disconnect();tools.remove();finish(true);externalFinish(true);window.removeEventListener('keydown',escape);document.removeEventListener('pointermove',externalMove);document.removeEventListener('pointerup',externalUp);document.removeEventListener('pointercancel',externalCancel);};
}
