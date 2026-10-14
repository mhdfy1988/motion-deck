import {test,expect,_electron as electron} from '@playwright/test';
import {mkdir,mkdtemp,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';

test('初始化期间正常退出，不继续读已关闭数据库或弹启动错误',async()=>{
 const root=resolve('.');await mkdir(join(root,'output/desktop-tests'),{recursive:true});
 const executablePath=process.env.MOTIONDECK_PACKAGED_EXE??createRequire(import.meta.url)('electron');
 for(let attempt=0;attempt<5;attempt++){
  const dataDir=await mkdtemp(join(root,'output/desktop-tests/start-stop-')),errorFile=join(dataDir,'startup-error.txt');
  const env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
  const client=await electron.launch({executablePath,args:process.env.MOTIONDECK_PACKAGED_EXE?['--smoke-hidden']:[root,'--smoke-hidden'],env});
  try{
   const closed=new Promise(resolve=>client.once('close',resolve));
   // 不等待窗口创建，覆盖初始化与主动退出重叠的真实入口；仅测试进程截获错误框。
   await client.evaluate(({app,dialog},file)=>{dialog.showErrorBox=(title,message)=>process.getBuiltinModule('node:fs').writeFileSync(file,title+'\n'+message);app.quit();},errorFile).catch(error=>{if(!/closed|Target/.test(error.message))throw error;});
   let deadline;try{await Promise.race([closed,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('正常退出超时')),10000);})]);}finally{clearTimeout(deadline);}
   expect(await stat(errorFile).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;})).toBe(false);
  }finally{await client.close();}
 }
});
