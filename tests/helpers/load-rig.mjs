import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,values){this.type=type;Object.assign(this,values);}};

// 数值测试只去除材质/贴图；骨架、绑定矩阵与蒙皮来自实际分发素材。
export async function loadRig(file){
 return (await loadRigAsset(file)).scene;
}
export async function loadRigAsset(file){
 let data;
 if(file.endsWith('.gltf')){
  data=JSON.parse(await readFile(file,'utf8'));
  data.buffers[0].uri='data:application/octet-stream;base64,'+(await readFile(file.replace('.gltf','.bin'))).toString('base64');
 }else{
  const bytes=await readFile(file),length=bytes.readUInt32LE(12);data=JSON.parse(bytes.subarray(20,20+length));
  data.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+length).toString('base64');
 }
 delete data.materials;delete data.textures;delete data.images;
 for(const mesh of data.meshes)for(const primitive of mesh.primitives)delete primitive.material;
 return new GLTFLoader().parseAsync(JSON.stringify(data),'');
}
