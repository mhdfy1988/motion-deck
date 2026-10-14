import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
export {THREE,OrbitControls};

export function disposeModel(root){const textures=new Set(),materials=new Set(),geometries=new Set();root.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])if(material){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});textures.forEach(t=>{t.dispose();t.source?.data?.close?.();});materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());}
export function modelInfo(root){const bones=[],skins=[];root.traverse(node=>{if(node.isBone)bones.push(node);if(node.isSkinnedMesh)skins.push(node);});return {bones,skins};}
export function compatibleClips(root,clips){
  if(!clips.length)throw new Error('该文件没有动画');
  return clips.map(clip=>{
    if(!Number.isFinite(clip.duration)||clip.duration<=0||!clip.tracks.length)throw new Error('动作时长或轨道无效');
    for(const track of clip.tracks){const binding=THREE.PropertyBinding.parseTrackName(track.name),target=THREE.PropertyBinding.findNode(root,binding.nodeName);if(!target)throw new Error(`动作骨骼/节点不匹配：${binding.nodeName}。本页不自动重定向。`);if(binding.objectName||binding.propertyIndex!==undefined||!['position','quaternion','scale'].includes(binding.propertyName))throw new Error(`暂不支持此动画轨道：${track.name}`);if(!target[binding.propertyName])throw new Error(`动作属性不存在：${track.name}`);}
    return clip;
  });
}
export function assertSameRig(target,source){
  const a=modelInfo(target).bones,b=modelInfo(source).bones;if(!a.length||!b.length)throw new Error('追加动作需要两侧均有骨骼');
  const byName=new Map(a.map(bone=>[bone.name,bone]));if(byName.size!==a.length||new Set(b.map(bone=>bone.name)).size!==b.length)throw new Error('骨骼名称重复，无法可靠匹配');
  if(a.length!==b.length)throw new Error('骨骼数量不同，需要重定向');
  for(const bone of b){const match=byName.get(bone.name);if(!match||(match.parent?.isBone?match.parent.name:'')!==(bone.parent?.isBone?bone.parent.name:''))throw new Error(`骨架结构不匹配：${bone.name}`);if(match.position.distanceTo(bone.position)>0.001||match.quaternion.angleTo(bone.quaternion)>0.01||match.scale.distanceTo(bone.scale)>0.001)throw new Error(`初始骨骼变换不同：${bone.name}，需先统一骨架`);}
}
export async function loadFiles(files){
  const all=[...files],entries=all.filter(f=>/\.(glb|gltf|fbx)$/i.test(f.name));if(entries.length!==1)throw new Error('一次选择一个模型/动作文件，可附带贴图与 BIN');
  if(all.reduce((sum,file)=>sum+file.size,0)>256*1024*1024)throw new Error('单次导入不能超过256 MiB');
  const urls=new Map(),manager=new THREE.LoadingManager();let resourceError='';
  let resolveResources;const resourcesReady=new Promise(resolve=>{resolveResources=resolve;});
  manager.onLoad=resolveResources;
  // 哨兵保证同步解析完成后再判定全部贴图已经加载。
  manager.itemStart('motion-import');
  const urlFor=file=>{if(!urls.has(file))urls.set(file,URL.createObjectURL(file));return urls.get(file);};
  manager.setURLModifier(url=>{
    if(url.startsWith('data:')||[...urls.values()].includes(url))return url;
    if(/^(https?:|\/\/)/i.test(url))throw new Error('不加载模型中的远程资源，请一并选择本地资源');
    const name=decodeURIComponent(url.replaceAll('\\','/').split('/').pop()),matches=all.filter(f=>f.name===name);
    if(matches.length!==1)throw new Error(`资源缺失或重名：${name}`);return urlFor(matches[0]);
  });manager.onError=url=>{resourceError=`资源加载失败：${url.startsWith('blob:')?'本地文件':url}`;};
  try{const file=entries[0],data=await file.arrayBuffer();let root,clips;if(/\.fbx$/i.test(file.name)){root=new FBXLoader(manager).parse(data,'');clips=root.animations;}else{const result=await new GLTFLoader(manager).parseAsync(/\.gltf$/i.test(file.name)?new TextDecoder().decode(data):data,'');root=result.scene;clips=result.animations;}
    manager.itemEnd('motion-import');await resourcesReady;
    if(resourceError){disposeModel(root);throw new Error(resourceError);}return {root,clips,name:file.name};
  }finally{urls.forEach(url=>URL.revokeObjectURL(url));}
}
