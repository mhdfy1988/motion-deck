import {cameraModes} from './view-controls.js';

export function bindCameraMode({controls,preset,freeView,getState,isDragging,onError}){
 if(cameraModes.length===1)return ()=>{};
 const select=document.createElement('select');select.id='cameraMode';select.setAttribute('aria-label','相机模式');
 for(const [value,label] of cameraModes){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}select.value=controls.mode;preset.before(select);
 const sync=()=>{select.disabled=preset.disabled;select.title=controls.mode==='fly'?'自由飞行：左键转向，WASD移动，Q/E升降（透视视图）':'观察相机操作方式';};sync();
 const observer=new MutationObserver(sync);observer.observe(preset,{attributes:true,attributeFilter:['disabled']});
 select.onchange=()=>{
  try{if(getState().busy||isDragging())throw new Error('请先结束当前操作');freeView.stop();controls.setMode(select.value);if(controls.mode==='fly')freeView.canvas.focus({preventScroll:true});}
  catch(error){onError(error.message,true);}finally{select.value=controls.mode;sync();}
 };
 return ()=>{observer.disconnect();select.remove();};
}
