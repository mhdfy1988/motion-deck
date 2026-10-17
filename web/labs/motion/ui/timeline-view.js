import {DEFAULT_PIXELS_PER_SECOND,zoomScale,fitTimeline,timelineMetrics,timelineTicks} from '../core/timeline-view.js';

// 显示比例属于视图，不写回动作时长；编排和播放状态始终由调用方提供。
export function createTimelineView({getElement,getPlayback,onSelect}){
 const $=getElement,container=$('segments'),scroll=$('timelineScroll'),track=$('timelineTrack');
 let pixels=DEFAULT_PIXELS_PER_SECOND;
 const listeners=[];
 const listen=(node,type,handler)=>{node.addEventListener(type,handler);listeners.push(()=>node.removeEventListener(type,handler));};
 const zoomTools=document.createElement('div');zoomTools.className='timeline-zoom';
 zoomTools.innerHTML='<button id="timelineZoomOut" type="button" aria-label="缩小时间轴" title="缩小时间轴">−</button><input id="timelineZoom" type="range" min="0" max="100" step="1" value="50" aria-label="时间轴缩放"><output id="timelineZoomValue">100%</output><button id="timelineZoomIn" type="button" aria-label="放大时间轴" title="放大时间轴">+</button><button id="timelineFit" type="button">适合全部</button>';
 $('timelineRemove').before(zoomTools);
 function ruler(){
  const node=$('timeRuler'),extent=Number(node.dataset.width)||0;node.replaceChildren();
  for(const tick of timelineTicks(pixels,scroll.scrollLeft,scroll.clientWidth-12,extent)){
   const mark=document.createElement('span');mark.className=tick.major?'major':'minor';mark.style.left=`${tick.x}px`;mark.textContent=tick.label;node.append(mark);
  }
 }
 function playhead(){
  const {total,time,playing}=getPlayback(),ratio=total?Math.min(time,total)/total:0;
  $('playhead').hidden=!total;$('playhead').style.left=`${ratio*100}%`;
  if(playing){const x=6+ratio*track.clientWidth;if(x<scroll.scrollLeft+6||x>scroll.scrollLeft+scroll.clientWidth-6)scroll.scrollLeft=Math.max(0,x-scroll.clientWidth*.75);}
 }
 function layout(){
  const {total}=getPlayback(),visible=Math.max(1,scroll.clientWidth-12),metrics=timelineMetrics(total,visible,pixels);
  track.style.width=`${metrics.contentWidth}px`;track.style.minWidth='0';track.dataset.scale=pixels;
  $('timeRuler').style.width=`${metrics.rulerWidth}px`;$('timeRuler').dataset.width=metrics.rulerWidth;
  for(const [id,disabled] of [['timelineZoomOut',pixels<=1],['timelineZoomIn',pixels>=10000],['timelineFit',!total]])$(id).disabled=disabled;
  $('timelineZoom').value=Math.log10(pixels)*25;$('timelineZoomValue').textContent=`${Math.round(pixels)}%`;ruler();playhead();
 }
 function zoom(value){const anchor=scroll.scrollLeft/pixels;pixels=zoomScale(value);layout();scroll.scrollLeft=anchor*pixels;ruler();}
 listen($('timelineZoom'),'input',()=>zoom(10**(Number($('timelineZoom').value)/25)));
 listen($('timelineZoomOut'),'click',()=>zoom(pixels/1.25));
 listen($('timelineZoomIn'),'click',()=>zoom(pixels*1.25));
 listen($('timelineFit'),'click',()=>{zoom(fitTimeline(getPlayback().total,scroll.clientWidth-12));scroll.scrollLeft=0;ruler();});
 listen(scroll,'scroll',ruler);
 function render({duration,entries}){
  $('total').textContent=`${duration.toFixed(2)} 秒`;$('seek').max=duration;
  // 稳定身份避免失焦提交期间替换正在点击/拖动的片段。
  const existing=new Map([...container.children].map(node=>[node.dataset.key,node])),kept=new Set();
  entries.forEach((entry,index)=>{
   const button=existing.get(entry.key)||document.createElement('button');kept.add(button);
   button.dataset.key=entry.key;button.dataset.start=entry.start;button.dataset.duration=entry.duration;
   button.style.flexBasis=`${entry.duration/duration*100}%`;button.className=entry.kind;
   if(entry.selected)button.classList.add('selected');
   const name=button.querySelector('span')||document.createElement('span'),length=button.querySelector('small')||document.createElement('small');
   name.textContent=entry.label;length.textContent=entry.durationLabel;length.className='segment-duration';
   if(!name.parentNode)button.append(name,length);
   if(!button.querySelector('.resize-handle')){
    const handle=document.createElement('i');handle.className='resize-handle';handle.title=entry.kind==='action'?'拖动裁剪；Alt拖动变速':'拖动调整时长';button.append(handle);
    if(entry.kind==='action'){const left=handle.cloneNode();left.classList.add('resize-left');button.append(left);}
   }
   button.dataset.sourceIn=entry.sourceIn;button.dataset.sourceOut=entry.sourceOut;button.dataset.rawName=entry.rawName;
   button.title=entry.title;button.setAttribute('aria-label',entry.title);
   button.onclick=event=>{if(event.detail===0)onSelect(button,event);};
   if(container.children[index]!==button)container.insertBefore(button,container.children[index]??null);
  });
  for(const node of [...container.children])if(!kept.has(node))node.remove();
  if(!entries.length){const empty=document.createElement('span');empty.className='empty';empty.textContent='将动作或姿势拖到这里';container.append(empty);}
 }
 function renderSelection({selection,hasItems}){
  container.querySelectorAll('button').forEach(button=>{const selected=selection.has(button.dataset.key);button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
  $('selectionCount').textContent=`已选 ${selection.size}`;$('timelineRemove').disabled=!selection.size;$('timelineAll').disabled=!hasItems;$('timelineNone').disabled=!selection.size;
 }
 function renderPlayback(start){
  if(start!==undefined)container.querySelectorAll('button').forEach(button=>button.classList.toggle('playing',Number(button.dataset.start)===start));
  $('seek').value=getPlayback().time;playhead();
 }
 function dispose(){for(const remove of listeners)remove();for(const button of container.querySelectorAll('button'))button.onclick=null;zoomTools.remove();}
 return {render,renderSelection,renderPlayback,layout,dispose};
}
