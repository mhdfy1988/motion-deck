import {THREE} from './three-adapter.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {zipSync} from 'three/addons/libs/fflate.module.js';
import {applyPose,PoseSampler,compileSequence,sampleSequence,clipKeyTimes} from './sequence-core.js';
import {encodeAction,decodeAction} from './action-library.js';

const MAX_BYTES=128*1024**2;
export function exportName(value){return (value.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,80)||'素材');}
// 60Hz加源关键时刻与边界。硬切前加紧邻样本，不将切换插值拉满一帧。
export function exportTimes(sequence){
 if(!sequence.duration||sequence.duration>180)throw new Error('单个动作导出时长须在180秒内');
 const times=new Set([0,sequence.duration]);for(let i=1;i/60<sequence.duration;i++)times.add(i/60);
 for(const span of sequence.spans){for(const t of [span.start,span.start+span.duration]){times.add(t);if(t>0)times.add(Math.max(0,t-1e-5));}
  if(span.kind==='action')for(const key of clipKeyTimes(span.clip))if(key>=span.in&&key<=span.out)times.add(span.start+(key-span.in)/(span.out-span.in)*span.duration);
 }
 // glTF时间存float32；合并量化后相同的时间，避免输出重复关键时刻。
 const unique=new Map();for(const time of times){const key=Math.fround(time);unique.set(key,Math.max(time,unique.get(key)??time));}
 if(unique.size>12000)throw new Error('动作采样点超过导出预算');return [...unique.values()].sort((a,b)=>a-b);
}
export function bakeExportAction(root,sampler,items,name,budget={bytes:0}){
 const sequence=compileSequence(items,sampler),times=exportTimes(sequence),nodes=[];root.traverse(node=>nodes.push(node));
 const widths=nodes.map(node=>10+(node.morphTargetInfluences?.length??0)),bytes=times.length*widths.reduce((a,b)=>a+b,0)*4;
 budget.bytes+=bytes;if(budget.bytes>MAX_BYTES)throw new Error('动画数据超过128 MiB导出预算，请减少选择');
 const values=nodes.map(node=>({p:new Float32Array(times.length*3),q:new Float32Array(times.length*4),s:new Float32Array(times.length*3),m:node.morphTargetInfluences?new Float32Array(times.length*node.morphTargetInfluences.length):null}));
 times.forEach((time,frame)=>{const pose=sampleSequence(sequence,time,sampler).pose;pose.forEach((v,i)=>{values[i].p.set(v.p,frame*3);values[i].q.set(v.q,frame*4);values[i].s.set(v.s,frame*3);if(values[i].m)values[i].m.set(v.m,frame*v.m.length);});});
 const tracks=[];nodes.forEach((node,i)=>{const v=values[i];tracks.push(new THREE.VectorKeyframeTrack(node.uuid+'.position',times,v.p),new THREE.QuaternionKeyframeTrack(node.uuid+'.quaternion',times,v.q),new THREE.VectorKeyframeTrack(node.uuid+'.scale',times,v.s));if(v.m)tracks.push(new THREE.NumberKeyframeTrack(node.uuid+'.morphTargetInfluences',times,v.m));});
 return new THREE.AnimationClip(name,sequence.duration,tracks);
}
export async function exportMotionAssets({root,base,entries,modelName,copyright='',signal,onProgress=()=>{}}){
 if(!root||!entries.length)throw new Error('请选择要导出的素材');if(entries.length>64)throw new Error('一次最多导出64项素材');
 const check=()=>{if(signal?.aborted)throw new DOMException('已取消导出','AbortError');};
 const copy=clone(root);applyPose(copy,base);const sampler=new PoseSampler(copy),exporter=new GLTFExporter(),budget={bytes:0},files={},used=new Set();
 const fileName=name=>{const stem=exportName(name);let result=stem+'.glb',i=2;while(used.has(result.toLowerCase()))result=`${stem}-${i++}.glb`;used.add(result.toLowerCase());return result;};
 let totalBytes=0;
 const binary=async(animations)=>{check();const data=await exporter.parseAsync(copy,{binary:true,animations,onlyVisible:false,trs:true,copyright});check();totalBytes+=data.byteLength;if(totalBytes>MAX_BYTES)throw new Error('导出文件超过128 MiB，请减少选择');return new Uint8Array(data);};
 try{
  const actions=entries.filter(entry=>entry.kind==='action'),poses=entries.filter(entry=>entry.kind==='pose'),clips=[];
  const animationNames=new Set();for(const entry of actions){check();const data=encodeAction(entry.items,'export',entry.name,root),items=decodeAction(data,copy);let name=entry.name,index=2;while(animationNames.has(name))name=`${entry.name} (${index++})`;animationNames.add(name);clips.push(bakeExportAction(copy,sampler,items,name,budget));onProgress('准备动作 '+entry.name);await new Promise(resolve=>setTimeout(resolve,0));}
  if(clips.length){applyPose(copy,base);files[fileName(actions.length===1?actions[0].name:modelName+'-动作')]=await binary(clips);}
  for(const entry of poses){check();applyPose(copy,entry.pose);onProgress('准备姿势 '+entry.name);files[fileName(entry.name)]=await binary([]);}
  check();const names=Object.keys(files);if(names.length===1)return {blob:new Blob([files[names[0]]],{type:'model/gltf-binary'}),name:names[0]};
  return {blob:new Blob([zipSync(files,{level:0})],{type:'application/zip'}),name:exportName(modelName)+'-素材.zip'};
 }finally{sampler.dispose();/* 克隆共享几何与材质，不能disposeModel误释放可见人偶。 */}
}
