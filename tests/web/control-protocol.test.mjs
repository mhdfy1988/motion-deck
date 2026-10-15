import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createSessionState} from '../../web/labs/motion/application/session-state.js';
import {createWorkbenchOperations} from '../../web/labs/motion/application/workbench-operations.js';
import {answerControlQuery} from '../../web/labs/motion/application/control-queries.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const require=createRequire(import.meta.url),{createControlServer}=require('../../desktop/control/server.cjs'),{sendQuery,readConnection}=require('../../desktop/control/client.cjs');
const {request:validate}=require('../../desktop/control/validators.generated.cjs');
function raw(info,request,chunks=false){return new Promise((resolve,reject)=>{const socket=net.createConnection(info.endpoint);let text='';socket.on('error',reject);socket.setTimeout(3000,()=>socket.destroy(new Error('test timeout')));socket.on('connect',()=>{const bytes=Buffer.from(JSON.stringify(request)+'\n');if(chunks){socket.write(bytes.subarray(0,7));setTimeout(()=>socket.write(bytes.subarray(7)),5);}else socket.write(bytes);});socket.on('data',bytes=>{text+=bytes.toString();if(text.includes('\n')){socket.destroy();resolve(JSON.parse(text));}});});}
test('协议拒绝缺少版本的写请求、未知参数和非法分页，不暴露工作台方法',()=>{
 const request={protocolVersion:1,requestId:'r',sessionId:'s',token:'0'.repeat(64),operation:'session.inspect',args:{}};
 assert.equal(validate(request),true);for(const invalid of [{...request,operation:'pose.setBones'},{...request,args:{execute:'x'}},{...request,operation:'rig.list',args:{limit:101}},{...request,protocolVersion:2}])assert.equal(validate(invalid),false);
 const positionRequest={...request,operation:'pose.setBones',modelKey:'a'.repeat(64),expectedRevision:1,args:{changes:[{id:'node:1',quaternion:[0,0,0,1],position:[0,.5,0]}]}};
 assert.equal(validate(positionRequest),true);assert.equal(validate({...positionRequest,args:{changes:[{...positionRequest.args.changes[0],position:[0,Infinity,0]}]}}),false);
 const workbench=createWorkbenchOperations(createSessionState(null));assert.equal(answerControlQuery(workbench,{requestId:'r',sessionId:'s',operation:'session.inspect',args:{}}).result.status,'loading');
 assert.throws(()=>answerControlQuery(workbench,{requestId:'r',sessionId:'s',operation:'close',args:{}}),{code:'INVALID_ARGUMENT'});
});
test('Windows真实管道/ACL：分片、认证、过期、去重、状态与禁用',async()=>{
 await mkdir(resolve('output/control-tests'),{recursive:true});const personal=await mkdtemp(resolve('output/control-tests/profile-'));let calls=0;
 const server=createControlServer({personal,dispatch:async query=>{calls++;return {requestId:query.requestId,sessionId:query.sessionId,ok:true,revision:1,result:{name:'测试模型'}};}});
 assert.equal(server.state().enabled,false);
 try{
  await server.setEnabled(true);const info=await readConnection(personal),request={protocolVersion:1,token:info.token,sessionId:info.sessionId,requestId:'test-query',operation:'model.inspect',args:{}};
  const result=await raw(info,request,true);assert.equal(result.result.name,'测试模型');assert.equal((await raw(info,request)).ok,true);assert.equal(calls,1);
  assert.equal((await raw(info,{...request,operation:'session.inspect'})).error.code,'REQUEST_ID_CONFLICT');
  assert.equal((await raw(info,{...request,requestId:'bad-token',token:'0'.repeat(64)})).error.code,'AUTH_FAILED');
  assert.equal((await raw(info,{...request,requestId:'old-session',sessionId:'old'})).error.code,'SESSION_CLOSED');
  assert.equal((await raw(info,{...request,requestId:'write',operation:'pose.setBones'})).error.code,'INVALID_ARGUMENT');
  const write={...request,requestId:'pose-command',operation:'pose.undo',modelKey:'a'.repeat(64),expectedRevision:1};
  assert.equal((await raw(info,write)).error.code,'WRITE_DISABLED');server.setWriteEnabled(true);assert.equal((await raw(info,write)).ok,true);server.setWriteEnabled(false);assert.equal(server.state().access,'read-only');
  const timeline={...request,requestId:'timeline-command',operation:'timeline.undo',modelKey:'a'.repeat(64),expectedRevision:1};
  server.setWriteEnabled(true);assert.equal((await raw(info,timeline)).error.code,'WRITE_DISABLED');server.setWriteEnabled(false);server.setTimelineEnabled(true);assert.equal(server.state().timelineWrite,true);assert.equal((await raw(info,timeline)).ok,true);assert.equal((await raw(info,{...write,requestId:'pose-denied'})).error.code,'WRITE_DISABLED');server.setTimelineEnabled(false);
  const status=await sendQuery(personal,{operation:'request.status',args:{requestId:'test-query'}});assert.equal(status.result.status,'done');
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toUpperCase()!=='PSMODULEPATH'));
  await promisify(execFile)(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve('tests/helpers/control-acl-tamper.ps1'),'-Directory',join(personal,'control')],{env,windowsHide:true});
  await assert.rejects(readConnection(personal),{code:'AUTH_FAILED'});
  await server.setEnabled(false);assert.equal(server.state().enabled,false);await assert.rejects(readFile(join(personal,'control/instance.json')),{code:'ENOENT'});
 }finally{await server.close();}
});
