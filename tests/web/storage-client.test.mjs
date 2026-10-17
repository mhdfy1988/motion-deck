import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import path from 'node:path';
import {Worker as NodeWorker} from 'node:worker_threads';

function fixture(workerScript){
 let worker;
 class Worker extends EventEmitter{
  sent=[];terminated=0;postError=null;
  constructor(){super();worker=this;}
  postMessage(value){if(this.postError)throw this.postError;this.sent.push(value);}
  async terminate(){this.terminated++;this.emit('exit',1);}
 }
 const WorkerClass=workerScript?class extends NodeWorker{constructor(){super(workerScript,{eval:true});worker=this;}}:Worker;
 const module={exports:{}};
 vm.runInNewContext(readFileSync(new URL('../../desktop/storage/client.cjs',import.meta.url),'utf8'),{
  module,__dirname:path.resolve('desktop/storage'),require:name=>name==='node:worker_threads'?{Worker:WorkerClass}:path,
 });
 return {client:module.exports.createStorageClient(),get worker(){return worker;}};
}

for(const code of [0,1])test(`存储线程意外退出${code}立即结束在途及后续请求`,{timeout:1000},async()=>{
 const {client,worker}=fixture(),first=client.call('info'),second=client.call('get');
 const checks=[assert.rejects(first,/后台存储退出/),assert.rejects(second,/后台存储退出/)];
 worker.emit('exit',code);await Promise.all(checks);
 await assert.rejects(client.call('info'),/后台存储退出/);assert.equal(worker.sent.length,2);
});

test('线程错误保持首个原因，迟到响应和后续退出不再恢复请求',async()=>{
 const {client,worker}=fixture(),request=client.call('info'),check=assert.rejects(request,/存储损坏/);
 worker.emit('error',new Error('存储损坏'));worker.emit('message',{id:1,value:'late'});worker.emit('exit',0);
 await check;await assert.rejects(client.call('info'),/存储损坏/);
});

test('主动关闭等待存储确认，拒绝新请求，重复关闭只终止一次',async()=>{
 const {client,worker}=fixture(),request=client.call('info');
 const first=client.close(),second=client.close();
 await assert.rejects(client.call('put'),/关闭/);assert.equal(worker.terminated,0);
 worker.emit('message',{id:1,value:{ok:true}});await request;
 const closeMessage=worker.sent.find(item=>item.method==='close');worker.emit('message',{id:closeMessage.id,value:null});
 await Promise.all([first,second]);assert.equal(worker.terminated,1);
 await assert.rejects(client.call('info'),/关闭/);assert.equal(worker.sent.length,2);
});

test('关闭确认前意外退出不会伪装正常关闭或永久等待',{timeout:1000},async()=>{
 const {client,worker}=fixture(),close=client.close(),check=assert.rejects(close,/后台存储退出/);
 worker.emit('exit',0);await check;assert.equal(worker.terminated,1);
});

test('发送同步失败立即拒绝且不遗留在途请求',async()=>{
 const {client,worker}=fixture();worker.postError=new Error('无法发送');
 await assert.rejects(client.call('info'),/无法发送/);
 worker.emit('exit',0);await assert.rejects(client.call('get'),/后台存储退出/);
});

test('真实Node线程零码退出也拒绝请求，不创建存储服务或接触磁盘',{timeout:3000},async()=>{
 const {client,worker}=fixture("require('node:worker_threads').parentPort.once('message',()=>process.exit(0));");
 try{
  await assert.rejects(client.call('info'),/后台存储退出：0/);
  await assert.rejects(client.call('get'),/后台存储退出：0/);
 }finally{await worker.terminate();}
});
