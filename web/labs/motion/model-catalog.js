import valid from './catalog-validator.generated.js';
import {getImage} from '../../motion-store.js';

// 模型目录只登记来源和内容身份，动画与姿势仍由现有模型库保存。
export const CATALOG_ID='motion-model-catalog-v1';
export const builtins=[{id:'quaternius',name:'Quaternius',files:['AnimationLibrary_Godot_Standard.gltf','AnimationLibrary_Godot_Standard.bin'],prefix:'/fixtures/quaternius/',source:'Quaternius 人偶与动作 · MakeHuman Community 姿势（Cinevva 整理） · CC0',url:'https://app.cinevva.com/tools/animations',prepare:'npm.cmd run prepare:motion-demo'},{id:'mesh2motion',name:'Mesh2Motion',files:['m2m-human-base-animations.glb'],prefix:'/fixtures/candidates/',source:'Mesh2Motion 白色人偶与87个基础动作 · CC0',url:'https://github.com/Mesh2Motion/mesh2motion-app',prepare:'node scripts/prepare-motion-candidates.mjs'}];
export async function readCatalog(){
 const record=await getImage(CATALOG_ID);if(!record)return {version:1,models:[]};
 if(record.kind!=='motion-model-catalog'||!valid(record.data)||new Set(record.data.models.map(m=>m.key)).size!==record.data.models.length)throw new Error('模型目录损坏');
 return record.data;
}
export function catalogRecord(catalog,key,model){
 const data={version:1,models:[...catalog.models.filter(m=>m.key!==key),{key,...model}]};
 if(!valid(data))throw new Error('模型目录记录无效');return {id:CATALOG_ID,kind:'motion-model-catalog',data};
}
