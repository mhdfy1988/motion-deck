const {parseArgs}=require('node:util');
const {readFile,stat}=require('node:fs/promises');
const {resolve}=require('node:path');
const {sendQuery}=require('./client.cjs');
// 开发脚本与客户端内置命令共用解析和协议。
async function run(args=process.argv.slice(2)){
 try{
  const {values}=parseArgs({args,options:{'data-dir':{type:'string'},request:{type:'string'},operation:{type:'string'},'request-id':{type:'string'},offset:{type:'string'},limit:{type:'string'},help:{type:'boolean'}},strict:true});
  if(values.help){console.log('MotionDeck-command.cmd --data-dir <absolute-personal-directory> --operation session.inspect\nUse --request <UTF-8 JSON file> for operation/args/requestId/modelKey/expectedRevision. Pose and timeline writes require separate session permission.');return;}
  if(!values['data-dir']||Boolean(values.request)===Boolean(values.operation))throw Object.assign(new Error('指定 --data-dir，以及 --operation 或 --request 二选一'),{code:'INVALID_ARGUMENT'});
  let input;
  if(values.request){const file=resolve(values.request);if((await stat(file)).size>256*1024)throw new Error('请求文件超限');input=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));if(!input||typeof input!=='object'||Object.keys(input).some(key=>!['operation','args','requestId','modelKey','expectedRevision','assistantSessionId'].includes(key)))throw new Error('请求文件包含未知字段');}
  else input={operation:values.operation,args:{...(values.offset!==undefined?{offset:Number(values.offset)}:{}),...(values.limit!==undefined?{limit:Number(values.limit)}:{})},...(values['request-id']?{requestId:values['request-id']}:{})};
  const reply=await sendQuery(values['data-dir'],input);console.log(JSON.stringify(reply));if(!reply.ok)process.exitCode=1;
 }catch(error){console.log(JSON.stringify({ok:false,error:{code:error.code??'INVALID_ARGUMENT',message:error.message.slice(0,300)}}));process.exitCode=1;}
}
module.exports={run};
