// 模型名称和追加素材仍沿原整笔资料事务，写盘成功才提交同一会话。
export function createModelLibraryOperations({state,prepareImport,persist,onBusyChange,refreshMenu}){
 async function append(kind,files){
  if(state.busy||!state.root)return null;
  state.busy=true;onBusyChange();
  try{
   const imported=await prepareImport({files,kind,root:state.root,rig:state.rig,poses:state.poses});
   if(kind==='action'){
    await persist({thirdParty:[...state.clips.filter(clip=>clip.thirdParty),...imported]});state.clips.push(...imported);
   }else{const poses=[...state.poses,...imported];await persist({poses});state.poses=poses;}
   return {kind,count:imported.length};
  }finally{state.busy=false;onBusyChange();}
 }
 async function rename(name){
  if(!name||state.busy)return false;
  state.busy=true;onBusyChange();
  try{const model={name};await persist({model});state.model=model;await refreshMenu();return true;}
  finally{state.busy=false;onBusyChange();}
 }
 return {append,rename};
}
