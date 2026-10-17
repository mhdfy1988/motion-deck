// 固定关闭阶段，不是通用事件总线或依赖容器。具体资源仍由创建方注入。
export function createWorkbenchLifetime({stopViews,stopEditing,closeWorkbench,stopMedia,stopRendering,releaseScene}){
 let disposed=false;
 return {dispose(){
  if(disposed)return;disposed=true;
  // 先停输入/订阅，再关会话，避免已释放的编辑控件被回调复用。
  stopViews();stopEditing();closeWorkbench();stopMedia();stopRendering();releaseScene();
 }};
}
