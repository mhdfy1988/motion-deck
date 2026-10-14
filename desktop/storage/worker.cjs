const {parentPort}=require('node:worker_threads');
const {DataService}=require('./service.cjs');
const service=new DataService();let queue=Promise.resolve();
const methods=new Set(['init','info','get','put','migrate','setDirectory','rememberExport','moveLibrary','makeBackup','restore','close']);
parentPort.on('message',({id,method,args})=>{
 queue=queue.then(async()=>{try{if(!methods.has(method))throw new Error('不支持的存储操作');const value=await service[method](args);parentPort.postMessage({id,value});}catch(error){parentPort.postMessage({id,error:error.message});}});
});
