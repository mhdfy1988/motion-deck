import {actionRange} from '../core/sequence-core.js';
const roles={temporary:'临时',key:'关键姿势',result:'成品'};
export const isReviewEntry=entry=>entry.state!=='trash'&&(entry.protected||entry.state==='active'&&['key','result'].includes(entry.role));
// 仅依据保存动作的完整姿势快照定位时间，不按名字猜动作阶段。
export function workspacePresentation(task,poses,actions){
 const entries=task.entries.filter(isReviewEntry),assets=new Map([...poses,...actions].map(a=>[a.id,a]));
 const poseKeys=new Set(entries.filter(e=>e.kind==='pose').map(e=>JSON.stringify(assets.get(e.assetId)?.pose)));
 let times=new Map(),score=0;
 for(const action of actions){const candidate=new Map();let time=0;for(const [index,item] of action.items.entries()){if(index)time+=item.transition??0;if(item.kind==='pose'){const key=JSON.stringify(item.pose);if(poseKeys.has(key)&&!candidate.has(key))candidate.set(key,time);}time+=item.duration??actionRange({...item,clip:action.clips[item.clipIndex]}).duration;}
  if(candidate.size>score){score=candidate.size;times=candidate;}
 }
 const names=entries.map(e=>assets.get(e.assetId)?.name??'');const prefix=names[0]?.split('·')[0]+'·';const common=names.length>1&&names.every(n=>n.startsWith(prefix))?prefix:'';
 return entries.map((entry,index)=>{const asset=assets.get(entry.assetId),time=entry.kind==='pose'?times.get(JSON.stringify(asset.pose)):undefined;let name=entry.stage&&entry.stage!==asset.name?entry.stage:common?asset.name.slice(common.length):asset.name;const suffix=name.match(/·([\d.]+)s$/);if(suffix&&Number.isFinite(time))name=name.slice(0,-suffix[0].length);return {entry,asset,time,name,index};}).sort((a,b)=>(a.time??Infinity)-(b.time??Infinity)||a.index-b.index);
}
export function createAIWorkspaceUI({state,workbench,message,prompts,onChange,createRow}){
 const expanded=new Map();
 async function run(callback){try{await callback();onChange();}catch(e){message(e.message,true);}}
 function render(container){
  const workspace=state.aiWorkspace;
  const tasks=workspace.tasks.filter(t=>t.entries.some(isReviewEntry));
  if(!tasks.length){const p=document.createElement('p');p.className='empty';p.textContent='暂无推荐素材';container.append(p);return;}
  for(const task of [...tasks].reverse()){
   const group=document.createElement('details');group.className='library-group workspace-group';group.dataset.taskId=task.id;if(!expanded.has(task.id))expanded.set(task.id,true);group.open=expanded.get(task.id);group.addEventListener('toggle',()=>expanded.set(task.id,group.open));const head=document.createElement('summary'),heading=document.createElement('span');heading.textContent=task.name;head.append(heading);head.title=task.name;const badge=document.createElement('small');badge.textContent=String(task.entries.filter(isReviewEntry).length);badge.title='推荐素材';head.append(badge);group.append(head);
   const body=document.createElement('div');body.className='library-group-body';
   for(const {entry,asset,time,name} of workspacePresentation(task,state.poses,state.customs)){const row=createRow(asset,entry.kind),b=row.matches('button')?row:row.querySelector('[data-pose-id],[data-custom-id]');b.dataset.workspaceTaskId=task.id;b.dataset.kind=entry.kind;b.dataset.searchName=[asset.name,task.name,entry.stage,roles[entry.role]].join(' ');b.title=[asset.name,roles[entry.role],entry.stage,'版本 '+entry.iteration,entry.state==='superseded'?'已替代':'',entry.protected?'用户保留':''].filter(Boolean).join(' · ');const label=b.querySelector('span');label.textContent=name;label.className='workspace-entry-name';const meta=b.querySelector('small');meta.className='workspace-entry-meta';meta.textContent=Number.isFinite(time)?time.toFixed(3)+' s':entry.kind==='custom'?meta.textContent:entry.protected?'保留':roles[entry.role];const mark=document.createElement('i');mark.className='workspace-entry-kind';mark.setAttribute('aria-hidden','true');b.prepend(mark);body.append(row);}
   group.append(body);container.append(group);
  }
 }
 function menu(row){const taskId=row?.dataset.workspaceTaskId;if(!taskId)return [];const assetId=row.dataset.poseId??row.dataset.customId,task=state.aiWorkspace.tasks.find(t=>t.id===taskId),entry=task.entries.find(e=>e.assetId===assetId);return [{name:entry.protected?'取消保留':'保留此素材',disabled:state.busy||!!state.poseDraft,run:()=>void run(()=>workbench.aiWorkspace.update({taskId,assetId,protected:!entry.protected},undefined,{user:true}))}];}
 return {render,menu};
}
