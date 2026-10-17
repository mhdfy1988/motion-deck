const contexts={source:'源动作',sequence:'当前编排',custom:'自定义动作',pose:'姿势'};

// 只协调原会话和工作台；不保存第二份时间，不解码动作或直接修改骨架。
export function createPreviewController({state,workbench,getSourceIndex,onSource,onSequence,onCustom,onChange}){
 function source(time=0,playing=false,{transient=false}={}){
  if(!state.sampler)return;
  const result=workbench.source(getSourceIndex(),time,playing,{transient});
  onSource(result,{transient});return result;
 }
 function sequence(time,{transient=false}={}){
  const result=workbench.sequence(time,{transient});onSequence(result);return result;
 }
 function custom(time,{transient=false}={}){
  const preview=state.customPreview;if(!preview)return;
  const result=workbench.custom(preview,time,{transient});onCustom(preview,result);return result;
 }
 function snapshot(){
  const ready=!!state.root&&!state.busy;
  return {
   mode:state.mode,context:contexts[state.mode]??contexts.source,playing:state.playing,
   duration:state.mode==='source'?state.clips[getSourceIndex()]?.duration??0:state.mode==='custom'?state.customPreview?.sequence.duration??0:state.mode==='sequence'?state.sequence?.duration??0:0,
   time:state.mode==='source'?state.sourceTime:state.mode==='custom'?state.customTime:state.time,
   clockTime:state.mode==='sequence'?state.time:state.mode==='custom'?state.customTime:state.sourceTime,
   sourceTime:state.sourceTime,busy:state.busy,
   canPlay:ready&&!(state.mode==='source'&&!state.clips.length),canRestart:ready
  };
 }
 const available=()=>!!state.root&&!state.closed&&!state.busy&&!state.poseDraft;
 function toggle(){
  if(!available())return;
  if(state.mode==='custom'&&state.customTime>=state.customPreview.sequence.duration)custom(0);
  if(state.mode==='pose'){if(!state.items.length)return;sequence(0);}
  if(state.mode==='sequence'&&state.time>=state.sequence.duration)sequence(0);
  state.playing=!state.playing;onChange();
 }
 function restart(){
  if(!available())return;
  if(state.mode==='pose'){
   if(!state.items.length){state.playing=false;onChange();return;}
   sequence(0);
  }else if(state.mode==='custom')custom(0);
  else if(state.mode==='sequence')sequence(0);
  else source(0);
  state.playing=true;onChange();
 }
 function seek(time,mode=state.mode){
  if(!available())return;
  state.playing=false;
  if(mode==='source')source(time);
  else if(mode==='custom')custom(time);
  else if(mode==='sequence')sequence(time);
  onChange();
 }
 function advance(wallDelta,speed){
  if(!workbench.canAdvance())return;
  const delta=Math.min(wallDelta,.1)*speed;
  if(state.mode==='sequence'){
   sequence(state.time+delta,{transient:true});
   if(state.time>=state.sequence.duration){state.playing=false;onChange();}
  }else if(state.mode==='custom'){
   custom(state.customTime+delta,{transient:true});
   if(state.customTime>=state.customPreview.sequence.duration){state.playing=false;onChange();}
  }else if(state.mode==='source'){
   const clip=state.clips[getSourceIndex()];
   if(clip)source((state.sourceTime+delta)%clip.duration,true,{transient:true});
  }
 }
 return {source,sequence,custom,snapshot,toggle,restart,seek,advance};
}
