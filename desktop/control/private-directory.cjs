const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {lstat}=require('node:fs/promises');
const path=require('node:path');
async function verifyPrivatePath(directory,mode='verify'){
 if(process.platform!=='win32')throw Object.assign(new Error('命令控制目前仅支持Windows'),{code:'UNSUPPORTED_PLATFORM'});
 if(!path.isAbsolute(directory)||(await lstat(directory)).isSymbolicLink())throw new Error('命令凭据路径无效');
 // 仅当前子进程执行项目自带脚本；不更改系统/用户执行策略。
 // Node中间进程会原样继承PS7模块路径；按微软文档让5.1重建自己的模块路径。
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toUpperCase()!=='PSMODULEPATH'));
 // 外部PowerShell不能读取ASAR虚拟文件；打包明确将此唯一辅助脚本解包。
 const helper=path.join(__dirname,'protect-directory.ps1').split(path.sep).map(part=>part==='app.asar'?'app.asar.unpacked':part).join(path.sep);
 await promisify(execFile)(path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-Directory',directory,'-Mode',mode],{env,windowsHide:true,timeout:10000,maxBuffer:4096});
}
module.exports={verifyPrivatePath};
