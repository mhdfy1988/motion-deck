// AI任务只索引原素材；姿势/动作仍使用原编码与同一保存事务。
export const emptyWorkspace=()=>({version:1,activeTaskId:null,tasks:[]});
export const workspaceError=message=>Object.assign(new Error(message),{code:'INVALID_ARGUMENT'});
export function assetOwner(workspace,id){for(const task of workspace?.tasks??[]){const entry=task.entries.find(e=>e.assetId===id);if(entry)return {task,entry};}return null;}
export function uniqueAssetName(name,entries){const names=new Set(entries.map(e=>e.name));let result=name,n=2;while(names.has(result)){const suffix=` (${n++})`;result=name.slice(0,80-suffix.length)+suffix;}return result;}
export function prepareWorkspaceEntry(state,{entry,kind,taskId,role='temporary',stage='',iteration=1}){
 const workspace=structuredClone(state.aiWorkspace??emptyWorkspace());let task;
 if(taskId){task=workspace.tasks.find(t=>t.id===taskId);if(!task)throw workspaceError('制作任务不存在');}
 else task=workspace.tasks.find(t=>t.id===workspace.activeTaskId);
 if(!task){if(workspace.tasks.length>=100)throw workspaceError('制作任务已达100个上限');task={id:crypto.randomUUID(),name:uniqueAssetName('制作任务',workspace.tasks),status:'working',createdAt:Date.now(),entries:[]};workspace.tasks.push(task);workspace.activeTaskId=task.id;}
 if(task.status!=='working')throw workspaceError('请先继续此制作任务');
 if(!['temporary','key','result'].includes(role)||typeof stage!=='string'||stage.length>80||!Number.isInteger(iteration)||iteration<1||iteration>10000)throw workspaceError('用途、阶段或版本无效');
 const entries=kind==='pose'?state.poses:state.customs;
 entry={...entry,name:uniqueAssetName(entry.name,entries)};
 task.entries.push({assetId:entry.id,kind,role,stage,iteration,state:'active',protected:false});
 return {entry,workspace,taskId:task.id};
}
export function keepWorkspaceEntry(entry,keep){return entry.protected||keep==='all'||entry.state!=='superseded'&&(entry.kind==='custom'&&entry.role==='result'||keep==='keyframes'&&['key','result'].includes(entry.role));}
export function validateWorkspace(workspace,actions,poses){
 if(!workspace)return;
 const tasks=new Set(),ids=new Set();
 for(const task of workspace.tasks){if(tasks.has(task.id))throw workspaceError('AI制作任务ID重复');tasks.add(task.id);
  for(const entry of task.entries){const records=entry.kind==='pose'?poses:actions;if(ids.has(entry.assetId)||!records.some(r=>r.id===entry.assetId)||entry.assetId.startsWith('builtin:'))throw workspaceError('AI素材归属索引无效');ids.add(entry.assetId);}
 }
 if(workspace.activeTaskId!==null&&!workspace.tasks.some(t=>t.id===workspace.activeTaskId&&t.status==='working'))throw workspaceError('AI当前制作任务无效');
}
export function protectWorkspaceEntry(workspace,id){const next=structuredClone(workspace??emptyWorkspace()),owner=assetOwner(next,id);if(owner)owner.entry.protected=true;return next;}
