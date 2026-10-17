const {Worker}=require('node:worker_threads');
const path=require('node:path');
function createStorageClient(){
 const worker=new Worker(path.join(__dirname,'worker.bundle.cjs')),pending=new Map();let next=0,failure=null,closing=false,terminating=false,closePromise=null;
 worker.on('message',({id,value,error})=>{const promise=pending.get(id);if(!promise)return;pending.delete(id);error?promise.reject(new Error(error)):promise.resolve(value);});
 const fail=error=>{failure??=error;for(const promise of pending.values())promise.reject(failure);pending.clear();};worker.on('error',fail);
 // 正常退出码也可能是意外退出；不能留下永远等不到回复的请求。
 worker.on('exit',code=>fail(new Error(terminating?'后台存储已关闭':'后台存储退出：'+code)));
 const request=(method,args)=>{if(failure)return Promise.reject(failure);return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});try{worker.postMessage({id,method,args});}catch(error){pending.delete(id);reject(error);}});};
 const call=(method,args)=>closing?Promise.reject(new Error('后台存储正在关闭或已关闭')):request(method,args);
 return {call,close(){
  if(closePromise)return closePromise;
  closing=true;
  closePromise=(async()=>{try{await request('close');}finally{terminating=true;try{await worker.terminate();}finally{fail(new Error('后台存储已关闭'));}}})();
  return closePromise;
 }};
}
module.exports={createStorageClient};
