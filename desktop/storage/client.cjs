const {Worker}=require('node:worker_threads');
const path=require('node:path');
function createStorageClient(){
 const worker=new Worker(path.join(__dirname,'worker.bundle.cjs')),pending=new Map();let next=0,failure=null;
 worker.on('message',({id,value,error})=>{const promise=pending.get(id);if(!promise)return;pending.delete(id);error?promise.reject(new Error(error)):promise.resolve(value);});
 const fail=error=>{failure=error;for(const promise of pending.values())promise.reject(error);pending.clear();};worker.on('error',fail);worker.on('exit',code=>{if(code)fail(new Error('后台存储退出：'+code));});
 const call=(method,args)=>{if(failure)return Promise.reject(failure);return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});worker.postMessage({id,method,args});});};
 return {call,async close(){await call('close');await worker.terminate();}};
}
module.exports={createStorageClient};
