import {capturePose,applyPose,compileSequence,actionRange,makeCompositeClip} from '../core/sequence-core.js';
import {decodeAction,encodeAction} from '../core/action-codec.js';
import {createTimelineController} from './timeline-controller.js';
import {prepareWorkspaceEntry,assetOwner} from '../core/ai-workspace.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const nameValid=name=>typeof name==='string'&&name===name.trim()&&name.length>0&&name.length<=80;

// 命令只适配同一编排状态、历史和采样器，不维护第二条时间轴。
export function createTimelineOperations({state,ready,changed,publish=()=>{},resetObservation=()=>{},getAdapters,sourceId}){
 function available(expected){ready(expected);if(state.poseDraft)throw fail('BUSY','请先保存或放弃姿势草稿');if(!getAdapters()?.timeline)throw fail('NOT_READY','编排适配尚未就绪');if(getAdapters().timeline.history.active)throw fail('BUSY','界面编排操作尚未结束');}
 function compile(items){const visible=capturePose(state.root);try{return compileSequence(items,state.sampler);}finally{applyPose(state.root,visible);}}
 function summary(){const sequence=compile(state.items);return {revision:state.revision,duration:sequence.duration,time:state.time,playing:state.playing,canUndo:!!getAdapters()?.timeline.history.canUndo,canRedo:!!getAdapters()?.timeline.history.canRedo,items:state.items.map(i=>({id:i.id,kind:i.kind,name:i.name,duration:i.duration??actionRange(i).duration,transition:i.transition??0,...(i.kind==='action'?{in:actionRange(i).in,out:actionRange(i).out}:{})})),spans:sequence.spans.map(s=>({id:s.id??`transition:${s.targetId}`,kind:s.kind,start:s.start,duration:s.duration}))};}
 function inspect(){ready();return summary();}
 function mutate(expected,edit){
  available(expected);const items=state.items.map(i=>({...i}));const result=edit(items);compile(items);
  const adapter=getAdapters().timeline;
  // 全部验证和采样完成后才写入权威状态，验证失败不能污染历史。
  const before={items:state.items,selection:new Set(state.selection),selected:state.selected,selectedTransition:state.selectedTransition,playing:state.playing,time:state.time,sequence:state.sequence,revision:state.revision},visible=capturePose(state.root);
  adapter.history.begin();
  try{state.items=items;state.selection=new Set();state.selected=-1;state.selectedTransition=false;state.playing=false;state.time=0;adapter.refresh();adapter.history.end();}
  catch(error){Object.assign(state,before);applyPose(state.root,visible);resetObservation();adapter.history.abort();throw error;}
  changed();return {...(result??{}),revision:state.revision};
 }
 function append({assetId,duration=1,transition=0,interpolation},expected){return mutate(expected,items=>{
  if(items.length>=256)throw fail('LIMIT_EXCEEDED','一次编排最多256片段');
  if(!Number.isFinite(transition)||transition<0||transition>5||!items.length&&transition!==0)throw fail('INVALID_ARGUMENT','过渡无效，首片段不能带过渡');
  const pose=state.poses.find(p=>p.id===assetId),clip=state.clips.find((c,i)=>sourceId(c,i)===assetId),custom=state.customs.find(c=>c.id===assetId);
  if(!pose&&!clip&&!custom||assetOwner(state.aiWorkspace,assetId)?.entry.state==='trash')throw fail('INVALID_ARGUMENT','素材不存在或在回收区');
  const action=clip??(custom?makeCompositeClip(decodeAction(custom,state.root),custom.name):null),id=crypto.randomUUID();
  if(interpolation!==undefined&&(!pose||interpolation!=='continuous'))throw fail('INVALID_ARGUMENT','连续模式仅用于姿势');
  if(!Number.isFinite(duration)||duration<(pose&&interpolation==='continuous'?0:.05)||duration>(pose?30:300))throw fail('INVALID_ARGUMENT','片段时长超出范围');
  items.push(pose?{id,kind:'pose',name:pose.name,pose:structuredClone(pose.pose),duration,transition,...(interpolation?{interpolation}:{})}:{id,kind:'action',name:action.name,clip:action,duration,transition});return {id};
 });}
 function item(items,id){const found=items.find(i=>i.id===id);if(!found)throw fail('INVALID_ARGUMENT','片段不存在');return found;}
 function move({id,targetId,after=false},expected){return mutate(expected,items=>{item(items,id);item(items,targetId);if(id===targetId)throw fail('INVALID_ARGUMENT','移动目标不能是自身');const candidate={items,selection:new Set([id]),busy:false};createTimelineController(candidate).move(id,targetId,after);items.splice(0,items.length,...candidate.items);if(items[0])items[0].transition=0;});}
 function remove({ids},expected){return mutate(expected,items=>{if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw fail('INVALID_ARGUMENT','删除片段列表无效');for(const id of ids)item(items,id);const candidate={items,selection:new Set(ids),busy:false};createTimelineController(candidate).remove();items.splice(0,items.length,...candidate.items);if(items[0])items[0].transition=0;});}
 function resize({id,duration},expected){return mutate(expected,items=>{const value=item(items,id);if(!Number.isFinite(duration)||duration<(value.kind==='pose'&&value.interpolation==='continuous'?0:.05)||duration>(value.kind==='pose'?30:300))throw fail('INVALID_ARGUMENT','片段时长超出范围');const candidate={items,busy:false};createTimelineController(candidate).resize(id,duration,'right',value,'duration');});}
 function trim({id,in:begin,out:end,duration},expected){return mutate(expected,items=>{const value=item(items,id);if(value.kind!=='action')throw fail('INVALID_ARGUMENT','仅动作片段允许裁剪');const range=actionRange({...value,in:begin,out:end});if(!Number.isFinite(duration)||duration<.05||duration>300)throw fail('INVALID_ARGUMENT','播放时长无效');Object.assign(value,{in:range.in,out:range.out,duration});});}
 function transition({id,duration},expected){return mutate(expected,items=>{const value=item(items,id);if(items[0]===value||!Number.isFinite(duration)||duration<0||duration>5)throw fail('INVALID_ARGUMENT','过渡须属于非首片段，时长0到5秒');value.transition=duration;});}
 function history(direction,expected){available(expected);const h=getAdapters().timeline.history;if(!(direction==='undo'?h.canUndo:h.canRedo))throw fail('NO_HISTORY','没有可撤销/重做的编排');h[direction]();changed();return {revision:state.revision};}
 async function save({name,confirmed,assistant=false,taskId,role='result',stage='',iteration=1},expected){
  available(expected);if(!state.items.length||!nameValid(name)||confirmed!==true)throw fail('INVALID_ARGUMENT','保存动作需片段、名称和明确确认');
  if(state.customs.some(a=>a.name===name))throw fail('DUPLICATE_NAME','同名动作已存在，不覆盖');
  if(state.customs.length>=200)throw fail('LIMIT_EXCEEDED','动作总数已达200份上限，包含AI及回收素材');
  let action=encodeAction(state.items,crypto.randomUUID(),name,state.root),plan;
  if(assistant){if(!getAdapters().saveLibraryEntries)throw fail('NOT_READY','AI工作区保存适配未就绪');plan=prepareWorkspaceEntry(state,{entry:action,kind:'custom',taskId,role,stage,iteration});action=plan.entry;name=action.name;}
  const actions=[...state.customs,action];const adapter=getAdapters().timeline;
  state.busy=true;state.playing=false;publish();
  try{if(plan)await getAdapters().saveLibraryEntries({actions,poses:state.poses,aiWorkspace:plan.workspace});else await adapter.save(actions);state.customs=actions;if(plan)state.aiWorkspace=plan.workspace;state.editingActionId=action.id;adapter.saved(name,plan?{taskId:plan.taskId}:{});changed();return {id:action.id,name,...(plan?{taskId:plan.taskId}:{}),revision:state.revision};}finally{state.busy=false;adapter.refresh();publish();}
 }
 function insertPoseAt({time,poseId},expected){return mutate(expected,items=>{
  if(items.length>=256)throw fail('LIMIT_EXCEEDED','一次编排最多256片段');
  const pose=state.poses.find(p=>p.id===poseId);if(!pose||assetOwner(state.aiWorkspace,poseId)?.entry.state==='trash'||!Number.isFinite(time))throw fail('INVALID_ARGUMENT','姿势或插入时间无效');
  const sequence=compile(items),span=sequence.spans.find(s=>s.kind==='transition'&&time>s.start+1e-8&&time<s.start+s.duration-1e-8);
  if(!span)throw fail('INVALID_ARGUMENT','只能在过渡内部插入姿势');
  const index=items.findIndex(i=>i.id===span.targetId),target=items[index],id=crypto.randomUUID();
  items.splice(index,0,{id,kind:'pose',name:pose.name,pose:structuredClone(pose.pose),duration:0,transition:time-span.start,interpolation:'continuous'});
  target.transition=span.start+span.duration-time;
  return {id,time,duration:sequence.duration,split:{before:time-span.start,after:target.transition}};
 });}
 return {inspect,append,move,remove,resize,trim,transition,history,save,insertPoseAt};
}
