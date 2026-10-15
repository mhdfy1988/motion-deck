import {OrthographicCamera,Vector3} from 'three';
import {capturePose,applyPose,sampleSequence} from '../core/sequence-core.js';
import {visibleModelBounds,measureMotionBounds,boundsSampleTimes} from '../motion-bounds.js';
import {viewPreset} from '../view-presets.js';
import {fitView} from '../view-camera.js';

// 命令媒体复用参考捕获和采样器；独立输出相机不改变用户相机及轨道控制器。
export function createControlMedia({state,getCamera,createCapture,getBridge,sampleOutput=(sequence,time)=>sampleSequence(sequence,time,state.sampler)}){
 const bridge=()=>{const value=getBridge();if(!value)throw new Error('媒体命令仅支持客户端');return value;};
 function bounds(plan){
  if(plan.options.framing!=='motion')return null;
  return measureMotionBounds(state.root,{times:plan.timesForBounds,sample:plan.sample});
 }
 function view(id,options,box){
  if(options.framing==='current')return getCamera().clone();
  const camera=new OrthographicCamera(-1,1,1,-1,.01,1000);
  fitView(camera,box??visibleModelBounds(state.root),new Vector3(...viewPreset(id).direction),options.width/options.height);return camera;
 }
 async function captureViews(views,options){
  const before=capturePose(state.root),files=[],start=state.time;
  const sequence=!state.poseDraft&&state.mode==='sequence'?state.sequence:null;
  const plan={options,timesForBounds:sequence?.duration?boundsSampleTimes(sequence.duration):[0],sample:time=>sequence?.duration?sampleOutput(sequence,time).pose:before};
  try{const box=bounds(plan);for(const id of views){applyPose(state.root,before);const capture=createCapture({...options,camera:view(id,options,box)});try{files.push({...await bridge().saveControlCapture(new Uint8Array(await (await capture.photo()).arrayBuffer())),view:id,time:start});}finally{capture.dispose();}}return files;}
  finally{applyPose(state.root,before);visibleModelBounds(state.root);}
 }
 async function captureSequence(plan){
  const files=[],frames=[],options=plan.options;
  const box=bounds({...plan,timesForBounds:boundsSampleTimes(plan.times.at(-1)-plan.times[0],[],2400).map(t=>t+plan.times[0])});
  const captures=new Map();
  try{
   for(const time of plan.times){plan.sample(time);for(const id of plan.views){
    let capture=captures.get(id);if(!capture||options.framing==='pose'){capture?.dispose();capture=createCapture({...options,camera:view(id,options,box),label:()=>`${time.toFixed(3)} s · ${id}`});captures.set(id,capture);}
    // 标签由每次帧更新，固定相机跨时间复用。
    capture.label=`${time.toFixed(3)} s · ${id}`;
    const file={...await bridge().saveControlCapture(new Uint8Array(await (await capture.photo()).arrayBuffer())),view:id,time};files.push(file);frames.push(file);
   }}
   const manifest=await bridge().saveControlManifest({modelKey:plan.modelKey,revision:plan.revision,options,frames});return {files,manifest};
  }finally{for(const capture of captures.values())capture.dispose();visibleModelBounds(state.root);}
 }
 async function exportVideo(plan){
  const options=plan.options;plan.sample(plan.start);
  const box=bounds({...plan,timesForBounds:boundsSampleTimes(plan.end-plan.start).map(t=>t+plan.start)});
  const capture=createCapture({...options,camera:view(plan.views[0],options,box)});
  try{const result=await capture.record({duration:plan.end-plan.start,sample:time=>plan.sample(plan.start+time),speed:1,minimumFPS:8,scheduler:'timer'});
   return {name:plan.name,start:plan.start,end:plan.end,view:plan.views[0],sampledFrames:result.frames,file:await bridge().saveControlVideo({extension:result.extension,bytes:new Uint8Array(await result.blob.arrayBuffer())})};
  }finally{capture.dispose();visibleModelBounds(state.root);}
 }
 return {captureViews,captureSequence,exportVideo};
}
