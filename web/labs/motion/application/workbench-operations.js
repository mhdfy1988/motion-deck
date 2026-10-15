import {capturePose,applyPose,sampleSequence} from '../core/sequence-core.js';
import {createPoseDraft,setDraftBones,setDraftRoot,travelDraftHistory} from './pose-draft.js';
import {Quaternion,Vector3} from 'three';
import {createTimelineOperations} from './timeline-operations.js';
import {reviewTimes,captureOptions} from '../core/review-plan.js';
import {createRootMotionFilter,rootMotionOptions} from '../core/root-motion.js';
import {createLibraryClipboard} from './library-clipboard.js';
import {createAIWorkspaceOperations} from './ai-workspace-operations.js';
import {assetOwner,prepareWorkspaceEntry,protectWorkspaceEntry} from '../core/ai-workspace.js';

function failure(code,message){return Object.assign(new Error(message),{code});}
function pageRange(offset=0,limit=50){
 if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw failure('INVALID_ARGUMENT','分页范围无效');
 return {offset,limit};
}

// 权威状态仍是传入的同一对象；此处只保存变更指纹，不复制可编辑模型。
export function createWorkbenchOperations(state){
 let observed=null,modelRoot=null,nodeMap=new Map(),nextIdentity=0,adapters=null;
 const identities=new WeakMap();
 const listeners=new Set();
 const identity=value=>{if(!value||typeof value!=='object')return null;if(!identities.has(value))identities.set(value,++nextIdentity);return identities.get(value);};
 const sourceId=(clip,index)=>clip.libraryId??`source:${index}:${clip.name}`;
 function fingerprint(){return JSON.stringify({
  root:identity(state.root),workspace:identity(state.aiWorkspace),modelKey:state.modelKey,model:state.model,mode:state.mode,sourceIndex:state.sourceIndex,rootMotion:state.rootMotion,
  clips:state.clips.map((c,i)=>[sourceId(c,i),identity(c)]),poses:state.poses.map(p=>[p.id,p.name,identity(p.pose)]),customs:state.customs.map(a=>[a.id,a.name,identity(a)]),
  items:state.items.map(i=>[i.id,i.kind,i.name,i.in,i.out,i.duration,i.transition,i.interpolation]),
  selection:[...state.selection],selected:state.selected,transition:state.selectedTransition,editingActionId:state.editingActionId,
 });}
 function sync(){
  const next=fingerprint();
  if(modelRoot!==state.root){modelRoot=state.root;nodeMap=new Map();let index=0;state.root?.traverse(node=>nodeMap.set(node,index++));state.poseDraft=null;}
  if(observed!==null&&observed!==next)state.revision++;
  observed=next;return state.revision;
 }
 function publish(){for(const listener of listeners)listener();}
 function changed(){state.revision++;observed=fingerprint();publish();}
 function ready(expected){
  sync();if(state.closed)throw failure('SESSION_CLOSED','会话已关闭');
  if(state.busy)throw failure('BUSY','当前工作台正在执行其他操作');
  if(!state.root||!state.sampler||!state.modelKey)throw failure('NOT_READY','模型尚未就绪');
  if(expected?.modelKey!==undefined&&expected.modelKey!==state.modelKey)throw failure('MODEL_MISMATCH','模型已变化');
  if(expected?.revision!==undefined&&expected.revision!==state.revision)throw failure('REVISION_CONFLICT','编辑状态已变化');
 }
 // 采样也会临时修改模型；失败必须连同可见姿势和预览上下文一起恢复。
 function atomic(run,{transient=false,expected}={}){
  ready(expected);if(state.poseDraft)throw failure('BUSY','请先结束姿势草稿');
  const pose=capturePose(state.root),before={mode:state.mode,time:state.time,sourceTime:state.sourceTime,sourceIndex:state.sourceIndex,customTime:state.customTime,customPreview:state.customPreview,playing:state.playing};
  let result;
  try{result=run();}
  catch(error){Object.assign(state,before);applyPose(state.root,pose);throw error;}
  if(!transient)changed();return result;
 }
 function source(index,time=0,playing=false,options){
  if(!Number.isInteger(index)||index<0||!Number.isFinite(time))throw failure('INVALID_ARGUMENT','动作索引或时间无效');
  return atomic(()=>{const clip=state.clips[index];if(!clip&&state.clips.length)throw failure('INVALID_ARGUMENT','动作不存在');
   const t=clip?Math.max(0,Math.min(time,clip.duration)):0;
   if(clip)applyPose(state.root,options?.raw?state.sampler.sample(clip,t):sampleSource(clip,t));
   state.sourceIndex=index;state.sourceTime=t;state.mode='source';state.playing=playing;return {clip,time:t};
  },options);
 }
 function sequence(time,{transient=false}={}){
  if(!Number.isFinite(time))throw failure('INVALID_ARGUMENT','编排时间无效');
  return atomic(()=>{const t=Math.max(0,Math.min(time,state.sequence?.duration??0)),result=state.sequence&&sampleOutput(state.sequence,t);
   if(result)applyPose(state.root,result.pose);state.time=t;state.mode='sequence';return result;
  },{transient});
 }
 function pose(entry){return atomic(()=>{applyPose(state.root,entry.pose);state.posePreviewId=entry.id;state.posePreviewName=entry.name;state.mode='pose';state.playing=false;return entry;});}
 function custom(preview,time=0,{transient=false}={}){
  if(!preview?.sequence||!Number.isFinite(time))throw failure('INVALID_ARGUMENT','自定义预览无效');
  return atomic(()=>{const t=Math.max(0,Math.min(time,preview.sequence.duration)),result=sampleOutput(preview.sequence,t);
   if(result)applyPose(state.root,result.pose);state.customPreview=preview;state.customTime=t;state.mode='custom';return result;
  },{transient});
 }
 function sampleSource(clip,time,policy=state.rootMotion){const options=rootMotionOptions(policy);if(options.horizontal&&options.vertical)return state.sampler.sample(clip,time);const filter=createRootMotionFilter(state.root,state.sampler.sample(clip,0),options);return filter(state.sampler.sample(clip,time));}
 function sampleOutput(sequence,time,policy=state.rootMotion){const options=rootMotionOptions(policy);if(options.horizontal&&options.vertical)return sampleSequence(sequence,time,state.sampler);const filter=createRootMotionFilter(state.root,sampleSequence(sequence,0,state.sampler).pose,options),result=sampleSequence(sequence,time,state.sampler);return {...result,pose:filter(result.pose)};}
 function currentRawPose(){if(state.poseDraft||state.mode==='pose')return capturePose(state.root);if(state.mode==='source'){const clip=state.clips[state.sourceIndex];return clip?state.sampler.sample(clip,state.sourceTime):capturePose(state.root);}const seq=state.mode==='custom'?state.customPreview?.sequence:state.sequence;return seq?.spans.length?sampleSequence(seq,state.mode==='custom'?state.customTime:state.time,state.sampler).pose:capturePose(state.root);}
 function setRootMotion(value,expected){
  ready(expected);if(state.poseDraft)throw failure('BUSY','请先结束姿势草稿');if(adapters?.timeline?.history.active)throw failure('BUSY','界面编排操作尚未结束');const policy=rootMotionOptions(value),visible=capturePose(state.root);
  try{let pose;if(state.mode==='source'&&state.clips[state.sourceIndex])pose=sampleSource(state.clips[state.sourceIndex],state.sourceTime,policy);else{const seq=state.mode==='custom'?state.customPreview?.sequence:state.sequence;if(state.mode!=='pose'&&seq?.spans.length)pose=sampleOutput(seq,state.mode==='custom'?state.customTime:state.time,policy).pose;else{createRootMotionFilter(state.root,visible,policy);pose=visible;}}applyPose(state.root,pose);}catch(error){applyPose(state.root,visible);throw error;}
  state.rootMotion=policy;changed();return {rootMotion:{...policy},revision:state.revision};
 }
 function inspect(){sync();return {revision:state.revision,rootMotion:rootMotionOptions(state.rootMotion),modelKey:state.modelKey,status:state.closed?'closed':state.busy?'busy':state.root&&state.sampler&&state.modelKey?'ready':'loading',mode:state.mode,editingContext:state.poseDraft?'pose-draft':'preview',draft:state.poseDraft?{dirty:state.poseDraft.dirty,canUndo:!!state.poseDraft.undo.length,canRedo:!!state.poseDraft.redo.length}:null,playing:state.playing,sourceTime:state.sourceTime,time:state.time,counts:{bones:state.bones.length,actions:state.clips.length,poses:state.poses.length,customs:state.customs.length,items:state.items.length}};}
 function rootCarrier(){const roots=state.bones.filter(b=>!b.parent?.isBone);if(roots.length!==1)throw failure('UNSUPPORTED_RIG','整体变换要求唯一骨架根');return roots[0];}
 function rootTransform(){const carrier=rootCarrier();state.root.updateMatrixWorld(true);return {id:`node:${nodeMap.get(carrier)}`,position:carrier.getWorldPosition(new Vector3()).toArray(),quaternion:carrier.getWorldQuaternion(new Quaternion()).toArray(),space:'world',units:'model'};}
 function modelInspect(){ready();return {modelKey:state.modelKey,revision:state.revision,name:state.model?.name??'',builtinId:state.model?.builtinId??null,nodeCount:nodeMap.size,boneCount:state.bones.length,rootTransform:state.bones.filter(b=>!b.parent?.isBone).length===1?rootTransform():null};}
 function rigList(options={}){ready();const {offset,limit}=pageRange(options.offset,options.limit);state.root.updateMatrixWorld(true);
  return {modelKey:state.modelKey,revision:state.revision,total:state.bones.length,offset,entries:state.bones.slice(offset,offset+limit).map(b=>({id:`node:${nodeMap.get(b)}`,name:b.name,nodeIndex:nodeMap.get(b),parentId:nodeMap.has(b.parent)?`node:${nodeMap.get(b.parent)}`:null,position:b.position.toArray(),quaternion:b.quaternion.toArray(),worldMatrix:b.matrixWorld.toArray()}))};
 }
 function libraryList(options={}){ready();const {offset,limit}=pageRange(options.offset,options.limit),entries=[...state.clips.map((c,i)=>({id:sourceId(c,i),kind:'action',name:c.name,duration:c.duration})),...state.poses.map(p=>({id:p.id,kind:'pose',name:p.name})),...state.customs.map(a=>({id:a.id,kind:'custom',name:a.name}))];
  if(options.taskId!==undefined&&!state.aiWorkspace?.tasks.some(t=>t.id===options.taskId))throw failure('INVALID_ARGUMENT','制作任务不存在');
  const selected=entries.flatMap(e=>{const owner=assetOwner(state.aiWorkspace,e.id);if(options.taskId&&owner?.task.id!==options.taskId||options.scope==='custom'&&(owner||e.kind==='action'||e.id.startsWith('builtin:'))||options.scope==='ai'&&!owner||!options.includeTrash&&owner?.entry.state==='trash'||options.kind&&e.kind!==options.kind||options.role&&owner?.entry.role!==options.role||options.stage!==undefined&&owner?.entry.stage!==options.stage||options.iteration!==undefined&&owner?.entry.iteration!==options.iteration||options.query&&![e.name,owner?.entry.stage??'',owner?.task.name??''].join(' ').toLowerCase().includes(options.query.toLowerCase()))return [];return [{...e,...(owner?{taskId:owner.task.id,role:owner.entry.role,stage:owner.entry.stage,iteration:owner.entry.iteration,state:owner.entry.state,protected:owner.entry.protected}:{})}];});
  return {modelKey:state.modelKey,revision:state.revision,total:selected.length,offset,entries:selected.slice(offset,offset+limit)};
 }
 // 取帧只改草稿；不清编排、不写素材库。
 function fromClip({clipId,time,modelKey,revision}){
  if(typeof modelKey!=='string'||!Number.isInteger(revision)||revision<0)throw failure('INVALID_ARGUMENT','取帧必须提供模型身份和编辑版本');
  ready({modelKey,revision});const index=state.clips.findIndex((c,i)=>sourceId(c,i)===clipId);
  if(index<0||!Number.isFinite(time)||time<0||time>state.clips[index].duration)throw failure('INVALID_ARGUMENT','取帧动作或时间无效');
  const before={pose:capturePose(state.root),mode:state.mode,time:state.time,sourceTime:state.sourceTime,sourceIndex:state.sourceIndex,customTime:state.customTime,customPreview:state.customPreview,playing:state.playing};
  source(index,time,false,{expected:{modelKey,revision},raw:true});
  state.poseDraft=createPoseDraft(state.root,state.modelKey,before);state.mode='pose';observed=fingerprint();publish();
  return {modelKey:state.modelKey,revision:state.revision,clipId,time};
 }
 function discardDraft(expected){ready(expected);const draft=state.poseDraft;if(!draft)return false;
  applyPose(state.root,draft.before.pose);const {pose:beforePose,...context}=draft.before;Object.assign(state,context);state.playing=false;state.poseDraft=null;changed();return true;
 }
 function fromLibrary({poseId,...expected}){
  ready(expected);const entry=state.poses.find(p=>p.id===poseId&&assetOwner(state.aiWorkspace,p.id)?.entry.state!=='trash');if(!entry)throw failure('INVALID_ARGUMENT','姿势不存在或在回收区');
  const before={pose:capturePose(state.root),posePreviewId:state.posePreviewId,posePreviewName:state.posePreviewName,mode:state.mode,time:state.time,sourceTime:state.sourceTime,sourceIndex:state.sourceIndex,customTime:state.customTime,customPreview:state.customPreview,playing:state.playing};
  pose(entry);state.poseDraft=createPoseDraft(state.root,state.modelKey,before);state.poseDraft.name=entry.name;state.posePreviewName=entry.name;observed=fingerprint();publish();return {poseId,revision:state.revision};
 }
 function sequenceReady(expected){ready(expected);if(state.poseDraft)throw failure('BUSY','请先结束姿势草稿');if(!state.sequence?.duration||!state.items.length)throw failure('INVALID_ARGUMENT','当前没有有效编排');if(adapters?.timeline?.history.active)throw failure('BUSY','界面编排操作尚未结束');}
 function fromSequence({time,...expected}){
  sequenceReady(expected);if(!Number.isFinite(time)||time<0||time>state.sequence.duration)throw failure('INVALID_ARGUMENT','取帧时间超出编排');
  const before={pose:capturePose(state.root),mode:state.mode,time:state.time,sourceTime:state.sourceTime,sourceIndex:state.sourceIndex,customTime:state.customTime,customPreview:state.customPreview,playing:state.playing};
  atomic(()=>{const result=sampleSequence(state.sequence,time,state.sampler);applyPose(state.root,result.pose);state.time=time;state.playing=false;state.mode='pose';},{expected});
  state.poseDraft=createPoseDraft(state.root,state.modelKey,before);state.poseDraft.name=`编排取帧 ${time.toFixed(3)}s`;state.posePreviewName=state.poseDraft.name;publish();
  return {time,revision:state.revision};
 }
 // 检查过程不移动播放头；采样器会暂改模型，所以同步和异步路径都恢复可见姿势。
 function sampleSequenceRange(args,expected){
  sequenceReady(expected);const times=reviewTimes(args,state.sequence.duration),ids=args.boneIds;
  if(!Array.isArray(ids)||!ids.length||ids.length>64||new Set(ids).size!==ids.length||times.length*ids.length>2048)throw failure('INVALID_ARGUMENT','骨骼或采样总量超限');
  const bones=ids.map(id=>state.bones.find(b=>`node:${nodeMap.get(b)}`===id));if(bones.some(b=>!b))throw failure('INVALID_ARGUMENT','骨骼不存在');
  const visible=capturePose(state.root),playing=state.playing;state.playing=false;
  try{return {modelKey:state.modelKey,revision:state.revision,space:'world',units:'model',samples:times.map(time=>{
   applyPose(state.root,sampleOutput(state.sequence,time).pose);return {time,bones:bones.map((b,i)=>({id:ids[i],position:b.getWorldPosition(new Vector3()).toArray(),quaternion:b.getWorldQuaternion(new Quaternion()).toArray()}))};
  })};}finally{applyPose(state.root,visible);state.playing=playing;}
 }
 function setRootTransform({position,quaternion},expected){
  const draft=draftReady(expected),carrier=rootCarrier();
  if(!Array.isArray(position)||position.length!==3||!position.every(v=>Number.isFinite(v)&&Math.abs(v)<=100)||!Array.isArray(quaternion)||quaternion.length!==4||!quaternion.every(Number.isFinite)||Math.abs(Math.hypot(...quaternion)-1)>1e-5)throw failure('INVALID_ARGUMENT','整体位置/四元数无效');
  state.root.updateMatrixWorld(true);const parent=carrier.parent,parentScale=parent?.getWorldScale(new Vector3())??new Vector3(1,1,1);
  if(Math.min(...parentScale.toArray())<=0||Math.max(...parentScale.toArray())-Math.min(...parentScale.toArray())>1e-5)throw failure('UNSUPPORTED_RIG','整体变换不支持非均匀或反向父级缩放');
  const p=new Vector3(...position),q=new Quaternion(...quaternion);if(parent){parent.worldToLocal(p);q.premultiply(parent.getWorldQuaternion(new Quaternion()).invert());}
  setDraftRoot(state.root,nodeMap,draft,carrier,p.toArray(),q.normalize().toArray());state.playing=false;changed();return {rootTransform:rootTransform(),revision:state.revision};
 }
 function captureCurrent(){ready();state.playing=false;const visible=capturePose(state.root);try{return structuredClone(currentRawPose());}finally{applyPose(state.root,visible);}}
 function draftReady(expected){ready(expected);if(!state.poseDraft)throw failure('NO_DRAFT','请先从动作取帧');return state.poseDraft;}
 function setBones(changes,expected){const draft=draftReady(expected),result=setDraftBones(state.root,state.bones,nodeMap,draft,changes);state.playing=false;changed();return {...result,revision:state.revision};}
 function draftHistory(direction,expected){const draft=draftReady(expected);travelDraftHistory(state.root,draft,direction);changed();return {revision:state.revision};}
 async function saveDraft({name,confirmed,assistant=false,taskId,role='temporary',stage='',iteration=1},expected){
  const draft=draftReady(expected);
  if(confirmed!==true||typeof name!=='string'||!name.trim()||name!==name.trim()||name.length>80)throw failure('INVALID_ARGUMENT','保存需明确确认和1到80字符名称');
  if(state.poses.some(p=>!p.id.startsWith('builtin:')&&p.name===name))throw failure('DUPLICATE_NAME','同名自定义姿势已存在，不覆盖');
  if(state.poses.length>=500)throw failure('LIMIT_EXCEEDED','姿势总数已达500份上限，包含AI及回收素材');
  if(!adapters?.savePose)throw failure('NOT_READY','姿势保存适配未就绪');
  let entry={id:crypto.randomUUID(),name,pose:structuredClone(draft.pose)},plan;
  if(assistant){if(!adapters?.saveLibraryEntries)throw failure('NOT_READY','AI工作区保存适配未就绪');plan=prepareWorkspaceEntry(state,{entry,kind:'pose',taskId,role,stage,iteration});entry=plan.entry;name=entry.name;}
  const poses=[...state.poses,entry];
  state.busy=true;state.playing=false;publish();
  try{if(plan)await adapters.saveLibraryEntries({actions:state.customs,poses,aiWorkspace:plan.workspace});else await adapters.savePose(poses);state.poses=poses;if(plan)state.aiWorkspace=plan.workspace;state.poseDraft=null;state.mode='pose';state.posePreviewId=entry.id;state.posePreviewName=name;changed();if(plan)adapters.workspaceChanged?.();return {id:entry.id,name,...(plan?{taskId:plan.taskId}:{}),revision:state.revision};}
  finally{state.busy=false;publish();}
 }
 async function captureViews(views,expected,options={}){
  ready(expected);if(!adapters?.captureViews)throw failure('NOT_READY','截图适配未就绪');
  const framing=captureOptions(options);
  state.busy=true;const playing=state.playing;state.playing=false;publish();
  try{return {files:await adapters.captureViews(views,framing),revision:state.revision};}
  finally{state.busy=false;state.playing=playing;publish();}
 }
 async function reviewMedia(args,expected,video=false){
  sequenceReady(expected);const options=captureOptions(args.options),duration=state.sequence.duration;
  const times=video?null:reviewTimes(args,duration,24);
  const views=video?[args.view??'front-right']:args.views;
  if(!Array.isArray(views)||!views.length||views.length>3||new Set(views).size!==views.length||views.some(v=>!['front','right','front-right','back','left','front-left'].includes(v)))throw failure('INVALID_ARGUMENT','截图视角无效');
  if(times&&times.length*views.length>24)throw failure('INVALID_ARGUMENT','一次最多24张截图');
  if(video&&(!Number.isFinite(args.start)||!Number.isFinite(args.end)||args.start<0||args.end>duration||args.end<=args.start||args.end-args.start>30||args.confirmed!==true||typeof args.name!=='string'||!args.name.trim()||args.name!==args.name.trim()||args.name.length>80))throw failure('INVALID_ARGUMENT','视频需有效名称、确认及不超过30秒的编排范围');
  const adapter=video?adapters?.exportVideo:adapters?.captureSequence;if(!adapter)throw failure('NOT_READY','媒体适配未就绪');
  const visible=capturePose(state.root),playing=state.playing,revision=state.revision;state.busy=true;state.playing=false;publish();
  const plan={...args,options,views,times,modelKey:state.modelKey,revision,duration,sample:time=>{const pose=sampleOutput(state.sequence,time).pose;applyPose(state.root,pose);return pose;}};
  try{const result=await adapter(plan);return {...result,revision};}
  finally{applyPose(state.root,visible);state.playing=playing;state.busy=false;publish();}
 }
 function canAdvance(){return !state.closed&&!state.busy&&!state.poseDraft&&state.playing;}
 async function renameLibraryEntry({kind,id,name},expected){
  ready(expected);if(state.poseDraft)throw failure('BUSY','请先结束姿势草稿');
  if(!['pose','custom'].includes(kind)||typeof name!=='string'||!name.trim()||name!==name.trim()||name.length>80)throw failure('INVALID_ARGUMENT','名称须为1到80字符');
  const collection=kind==='pose'?state.poses:state.customs,entry=collection.find(e=>e.id===id);
  if(!entry||kind==='pose'&&id.startsWith('builtin:'))throw failure('INVALID_ARGUMENT','仅可重命名当前模型的自定义素材');
  if(collection.some(e=>e.id!==id&&!(kind==='pose'&&e.id.startsWith('builtin:'))&&e.name===name))throw failure('DUPLICATE_NAME','同名自定义素材已存在');
  if(entry.name===name)return {id,name,revision:state.revision};
  if(!adapters?.saveLibraryEntries)throw failure('NOT_READY','素材保存适配未就绪');
  const renamed={...entry,name},next=collection.map(e=>e.id===id?renamed:e),poses=kind==='pose'?next:state.poses,actions=kind==='custom'?next:state.customs;
  const playing=state.playing;state.busy=true;state.playing=false;publish();
  try{
   const workspace=protectWorkspaceEntry(state.aiWorkspace,id);await adapters.saveLibraryEntries({actions,poses,aiWorkspace:workspace});state.poses=poses;state.customs=actions;state.aiWorkspace=workspace;
   if(kind==='pose'&&state.mode==='pose'&&state.posePreviewId===id)state.posePreviewName=name;
   if(kind==='custom'&&state.customPreview?.id===id)state.customPreview={...state.customPreview,name};
   changed();adapters.libraryRenamed?.({kind,id,name});return {id,name,revision:state.revision};
  }finally{state.busy=false;state.playing=playing;publish();}
 }
 const aiWorkspace=createAIWorkspaceOperations({state,ready,changed,publish,getAdapters:()=>adapters});
 const libraryClipboard=createLibraryClipboard({state,ready,changed,publish,getAdapters:()=>adapters,sourceId});
 const timeline=createTimelineOperations({state,ready,changed,publish,resetObservation:()=>{observed=fingerprint();},getAdapters:()=>adapters,sourceId});
 async function exportGLB({name,confirmed,rootMotion=state.rootMotion},expected){
  ready(expected);if(state.poseDraft)throw failure('BUSY','请先结束姿势草稿');if(!state.items.length||confirmed!==true||typeof name!=='string'||!name.trim()||name!==name.trim()||name.length>80)throw failure('INVALID_ARGUMENT','导出需编排、名称与明确确认');if(!adapters?.exportGLB)throw failure('NOT_READY','导出适配未就绪');
  const policy=rootMotionOptions(rootMotion),playing=state.playing;state.busy=true;state.playing=false;publish();try{return {file:await adapters.exportGLB(name,policy),rootMotion:policy,revision:state.revision};}finally{state.busy=false;state.playing=playing;publish();}
 }
 function preview({time,playing},expected){ready(expected);if(!state.items.length||!Number.isFinite(time)||time<0||time>(state.sequence?.duration??0)||typeof playing!=='boolean')throw failure('INVALID_ARGUMENT','编排播放时间或状态无效');sequence(time);state.playing=playing;publish();return {time:state.time,playing,revision:state.revision};}
 function close(){state.playing=false;state.closed=true;state.poseDraft=null;changed();}
 sync();
 return Object.freeze({sync,changed,inspect,modelInspect,rigList,libraryList,libraryClipboard,aiWorkspace,renameLibraryEntry,source,sequence,pose,custom,sampleOutput,sampleSource,setRootMotion,fromClip,fromLibrary,fromSequence,sampleSequenceRange,captureSequence:(args,expected)=>reviewMedia(args,expected),exportVideo:(args,expected)=>reviewMedia(args,expected,true),setRootTransform,timeline,preview,exportGLB,discardDraft,captureCurrent,setBones,draftHistory,saveDraft,captureViews,configure(value){if(adapters)throw new Error('工作台适配只允许绑定一次');adapters=value;},canAdvance,close,subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);}});
}
