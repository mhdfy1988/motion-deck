import {test,expect,_electron as electron} from '@playwright/test';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {mkdir,mkdtemp,readFile,stat} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const root=resolve('.');
function command(executable,args){return new Promise((resolve,reject)=>{const child=spawn(executable,args,{windowsHide:true,stdio:'pipe'});let error='';child.stderr.on('data',data=>error+=data);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('安装器退出 '+code+' '+error)));});}
function launch(exe,dataDir,feed){const env={...process.env,MOTIONDECK_DATA_DIR:dataDir,MOTIONDECK_TEST_UPDATE_URL:feed};delete env.ELECTRON_RUN_AS_NODE;return electron.launch({executablePath:exe,args:['--smoke-hidden'],env,timeout:30000});}

test('真实NSIS安装、取消/失败重试、退出不安装、升级保留数据、卸载保留数据',async()=>{
 test.setTimeout(600000);
 test.skip(!process.env.MOTIONDECK_TEST_OLD_INSTALLER||!process.env.MOTIONDECK_TEST_NEW_INSTALLER,'仅显式指定隔离验收安装器时执行，不安装正式包');
 const oldInstaller=resolve(process.env.MOTIONDECK_TEST_OLD_INSTALLER),newInstaller=resolve(process.env.MOTIONDECK_TEST_NEW_INSTALLER);
 for(const installer of [oldInstaller,newInstaller])if(!installer.startsWith(join(root,'output','update-acceptance')+sep)||!installer.includes('MotionDeckAcceptance-'))throw new Error('只允许项目output中的验收安装器');
 await mkdir(join(root,'output','update-acceptance'),{recursive:true});const base=await mkdtemp(join(root,'output','update-acceptance','run-'));
 const installDir=join(base,'installed'),dataDir=join(base,'personal'),exe=join(installDir,'MotionDeckAcceptance.exe');
 const metadata=await readFile(join(newInstaller,'..','latest.yml'));
 let mode='offline',downloads=0,client;
 const server=createServer(async(req,res)=>{
  if(mode==='offline'){res.writeHead(503);res.end('isolated offline fixture');return;}
  if(req.url.split('?')[0]==='/latest.yml'){res.setHeader('content-type','text/yaml');res.end(metadata);return;}
  if(!req.url.includes('MotionDeckAcceptance-')){res.writeHead(404);res.end();return;}
  downloads++;res.setHeader('content-length',(await stat(newInstaller)).size);
  try{for await(const chunk of createReadStream(newInstaller,{highWaterMark:256*1024})){if(res.destroyed)break;if(mode==='slow')await delay(100);if(mode==='corrupt'){chunk[0]^=255;}if(!res.write(chunk))await new Promise(resolve=>{const done=()=>{res.off('drain',done);res.off('close',done);resolve();};res.once('drain',done);res.once('close',done);});}res.end();}catch{res.destroy();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const feed='http://127.0.0.1:'+server.address().port+'/';
 try{
  await command(oldInstaller,['/S','/currentuser','/D='+installDir]);expect(await stat(exe)).toBeTruthy();expect(await stat(join(installDir,'Uninstall MotionDeckAcceptance.exe'))).toBeTruthy();
  client=await launch(exe,dataDir,feed);let page=await client.firstWindow();await expect(page.locator('#capturePose')).toBeEnabled();
  expect((await page.evaluate(()=>motionDeckDesktop.updateState())).currentVersion).toBe('0.0.1');
  await page.locator('#capturePose').click();await page.locator('#poseName').fill('升级保留姿势');await page.locator('#confirmPoseSave').click();await expect(page.locator('#savePoseDialog')).not.toBeVisible();
  const before=await page.evaluate(()=>motionDeckDesktop.settings());
  await page.locator('#desktopUpdates').click();await page.locator('#checkDesktopUpdate').click();await expect(page.locator('#updateStatus')).toContainText('更新失败');
  mode='slow';await page.locator('#checkDesktopUpdate').click();await expect(page.locator('#updateStatus')).toHaveText('发现新版本');await page.locator('#downloadDesktopUpdate').click();await expect(page.locator('#updateProgress')).toBeVisible();await expect.poll(()=>downloads).toBeGreaterThan(0);await page.locator('#cancelDesktopUpdate').click();await expect(page.locator('#updateStatus')).toHaveText('发现新版本');
  mode='corrupt';await page.locator('#downloadDesktopUpdate').click();await expect(page.locator('#updateStatus')).toContainText('更新失败',{timeout:60000});expect((await page.evaluate(()=>motionDeckDesktop.updateState())).status).toBe('error');await expect(page.locator('#installDesktopUpdate')).not.toBeVisible();
  mode='normal';await page.locator('#downloadDesktopUpdate').click();await expect(page.locator('#updateStatus')).toHaveText('下载与校验完成',{timeout:60000});await page.screenshot({path:'output/acceptance/motion-desktop-update.png'});
  await client.close();client=undefined;await delay(1500);
  // 普通退出不能安装下载好的更新。
  client=await launch(exe,dataDir,feed);page=await client.firstWindow();await expect(page.locator('#capturePose')).toBeEnabled();expect((await page.evaluate(()=>motionDeckDesktop.updateState())).currentVersion).toBe('0.0.1');
  await page.locator('#desktopUpdates').click();await page.locator('#checkDesktopUpdate').click();await expect(page.locator('#updateStatus')).toHaveText('发现新版本');await page.locator('#downloadDesktopUpdate').click();await expect(page.locator('#updateStatus')).toHaveText('下载与校验完成',{timeout:60000});
  const closed=new Promise(resolve=>client.once('close',resolve));await page.locator('#installDesktopUpdate').click();
  // 更新会在真实点击后关闭客户端；只接受预期的目标关闭，随后仍必须核对版本和原资料。
  await Promise.all([closed,page.locator('#motionConfirmDialog .primary').click().catch(error=>{if(!/Target page, context or browser has been closed/.test(error.message))throw error;})]);client=undefined;
  await expect.poll(async()=>JSON.parse(await readFile(join(installDir,'resources','motiondeck-distribution.json'),'utf8')).version,{timeout:90000}).toBe('0.0.2');
  client=await launch(exe,dataDir,feed);page=await client.firstWindow();await expect(page.locator('#capturePose')).toBeEnabled();expect((await page.evaluate(()=>motionDeckDesktop.updateState())).currentVersion).toBe('0.0.2');const after=await page.evaluate(()=>motionDeckDesktop.settings());expect(after.library).toBe(before.library);expect(after.records).toBe(before.records);await page.locator('#library-pose').click();await expect(page.locator('#clips')).toContainText('升级保留姿势');
  await client.close();client=undefined;
  // 精确限制卸载范围；正式MotionDeck安装目录和个人目录不在目标内。
  if(!installDir.startsWith(join(root,'output','update-acceptance')+sep))throw new Error('卸载目标越界');
  await command(join(installDir,'Uninstall MotionDeckAcceptance.exe'),['/S','_?='+installDir]);
  expect(await stat(join(before.library,'library.sqlite'))).toBeTruthy();expect(await stat(join(dataDir,'settings.sqlite'))).toBeTruthy();
 }finally{if(client)await client.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
