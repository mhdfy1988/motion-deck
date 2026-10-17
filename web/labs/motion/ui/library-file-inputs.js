// 文件输入只转交FileList并在请求结束后清空，以允许再次选择同一文件。
export function bindLibraryFileInputs({actions,poses,onAppend}){
 const listeners=[];
 for(const [input,kind] of [[actions,'action'],[poses,'pose']]){
  const handler=async event=>{try{await onAppend(kind,event.target.files);}finally{event.target.value='';}};
  input.addEventListener('change',handler);listeners.push(()=>input.removeEventListener('change',handler));
 }
 return {dispose(){for(const remove of listeners)remove();}};
}
