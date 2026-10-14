import {validateLibrary} from '../core/action-codec.js';
export {encodeAction,decodeAction,validateLibrary,validatePoses} from '../core/action-codec.js';
import {putImages,getImage} from '../platform/indexeddb-store.js';
import {readCatalog,catalogRecord,CATALOG_ID} from './model-catalog.js';

// 沿用工程已有的浏览器素材事务；独立命名空间，不与工作流素材混用。
const PREFIX='motion-library-v1:',LAST='motion-library-last-v1';
export async function modelKey(files){
 const hashes=[];
 for(const file of [...files].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());hashes.push([file.name,[...new Uint8Array(hash)]]);}
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(hashes)));
 return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function readLibrary(key){const record=await getImage(PREFIX+key);if(!record)return {version:1,modelKey:key,actions:[]};return validateLibrary(record.data,key);}
// 用户明确授权删除旧内置测试人偶，只按其来源身份精确清理，不删除外部导入或默认人偶。
export async function removeLegacyTestModels(){
 const catalog=await readCatalog(),removed=catalog.models.filter(model=>model.builtinId==='makehuman');if(!removed.length)return;
 const keys=new Set(removed.map(model=>model.key)),ids=removed.map(model=>PREFIX+model.key),pointer=await getImage(LAST);
 if(pointer&&keys.has(pointer.modelKey))ids.push(LAST);
 await putImages([{id:CATALOG_ID,kind:'motion-model-catalog',data:{version:1,models:catalog.models.filter(model=>!keys.has(model.key))}}],ids);
}
export async function saveLibrary(data,files){
 validateLibrary(data,data.modelKey);
 const records=[{id:PREFIX+data.modelKey,kind:'motion-library',data,files:[...files]},{id:LAST,kind:'motion-library-pointer',modelKey:data.modelKey}];
 if(data.model)records.push(catalogRecord(await readCatalog(),data.modelKey,data.model));
 await putImages(records);
}
export async function savedModel(key){if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw new Error('保存的模型标识损坏');const record=await getImage(PREFIX+key);if(!record||record.kind!=='motion-library'||!Array.isArray(record.files)||!record.files.length)throw new Error('保存的模型文件缺失');validateLibrary(record.data,key);if(await modelKey(record.files)!==key)throw new Error('保存的模型文件校验失败');return record;}
export async function lastSavedModel(){const pointer=await getImage(LAST);if(!pointer)return null;if(pointer.kind!=='motion-library-pointer')throw new Error('上次保存的模型标识损坏');return savedModel(pointer.modelKey);}
