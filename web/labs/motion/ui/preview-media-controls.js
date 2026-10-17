export function referenceFilename(name,presetLabel=''){
 const base=name.replace(/[\\/:*?"<>|]/g,'_').slice(0,60)||'动作参考';return base+(presetLabel?' - '+presetLabel:'');
}

// 只处理按钮、指示和交互锁；不持有录像/播放状态或创建采样器。
export function bindPreviewMediaControls({photoButton,recordButton,fitButton,indicator,getAreas,controls,onPhoto,onRecord,onFit}){
 const listeners=[];
 for(const [button,handler] of [[photoButton,onPhoto],[recordButton,onRecord],[fitButton,onFit]]){
  button.addEventListener('click',handler);listeners.push(()=>button.removeEventListener('click',handler));
 }
 function progress(text){const elapsed=/^录像 ([\d.]+) 秒/.exec(text);if(elapsed){indicator.hidden=false;indicator.textContent=elapsed[1]+' s';}}
 function hideProgress(clear=false){indicator.hidden=true;if(clear)indicator.textContent='';}
 function lock(){
  const areas=getAreas(),inert=areas.map(element=>element.inert),enabled=controls.enabled;
  controls.enabled=false;areas.forEach(element=>element.inert=true);
  return ()=>{controls.enabled=enabled;areas.forEach((element,index)=>element.inert=inert[index]);};
 }
 return {progress,hideProgress,lock,stopRequested(){recordButton.disabled=true;},dispose(){for(const remove of listeners)remove();}};
}
