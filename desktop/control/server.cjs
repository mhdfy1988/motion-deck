const net=require('node:net');
const {randomUUID,randomBytes,timingSafeEqual}=require('node:crypto');
const {mkdir,writeFile,rename,rm,lstat}=require('node:fs/promises');
const path=require('node:path');
const {request:validateRequest,reply:validateReply}=require('./validators.generated.cjs');
const {verifyPrivatePath}=require('./private-directory.cjs');
const {isRead,timeout}=require('./operation-policy.cjs');
const MAX_BYTES=256*1024;
const fail=(code,message)=>Object.assign(new Error(message),{code});

function createControlServer({personal,dispatch}){
 const directory=path.join(personal,'control'),discovery=path.join(directory,'instance.json');
 let active=null,queue=Promise.resolve();
 const state=()=>({enabled:!!active,protocolVersion:1,access:active?.writeEnabled?'pose-write':'read-only',timelineWrite:!!active?.timelineEnabled,sessionId:active?.sessionId??null});
 const permission=(current,operation)=>['view.capture','view.captureSequence'].includes(operation)?(current.writeEnabled||current.timelineEnabled):operation.startsWith('workspace.')?(current.writeEnabled&&current.timelineEnabled):operation.startsWith('pose.')?current.writeEnabled:current.timelineEnabled;
 async function stop(){
  const current=active;active=null;if(!current)return;
  for(const socket of current.sockets)socket.destroy();
  await new Promise(resolve=>current.server.close(resolve));
  await rm(discovery,{force:true});
 }
 async function start(){
  if(active)return state();
  await mkdir(directory,{recursive:true});if((await lstat(directory)).isSymbolicLink())throw fail('AUTH_FAILED','控制目录不可为链接');
  await verifyPrivatePath(directory,'protect');
  const current={sessionId:randomUUID(),token:randomBytes(32).toString('hex'),endpoint:'\\\\.\\pipe\\motiondeck-'+randomUUID(),sockets:new Set(),records:new Map(),writeEnabled:false,timelineEnabled:false,inFlight:0,writeQueue:Promise.resolve()};
  const respond=(socket,value)=>{const bytes=JSON.stringify(value)+'\n';if(Buffer.byteLength(bytes)>1024*1024){socket.destroy();return;}socket.end(bytes);};
  const errorReply=(request,error)=>({requestId:request?.requestId??'invalid',sessionId:current.sessionId,ok:false,error:{code:error.code??'INVALID_ARGUMENT',message:error.message.slice(0,300)}});
  current.server=net.createServer(socket=>{
   if(current.sockets.size>=8){socket.destroy();return;}current.sockets.add(socket);socket.on('close',()=>current.sockets.delete(socket));socket.on('error',()=>{});socket.setTimeout(30000,()=>socket.destroy());
   let buffers=[],length=0,received=false;
   socket.on('data',async bytes=>{
    if(received){socket.destroy();return;}length+=bytes.length;if(length>MAX_BYTES){socket.destroy();return;}buffers.push(bytes);
    const joined=Buffer.concat(buffers),newline=joined.indexOf(10);if(newline<0)return;received=true;
    let request;
    try{
     if(newline!==joined.length-1)throw fail('INVALID_ARGUMENT','每连接仅允许一条请求');
     request=JSON.parse(joined.subarray(0,newline).toString('utf8'));
     if(!validateRequest(request))throw fail('INVALID_ARGUMENT','请求结构或操作不在白名单');
     const a=Buffer.from(request.token,'hex'),b=Buffer.from(current.token,'hex');
     if(a.length!==b.length||!timingSafeEqual(a,b))throw fail('AUTH_FAILED','认证失败');
     if(request.sessionId!==current.sessionId||active!==current)throw fail('SESSION_CLOSED','会话已失效');
     socket.setTimeout(timeout(request.operation));
     const isWrite=!isRead(request.operation);
     if(isWrite&&!permission(current,request.operation))throw fail('WRITE_DISABLED','用户尚未允许此类操作');
     const {token,protocolVersion,...query}=request,signature=JSON.stringify(query),previous=current.records.get(query.requestId);
     if(previous){if(previous.signature!==signature)throw fail('REQUEST_ID_CONFLICT','请求编号已用于其他内容');respond(socket,await previous.promise);return;}
     const record={signature,status:'pending',operation:query.operation};
     record.promise=(async()=>{
      try{
       let reply;
       if(query.operation==='request.status'){
        const target=current.records.get(query.args.requestId);reply={requestId:query.requestId,sessionId:current.sessionId,ok:true,revision:target?.reply?.revision??0,result:{status:target?.status??'unknown',...(target?.reply&&target.operation!=='request.status'?{reply:target.reply}:{})}};
       }else if(isWrite){
        current.inFlight++;
        const task=current.writeQueue.then(()=>{if(active!==current||!permission(current,query.operation))throw fail('WRITE_DISABLED','操作授权已撤销');return dispatch(query);});
        current.writeQueue=task.catch(()=>{});
        try{reply=await task;}finally{current.inFlight--;}
       }else reply=await dispatch(query);
       if(active!==current)throw fail('SESSION_CLOSED','会话已失效');
       if(!validateReply(reply)||reply.requestId!==query.requestId||reply.sessionId!==current.sessionId)throw fail('INVALID_RESPONSE','客户端查询响应无效');
       return reply;
      }catch(error){return errorReply(query,error);}
     })();
     current.records.set(query.requestId,record);
     if(current.records.size>256){const oldest=[...current.records].find(([,r])=>r.status==='done');if(oldest)current.records.delete(oldest[0]);}
     const reply=await record.promise;record.status='done';record.reply=reply;respond(socket,reply);
    }catch(error){respond(socket,errorReply(request,error));}
   });
  });
  await new Promise((resolve,reject)=>{current.server.once('error',reject);current.server.listen(current.endpoint,resolve);});
  current.server.on('error',error=>{console.error('命令管道失败',error.code??'ERROR');void setEnabled(false).catch(error=>console.error('关闭命令管道失败',error.code??'ERROR'));});
  active=current;
  const temp=path.join(directory,'instance-'+current.sessionId+'.tmp');
  try{
   await writeFile(temp,JSON.stringify({protocolVersion:1,pid:process.pid,sessionId:current.sessionId,endpoint:current.endpoint,token:current.token}),{encoding:'utf8',flag:'wx'});
   await verifyPrivatePath(temp,'seal-file');await rename(temp,discovery);await verifyPrivatePath(discovery);
  }catch(error){await stop();await rm(temp,{force:true});throw fail('AUTH_FAILED','凭据目录或文件权限验证失败');}
  return state();
 }
 function setEnabled(enabled){if(typeof enabled!=='boolean')return Promise.reject(fail('INVALID_ARGUMENT','启用参数无效'));const task=queue.then(()=>enabled?start():stop().then(state));queue=task.catch(()=>{});return task;}
 function setWriteEnabled(value){if(typeof value!=='boolean'||!active)throw fail('INVALID_ARGUMENT','请先启用命令控制');if(active.inFlight)throw fail('BUSY','姿势操作正在收尾');active.writeEnabled=value;return state();}
 function setTimelineEnabled(value){if(typeof value!=='boolean'||!active)throw fail('INVALID_ARGUMENT','请先启用命令控制');if(active.inFlight)throw fail('BUSY','操作正在收尾');active.timelineEnabled=value;return state();}
 return {state,setEnabled,setWriteEnabled,setTimelineEnabled,hasPendingWrites:()=>!!active?.inFlight,close:()=>setEnabled(false)};
}
module.exports={createControlServer,MAX_BYTES};
