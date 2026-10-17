import {capturePose,applyPose,clipKeyTimes} from '../core/sequence-core.js';

// 计划只引用原工作台采样；取景和录像故意保留各自的姿势上下文规则。
export function createFramingPlan({state,workbench,sourceIndex,sampleTimes}){
 const still=()=>({times:[0],sample:()=>capturePose(state.root)});
 if(state.mode==='pose')return still();
 if(state.mode==='source'){
  const clip=state.clips[sourceIndex];if(!clip)return still();
  const keys=clip.tracks.flatMap(track=>Array.from(track.times));
  return {times:sampleTimes(clip.duration,keys),sample:time=>workbench.sampleSource(clip,time)};
 }
 const sequence=state.mode==='custom'?state.customPreview.sequence:state.sequence,keys=[];
 if(!sequence?.spans.length)return still();
 for(const span of sequence.spans){
  keys.push(span.start,span.start+span.duration);
  if(span.kind==='action')for(const time of clipKeyTimes(span.clip))if(time>=span.in&&time<=span.out)keys.push(span.start+(time-span.in)/(span.out-span.in)*span.duration);
 }
 return {times:sampleTimes(sequence.duration,keys),
  poses:state.rootMotion.horizontal&&state.rootMotion.vertical?sequence.spans.flatMap(span=>[span.startPose??span.a,span.endPose??span.b]):undefined,
  sample:time=>workbench.sampleOutput(sequence,time).pose};
}

export function createRecordingPlan({state,workbench,sourceIndex}){
 if(state.mode==='sequence'||state.mode==='pose'&&state.items.length)return {duration:state.sequence.duration,sample:time=>applyPose(state.root,workbench.sampleOutput(state.sequence,time).pose)};
 if(state.mode==='custom')return {duration:state.customPreview.sequence.duration,sample:time=>applyPose(state.root,workbench.sampleOutput(state.customPreview.sequence,time).pose)};
 if(state.mode==='source'){
  const clip=state.clips[sourceIndex];if(clip)return {duration:clip.duration,sample:time=>applyPose(state.root,workbench.sampleSource(clip,time))};
 }
 return null;
}

export function createPreviewMediaController({state,workbench,getSourceIndex,getSpeed,getName,isAdvanced,stopMotion,frame,sampleTimes,measureBounds,nextFrame,createCapture,download,lockInteraction,onChange,message,onStopRequested,onRecordingEnd}){
 let recording=false,capture=null;
 async function photo(){
  if(state.busy||!state.root)return;
  stopMotion();state.busy=true;onChange();let photoCapture;
  try{photoCapture=createCapture();download(await photoCapture.photo(),getName()+'.png');message('参考图片已下载 · PNG');}
  catch(error){message('拍照失败：'+error.message,true);}
  finally{photoCapture?.dispose();state.busy=false;onChange();}
 }
 async function record(){
  if(recording){onStopRequested();capture.stop();return;}if(state.busy||!state.root)return;
  stopMotion();const speed=getSpeed(),name=getName(),before=capturePose(state.root),playing=state.playing;
  const plan=createRecordingPlan({state,workbench,sourceIndex:getSourceIndex()});
  if(!plan){message('当前是静态姿势，请拍照或先编排动作',true);return;}
  state.busy=true;state.playing=false;recording=true;const unlock=lockInteraction();onChange();
  try{capture=createCapture();const result=await capture.record({...plan,speed});download(result.blob,name+'.'+result.extension);message('参考视频已下载 · '+result.extension.toUpperCase());}
  catch(error){message('录像失败：'+error.message,true);}
  finally{capture?.dispose();capture=null;recording=false;applyPose(state.root,before);state.busy=false;state.playing=playing;unlock();onRecordingEnd();onChange();}
 }
 async function fit(){
  if(!state.root||state.busy)return;if(isAdvanced()){frame();return;}
  const playing=state.playing;state.busy=true;state.playing=false;onChange();message('正在计算动作取景');
  try{
   const plan=createFramingPlan({state,workbench,sourceIndex:getSourceIndex(),sampleTimes});
   await nextFrame();state.viewBounds=measureBounds(state.root,plan);frame();message('取景已适配 · 镜头保持固定');
  }catch(error){message('取景失败：'+error.message,true);}
  finally{state.busy=false;state.playing=playing;onChange();}
 }
 return {photo,record,fit,get recording(){return recording;},dispose(){capture?.dispose();}};
}
