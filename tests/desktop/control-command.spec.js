import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,writeFile,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {waitForModel} from '../motion-lab/model-ready-helper.js';
const runFile=promisify(execFile);

test('A2 真实客户端与外部命令：启用/权限/两模型查询/拒绝写入/刷新禁用',async()=>{
 const root=resolve('.');await mkdir(join(root,'output/a2-acceptance'),{recursive:true});const dataDir=await mkdtemp(join(root,'output/a2-acceptance/profile-'));
 const executablePath=process.env.MOTIONDECK_PACKAGED_EXE??createRequire(import.meta.url)('electron'),env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
 const client=await electron.launch({executablePath,args:process.env.MOTIONDECK_PACKAGED_EXE?['--smoke-hidden']:[root,'--smoke-hidden'],env,timeout:30000});
 const command=async(operation,extra=[])=>{const result=await runFile(process.execPath,[join(root,'scripts/motion-command.mjs'),'--data-dir',dataDir,'--operation',operation,...extra],{windowsHide:true,timeout:20000});return JSON.parse(result.stdout);};
 try{
  const page=await client.firstWindow(),errors=[],results=[];page.on('pageerror',error=>errors.push(error.message));await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await waitForModel(page,{actions:162});
  expect((await page.evaluate(()=>window.motionDeckDesktop.controlState())).enabled).toBe(false);
  await page.locator('#desktopSettings').click();await page.locator('#desktopControlToggle').click();await expect(page.locator('#desktopControlToggle')).toHaveAttribute('aria-checked','true');await page.locator('#closeDesktopSettings').click();
  for(const [model,actions] of [['mesh2motion',162],['quaternius',117]]){
   if(model==='quaternius'){await page.locator('#replaceModel').selectOption(model);await waitForModel(page,{actions});}
   const session=await command('session.inspect'),info=await command('model.inspect'),rig=await command('rig.list',['--limit','2']),library=await command('library.list',['--limit','3']);
   expect(session.ok).toBe(true);expect(session.result.counts.actions).toBe(actions);expect(info.result.builtinId).toBe(model);expect(rig.result.entries).toHaveLength(2);expect(library.result.entries).toHaveLength(3);expect(info.result.modelKey).toBe(session.result.modelKey);
   results.push({session,info,rig,library});
  }
  // 在真实外部进程验证拒绝写入，不通过页面内直接调用替代命令链。
  await expect(command('pose.setBones')).rejects.toThrow();
  const first=await command('session.inspect',['--request-id','repeat-read']);expect(await command('session.inspect',['--request-id','repeat-read'])).toEqual(first);
  const requestFile=join(dataDir,'status-request.json');await writeFile(requestFile,JSON.stringify({operation:'request.status',args:{requestId:'repeat-read'}}),'utf8');
  const status=JSON.parse((await runFile(process.execPath,[join(root,'scripts/motion-command.mjs'),'--data-dir',dataDir,'--request',requestFile],{windowsHide:true,timeout:20000})).stdout);expect(status.result.status).toBe('done');
  const before=await command('session.inspect');await page.reload();await waitForModel(page,{actions:117});expect((await page.evaluate(()=>window.motionDeckDesktop.controlState())).enabled).toBe(false);
  await expect(command('session.inspect')).rejects.toThrow();await expect(access(join(dataDir,'control/instance.json'))).rejects.toThrow();
  expect(errors).toEqual([]);await writeFile(join(root,'output/a2-acceptance/client-proof.json'),JSON.stringify({testedAt:new Date().toISOString(),executablePath,pid:client.process().pid,dataDir,results,previousSessionId:before.sessionId},null,2)+'\n','utf8');
 }finally{await client.close();}
});
