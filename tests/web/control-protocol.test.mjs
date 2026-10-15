import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
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
const {verifyPrivatePath}=require('../../desktop/control/private-directory.cjs');
async function ownerFixture(target,mode='inspect'){
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toUpperCase()!=='PSMODULEPATH'));
 const {stdout}=await promisify(execFile)(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve('tests/helpers/control-owner-fixture.ps1'),'-Target',target,'-Mode',mode],{env,windowsHide:true});
 return JSON.parse(stdout);
}
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

test('Windows所有者：初始化归属当前用户，读取不修复篡改，临时文件需私有父目录',async t=>{
 await mkdir(resolve('output/control-tests'),{recursive:true});const personal=await mkdtemp(resolve('output/control-tests/owner-')),directory=join(personal,'control');await mkdir(directory);
 const before=await ownerFixture(directory);t.diagnostic(JSON.stringify({initialOwner:before.owner,current:before.current,elevated:before.elevated}));
 await assert.rejects(verifyPrivatePath(directory));
 await verifyPrivatePath(directory,'protect');assert.equal((await ownerFixture(directory)).owner,before.current);
 const temp=join(directory,'instance-11111111-1111-1111-1111-111111111111.tmp');await writeFile(temp,'fixture',{flag:'wx'});
 await verifyPrivatePath(temp,'seal-file');await verifyPrivatePath(temp);assert.equal((await ownerFixture(temp)).owner,before.current);
 await assert.rejects(verifyPrivatePath(temp,'protect'));
 // GitHub提权运行器会进入此分支；普通本地账号照常执行其他全部断言。
 if(before.elevated){
  await ownerFixture(temp,'admin-owner');await assert.rejects(verifyPrivatePath(temp),/owner mismatch/);
  await assert.rejects(verifyPrivatePath(temp,'protect'));
  assert.equal((await ownerFixture(temp)).owner,'S-1-5-32-544');
  await verifyPrivatePath(temp,'seal-file');assert.equal((await ownerFixture(temp)).owner,before.current);
  await ownerFixture(directory,'admin-owner');await assert.rejects(verifyPrivatePath(directory),/owner mismatch/);
  await verifyPrivatePath(directory,'protect');await verifyPrivatePath(directory);
 }
 const unsafe=join(personal,'unsafe');await mkdir(unsafe);const outside=join(unsafe,'instance-22222222-2222-2222-2222-222222222222.tmp');await writeFile(outside,'fixture',{flag:'wx'});
 await assert.rejects(verifyPrivatePath(outside,'seal-file'));
});
