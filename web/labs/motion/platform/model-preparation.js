import {THREE,loadFiles,modelInfo,disposeModel} from './three-adapter.js';
import {decodeAction,validatePoses} from '../core/action-codec.js';
import {mappedDefaultPoses,mappedDefaultActions} from '../default-poses.js';
import {importPoseClips} from '../pose-import.js';
import {mesh2motionAddonActions,mesh2motionAddonPoses,quaterniusRootMotionActions,verifiedBuiltinFile} from '../builtin-expansion.js';

// 准备候选模型；资源/映射/校验失败只释放候选，不触碰当前场景或素材库。
export async function prepareModel(files,{savedLibrary,builtin,builtins}){
 let result;
 try{
  result=await loadFiles(files);
  for(const action of [...savedLibrary.actions,...(savedLibrary.thirdParty??[])])decodeAction(action,result.root);validatePoses(savedLibrary.poses??[],result.root);
  const box=new THREE.Box3().setFromObject(result.root),size=box.getSize(new THREE.Vector3()).length();
  if(box.isEmpty()||!Number.isFinite(size)||size<=0)throw new Error('没有有效网格');
  const metadata=builtin?{name:builtin.name,builtinId:builtin.id}:savedLibrary.model??{name:result.name.slice(0,80)};
  const owner=builtins.find(b=>b.id===metadata.builtinId),rig=result.root.clone(true);
  if(owner)metadata.name=owner.name;
  // 内置姿势包携带自己的模型，固定姿势不再重复列为连续动作。仅首次载入种入默认姿势。
  let defaults=owner?.poses?importPoseClips(result.root,rig,result.root,result.clips).map((pose,index)=>({...pose,id:'builtin:'+owner.id+':'+index})):[];
  if(owner?.id==='quaternius'){
   const response=await fetch('/fixtures/poses/MakeHumanPoses.glb');if(!response.ok)throw new Error('内置姿势未准备，请运行 node scripts/prepare-pose-demo.mjs');
   const pack=await loadFiles([new File([await response.blob()],'MakeHumanPoses.glb')]);try{defaults=mappedDefaultPoses(result.root,pack.root,pack.clips);}finally{disposeModel(pack.root);}
   const actionsResponse=await fetch('/fixtures/candidates/ual2/Universal%20Animation%20Library%202%5BStandard%5D/Unreal-Godot/UAL2_Standard.glb');if(!actionsResponse.ok)throw new Error('内置动作②未准备，请运行 node scripts/prepare-motion-candidates.mjs');
   const actionsPack=await loadFiles([new File([await actionsResponse.blob()],'UAL2_Standard.glb')]);try{result.clips.push(...mappedDefaultActions(result.root,actionsPack.root,actionsPack.clips));}finally{disposeModel(actionsPack.root);}
   const rmPack=await loadFiles([await verifiedBuiltinFile('/fixtures/candidates/ual2/Universal%20Animation%20Library%202%5BStandard%5D/Unreal-Godot/UAL2_Standard_RM.glb','UAL2_Standard_RM.glb','814eee878f82934992d3ea746c539df25e981487109c591f5efbb8dd03286f99')]);try{result.clips.push(...quaterniusRootMotionActions(result.root,rmPack.root,rmPack.clips,result.clips));}finally{disposeModel(rmPack.root);}
   const onePrefix='/fixtures/candidates/ual1/Universal%20Animation%20Library%5BStandard%5D/Unreal-Godot/';
   const standard1=await loadFiles([await verifiedBuiltinFile(onePrefix+'UAL1_Standard.glb','UAL1_Standard.glb','69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997')]);try{const rm1=await loadFiles([await verifiedBuiltinFile(onePrefix+'UAL1_Standard_RM.glb','UAL1_Standard_RM.glb','be684571ed655a1b892c2c07e6e2aeca053b606c442d34004adaf1d944090d01')]);try{result.clips.push(...quaterniusRootMotionActions(result.root,rm1.root,rm1.clips,mappedDefaultActions(result.root,standard1.root,standard1.clips),'UAL1'));}finally{disposeModel(rm1.root);}}finally{disposeModel(standard1.root);}
  }
  if(owner?.id==='mesh2motion'){
   const addon=await loadFiles([await verifiedBuiltinFile('/fixtures/candidates/m2m-human-addon-animations.glb','m2m-human-addon-animations.glb','a0d64d555e0d492026b72d58bf8e16c5e86779295f9093e376dcc001915c2c95')]);try{const clips=mesh2motionAddonActions(result.root,addon.root,addon.clips);result.clips.push(...clips);defaults.push(...mesh2motionAddonPoses(result.root,clips));}finally{disposeModel(addon.root);}
  }
  const retained=(savedLibrary.poses??[]).filter(pose=>savedLibrary.testPoseCleanup===1||owner?.id!=='quaternius'||pose.name!=='基础'||pose.id.startsWith('builtin:'));
  const poses=[...new Map([...retained,...defaults].map(pose=>[pose.id,pose])).values()];
  const data={...savedLibrary,model:metadata,poses,testPoseCleanup:1};

  const clips=owner?.poses?[]:result.clips.filter(clip=>Number.isFinite(clip.duration)&&clip.duration>0);
  for(const entry of savedLibrary.thirdParty??[]){const clip=decodeAction(entry,result.root)[0].clip;clip.thirdParty=true;clip.libraryId=entry.id;clips.push(clip);}
  return {root:result.root,name:result.name,rig,box,size,metadata,owner,poses,data,clips,info:modelInfo(result.root)};
 }catch(error){if(result)disposeModel(result.root);throw error;}
}

export async function fetchModelFiles(names,prefix,builtin){
 return Promise.all(names.map(async name=>{
  const response=await fetch(prefix+name);
  if(!response.ok)throw new Error('模型资源未准备，请运行 '+(builtin?.prepare??'npm.cmd run prepare:motion-demo'));
  return new File([await response.blob()],name);
 }));
}
