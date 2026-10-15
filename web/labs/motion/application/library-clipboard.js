import {encodeAction} from '../core/action-codec.js';

// 会话内素材剪贴板：保存完整快照，不使用系统文本剪贴板或跨模型隐式重定向。
export function createLibraryClipboard({state,ready,changed,publish,getAdapters,sourceId}){
 let snapshot=null;
 const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
 function inspect(){return snapshot?{kind:snapshot.kind,name:snapshot.entry.name,modelKey:snapshot.modelKey}:null;}
 function copy({kind,id},expected){
  ready(expected);
  let entry;
  if(kind==='action'){
   const clip=state.clips.find((c,i)=>sourceId(c,i)===id);
   if(clip)entry=encodeAction([{kind:'action',name:clip.name,clip,transition:0}],id,clip.name,state.root);
  }else if(kind==='pose')entry=state.poses.find(p=>p.id===id);
  else if(kind==='custom')entry=state.customs.find(a=>a.id===id);
  if(!entry)fail('INVALID_ARGUMENT','要复制的素材不存在');
  snapshot={kind:kind==='pose'?'pose':'custom',modelKey:state.modelKey,entry:structuredClone(entry)};
  return inspect();
 }
 async function paste(kind,expected){
  ready(expected);
  if(state.poseDraft)fail('BUSY','请先结束姿势草稿');
  if(!snapshot)fail('INVALID_ARGUMENT','请先复制素材');
  if(!['pose','custom'].includes(kind)||kind!==snapshot.kind)fail('INVALID_ARGUMENT','只能粘贴到对应类型的自定义库');
  if(snapshot.modelKey!==state.modelKey)fail('MODEL_MISMATCH','复制的素材属于另一模型，请重新复制');
  const adapters=getAdapters(),collection=kind==='pose'?state.poses:state.customs;
  if(collection.length>=(kind==='pose'?500:200))fail('INVALID_ARGUMENT','自定义库数量已达上限');
  if(!adapters?.saveLibraryEntries)fail('NOT_READY','素材保存适配未就绪');
  const names=new Set(collection.map(e=>e.name));let name,index=1;
  do{const suffix=index===1?' 副本':` 副本 ${index}`;name=Array.from(snapshot.entry.name).slice(0,80-suffix.length).join('');while(name.length+suffix.length>80)name=Array.from(name).slice(0,-1).join('');name+=suffix;index++;}while(names.has(name));
  const entry={...structuredClone(snapshot.entry),id:crypto.randomUUID(),name},next=[...collection,entry];
  const poses=kind==='pose'?next:state.poses,actions=kind==='custom'?next:state.customs;
  const playing=state.playing;state.busy=true;state.playing=false;publish();
  try{
   await adapters.saveLibraryEntries({actions,poses});state.poses=poses;state.customs=actions;changed();
  }finally{state.busy=false;state.playing=playing;publish();}
  adapters.libraryPasted?.({kind,id:entry.id,name});
  return {kind,id:entry.id,name,revision:state.revision};
 }
 return Object.freeze({copy,paste,inspect});
}
