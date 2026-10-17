import {loadFiles,assertSameRig,compatibleClips,disposeModel} from './three-adapter.js';
import {importPoseClips} from '../pose-import.js';

// 隐藏的高级导入入口仍使用原校验；临时模型只归本适配器释放。
export async function prepareLibraryImport({files,kind,root,rig,poses}){
 let result;
 try{
  result=await loadFiles(files);
  if(kind==='action'){
   assertSameRig(rig,result.root);
   return compatibleClips(root,result.clips).map(clip=>{
    const copy=clip.clone();copy.name=`${result.name} · ${clip.name}`;copy.thirdParty=true;copy.libraryId=crypto.randomUUID();return copy;
   });
  }
  const imported=importPoseClips(root,rig,result.root,result.clips),names=new Set(poses.map(pose=>pose.name));
  for(const pose of imported){
   const base=`${result.name} · ${pose.name}`;let name=base,n=2;
   while(names.has(name))name=base+' ('+(n++)+')';pose.name=name.slice(0,80);
   if(names.has(pose.name))throw new Error('姿势名称过长或重复');names.add(pose.name);
  }
  return imported;
 }finally{if(result)disposeModel(result.root);}
}
