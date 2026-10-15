const net=require('node:net');
const {randomUUID}=require('node:crypto');
const {readFile,stat}=require('node:fs/promises');
const path=require('node:path');
const {verifyPrivatePath}=require('./private-directory.cjs');
const {request:validateRequest,reply:validateReply}=require('./validators.generated.cjs');
const {timeout}=require('./operation-policy.cjs');
const failure=(code,message)=>Object.assign(new Error(message),{code});
async function readConnection(personal){
 if(!path.isAbsolute(personal))throw failure('INVALID_ARGUMENT','必须明确指定绝对个人目录');
 const directory=path.join(personal,'control'),file=path.join(directory,'instance.json');
 try{
  await verifyPrivatePath(directory);await verifyPrivatePath(file);
  if((await stat(file)).size>4096)throw failure('AUTH_FAILED','发现文件过大');
  const info=JSON.parse(await readFile(file,'utf8'));
  if(info.protocolVersion!==1||!Number.isInteger(info.pid)||info.pid<1||typeof info.sessionId!=='string'||!/^[-a-f0-9]{36}$/.test(info.sessionId)||typeof info.token!=='string'||!/^[a-f0-9]{64}$/.test(info.token)||typeof info.endpoint!=='string'||!info.endpoint.startsWith('\\\\.\\pipe\\motiondeck-')||!/^[-a-f0-9]{36}$/.test(info.endpoint.slice('\\\\.\\pipe\\motiondeck-'.length)))throw failure('AUTH_FAILED','发现文件无效');
  return info;
 }catch(error){throw failure(error.code==='ENOENT'?'NO_INSTANCE':'AUTH_FAILED',error.code==='ENOENT'?'没有已启用命令控制的实例':'发现文件或访问权限验证失败');}
}
async function sendQuery(personal,input){
 const info=await readConnection(personal),request={...input,requestId:input.requestId??randomUUID(),args:input.args??{},sessionId:info.sessionId,protocolVersion:1,token:info.token};
 if(!validateRequest(request))throw failure('INVALID_ARGUMENT','请求无效或操作不在白名单');
 return new Promise((resolve,reject)=>{
  const socket=net.createConnection(info.endpoint),buffers=[];let length=0,done=false;
  const finish=(error,reply)=>{if(done)return;done=true;clearTimeout(timer);socket.destroy();if(error)reject(error);else resolve(reply);};
  const timer=setTimeout(()=>finish(failure('RESULT_UNKNOWN','等待超时；请用原请求编号查询 request.status：'+request.requestId)),timeout(request.operation));
  socket.on('error',()=>finish(failure('NO_INSTANCE','实例已关闭或连接失败')));
  socket.on('connect',()=>socket.write(JSON.stringify(request)+'\n'));
  socket.on('data',bytes=>{length+=bytes.length;if(length>1024*1024)return finish(failure('INVALID_RESPONSE','响应超限'));buffers.push(bytes);const joined=Buffer.concat(buffers),end=joined.indexOf(10);if(end<0)return;
   try{const reply=JSON.parse(joined.subarray(0,end).toString('utf8'));if(!validateReply(reply)||reply.requestId!==request.requestId||reply.sessionId!==info.sessionId)throw new Error();finish(null,reply);}catch{finish(failure('INVALID_RESPONSE','响应无效或会话不匹配'));}
  });socket.on('end',()=>{if(!done)finish(failure('SESSION_CLOSED','实例连接已结束'));});
 });
}
module.exports={sendQuery,readConnection};
