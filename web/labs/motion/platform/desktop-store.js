const bridge=globalThis.motionDeckDesktop;
export async function encodeRecord(record){
 const files=[];
 async function encode(value){
  if(value instanceof Blob){const slot=files.length;files.push(null);files[slot]={name:value instanceof File?value.name:null,mime:value.type,modified:value instanceof File?value.lastModified:0,bytes:await value.arrayBuffer()};return {__motiondeckFile:slot};}
  if(Array.isArray(value))return Promise.all(value.map(encode));
  if(value&&typeof value==='object'){const result={};for(const [key,item] of Object.entries(value))result[key]=await encode(item);return result;}
  return value;
 }
 return {id:record.id,json:JSON.stringify(await encode(record)),files};
}
export function decodeRecord(record){
 if(!record)return undefined;
 function decode(value){
  if(value&&typeof value==='object'&&Object.keys(value).length===1&&Number.isInteger(value.__motiondeckFile)){
   const file=record.files[value.__motiondeckFile];if(!file)throw new Error('素材文件引用损坏');return file.name===null?new Blob([file.bytes],{type:file.mime}):new File([file.bytes],file.name,{type:file.mime,lastModified:file.modified});
  }
  if(Array.isArray(value))return value.map(decode);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,decode(item)]));
  return value;
 }
 return decode(JSON.parse(record.json));
}
let prepared;
async function migrateOldDatabase(){
 const info=await bridge.migrationInfo();if(!info.migrationNeeded)return;
 // 仅迁移当前客户端、当前来源的旧库；不访问Chrome或动作工坊数据库。
 const databases=await indexedDB.databases(),existing=databases.find(db=>db.name==='motion-deck.library.v1');let records=[];
 if(existing){const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(existing.name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{records=await new Promise((resolve,reject)=>{const tx=db.transaction('images','readonly'),request=tx.objectStore('images').getAll();tx.oncomplete=()=>resolve(request.result);tx.onabort=tx.onerror=()=>reject(tx.error);});}finally{db.close();}
 }
 await bridge.migrateRecords(await Promise.all(records.map(encodeRecord)));
}
function ready(){if(!prepared)prepared=migrateOldDatabase();return prepared;}
export async function desktopPut(records,deleteIds){await ready();return bridge.putRecords({records:await Promise.all(records.map(encodeRecord)),deleteIds});}
export async function desktopGet(id){await ready();return decodeRecord(await bridge.getRecord(id));}
