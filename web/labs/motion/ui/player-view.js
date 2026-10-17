// 只绑定现有播放DOM；时间、模式和采样全部由预览控制器提供。
export function createPlayerView({elements,icons,onToggle,onRestart,onSeek,onTimelineSeek}){
 const {play,restart,seek,timelineSeek,sourceSeek,clock,context,speed,speedButtons}=elements;
 const listeners=[];
 function listen(element,type,handler){element.addEventListener(type,handler);listeners.push([element,type,handler]);}
 const syncSpeed=()=>{for(const button of speedButtons)button.setAttribute('aria-pressed',String(button.dataset.speed===speed.value));};
 listen(speed,'change',syncSpeed);
 for(const button of speedButtons)listen(button,'click',()=>{speed.value=button.dataset.speed;speed.dispatchEvent(new Event('change',{bubbles:true}));});
 listen(play,'click',onToggle);listen(restart,'click',onRestart);
 listen(seek,'input',()=>onSeek(seek.valueAsNumber));
 listen(timelineSeek,'input',()=>onTimelineSeek(timelineSeek.valueAsNumber));
 function render(model){
  context.textContent=model.context;
  play.disabled=!model.canPlay;restart.disabled=!model.canRestart;
  play.innerHTML=icons[model.playing?'pause':'play'];restart.innerHTML=icons['rotate-ccw'];
 }
 function renderProgress(model){
  seek.max=model.duration;seek.disabled=model.busy||!model.duration;seek.value=model.time;
  sourceSeek.value=model.sourceTime;clock.textContent=model.clockTime.toFixed(2)+' s';
 }
 function dispose(){for(const [element,type,handler] of listeners)element.removeEventListener(type,handler);}
 return {render,renderProgress,getSpeed:()=>Number(speed.value),dispose};
}
