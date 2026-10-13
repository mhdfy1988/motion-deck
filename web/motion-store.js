// 图片和视频原文件与画布清单分开保存；事务完成后才能发布资产引用。
const DB_NAME='motion-deck.library.v1';
let database;
function openDatabase(){
  if(!database)database=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('images',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>{database=null;reject(new Error('无法打开本机素材库'));};
    request.onblocked=()=>{database=null;reject(new Error('素材库被其他页面占用，请关闭旧页面后重试'));};
  });
  return database;
}
export async function putImage(record){return putImages([record]);}
// 多份关联记录在同一事务内提交，防止目录已更新但素材尚未保存。
export async function putImages(records,deleteIds=[]){
  const db=await openDatabase();
  await new Promise((resolve,reject)=>{
    const transaction=db.transaction('images','readwrite');
    transaction.oncomplete=resolve;
    transaction.onabort=transaction.onerror=()=>reject(new Error('素材保存失败，请检查浏览器存储空间'));
    try{for(const id of deleteIds)transaction.objectStore('images').delete(id);for(const record of records)transaction.objectStore('images').put(record);}
    catch(error){transaction.abort();reject(error);}
  });
}
export async function getImage(id){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction('images','readonly');
    const request=transaction.objectStore('images').get(id);
    transaction.oncomplete=()=>resolve(request.result);
    transaction.onabort=transaction.onerror=()=>reject(new Error('读取本机素材失败'));
  });
}
export async function prepareImage(file){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('请选择 PNG、JPG 或 WebP 图片');
  if(file.size>20*1024*1024)throw new Error('图片不能超过 20 MB');
  let bitmap;
  try{bitmap=await createImageBitmap(file);}catch{throw new Error('图片无法解码，请检查文件是否损坏');}
  const {width,height}=bitmap;bitmap.close();
  if(!width||!height||width*height>40_000_000)throw new Error('图片尺寸不能超过 4000 万像素');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join('');
  return {id:crypto.randomUUID(),name:file.name,width,height,contentHash:hash,blob:file};
}

export async function prepareVideo(file){
  if(!file||!(/\.(mp4|webm|mov)$/i.test(file.name)))throw new Error('请选择 MP4、WebM 或 MOV 视频');
  if(file.size>256*1024*1024)throw new Error('视频不能超过 256 MB');
  const url=URL.createObjectURL(file),video=document.createElement('video');
  let metadata;
  try{
    metadata=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('视频读取超时，请检查格式')),15000);
      video.onloadedmetadata=()=>{clearTimeout(timer);resolve({width:video.videoWidth,height:video.videoHeight,duration:video.duration});};
      video.onerror=()=>{clearTimeout(timer);reject(new Error('视频无法解码，当前浏览器可能不支持此编码'));};
      video.preload='metadata';video.src=url;
    });
  }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
  if(!metadata.width||!metadata.height||!Number.isFinite(metadata.duration)||metadata.duration<=0)throw new Error('视频没有有效画面或时长');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join('');
  return {id:crypto.randomUUID(),name:file.name,...metadata,contentHash:hash,blob:file};
}
