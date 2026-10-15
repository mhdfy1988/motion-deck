import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,readFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {Data,NtExecutable,NtExecutableResource,Resource} from 'resedit';
import {placeAction} from '../motion-lab/drag-source-helper.js';
import {handleConfirmation} from '../motion-lab/confirm-helper.js';

test('真实桌面产物：资源、安全隔离、编排保存、导出、拍照录像与重启恢复',async()=>{
 const root=resolve('.');await mkdir(join(root,'output/desktop-tests'),{recursive:true});
 const dataDir=await mkdtemp(join(root,'output/desktop-tests/profile-'));
 const executablePath=process.env.MOTIONDECK_PACKAGED_EXE??createRequire(import.meta.url)('electron');
 const env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
 const args=process.env.MOTIONDECK_PACKAGED_EXE?['--smoke-hidden']:[root,'--smoke-hidden'];
 const launch=()=>electron.launch({executablePath,args,env,timeout:30000});
 console.log('desktop: launching',executablePath);
 let client=await launch();console.log('desktop: connected');
 try{
  console.log('desktop: windows',await client.evaluate(({app,BrowserWindow})=>({ready:app.isReady(),windows:BrowserWindow.getAllWindows().map(window=>({url:window.webContents.getURL(),visible:window.isVisible()}))})));
  const page=await client.firstWindow({timeout:15000}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
  await expect(page.locator('#status')).toContainText('162 动作');
  console.log('desktop: model ready');
  expect(page.url()).toBe('motiondeck://app/labs/motion/index.html');
  expect(await page.evaluate(()=>({node:typeof window.require,secure:isSecureContext}))).toEqual({node:'undefined',secure:true});
  const preferences=await client.evaluate(({BrowserWindow})=>{const p=BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();return {sandbox:p.sandbox,isolation:p.contextIsolation,node:p.nodeIntegration};});
  expect(preferences).toEqual({sandbox:true,isolation:true,node:false});
  // 同时核对窗口图标和EXE资源，防止只改页面品牌仍发出默认Electron图标。
  const icon=await client.evaluate(async({app,nativeImage})=>{
   const path=process.getBuiltinModule('node:path'),fs=process.getBuiltinModule('node:fs/promises');
   const image=nativeImage.createFromPath(path.join(app.getAppPath(),'desktop/assets/motiondeck.ico'));
   if(image.isEmpty())throw new Error('窗口图标为空');
   if(!app.isPackaged)return {window:true};
   const executable=await app.getFileIcon(process.execPath,{size:'normal'});
   await fs.writeFile(path.join(app.getPath('userData'),'exe-icon.png'),executable.toPNG());
   return {window:true,exe:!executable.isEmpty()};
  });
  expect(icon.window).toBe(true);if(process.env.MOTIONDECK_PACKAGED_EXE)expect(icon.exe).toBe(true);
  if(process.env.MOTIONDECK_PACKAGED_EXE){
   // 复用打包器使用的资源解析库；不把不同尺寸重采样产生的像素差异误判为图标错误。
   const resources=NtExecutableResource.from(NtExecutable.from(await readFile(executablePath)));
   const groups=Resource.IconGroupEntry.fromEntries(resources.entries);expect(groups).toHaveLength(1);
   const actual=groups[0].getIconItemsFromEntries(resources.entries);
   const expected=Data.IconFile.from(await readFile(join(root,'desktop/assets/motiondeck.ico'))).icons;
   expect(actual).toHaveLength(9);
   expect(actual.map(item=>Buffer.from(item.generate()))).toEqual(expected.map(item=>Buffer.from(item.data.generate())));
  }
  execFileSync(executablePath,args,{env,timeout:10000,windowsHide:true});
  expect(await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length)).toBe(1);
  const layout=await client.evaluate(async({app})=>{
   const fs=process.getBuiltinModule('node:fs/promises'),root=app.getAppPath();
   const unpacked=await fs.stat(root+'.unpacked').then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
   return {root,files:await fs.readdir(root),unpacked,unpackedFiles:unpacked?(await fs.readdir(root+'.unpacked',{recursive:true})).map(file=>file.replace(/\\/g,'/')).sort():[]};
  });
  if(process.env.MOTIONDECK_PACKAGED_EXE){expect(layout.root).toMatch(/app\.asar$/);expect(layout.unpacked).toBe(true);expect(layout.unpackedFiles).toEqual(['desktop','desktop/control','desktop/control/protect-directory.ps1']);for(const forbidden of ['node_modules','tests','output','.git'])expect(layout.files).not.toContain(forbidden);}
  await client.evaluate(({session},dir)=>{
   globalThis.desktopDownloads=[];
   session.defaultSession.on('will-download',(_event,item)=>{
    const file=dir+'/'+item.getFilename(),entry={file,name:item.getFilename(),status:'pending'};
    globalThis.desktopDownloads.push(entry);item.setSavePath(file);
    item.once('done',(_event,status)=>{entry.status=status;});
   });
  },dataDir);
  const download=async(index)=>{await expect.poll(()=>client.evaluate(()=>globalThis.desktopDownloads.map(entry=>entry.status)),{timeout:30000}).toHaveLength(index+1);await expect.poll(()=>client.evaluate((_electron,i)=>globalThis.desktopDownloads[i]?.status,index),{timeout:30000}).toBe('completed');return client.evaluate((_electron,i)=>globalThis.desktopDownloads[i],index);};
  await placeAction(page,page.locator('#clips [data-clip-index]').first());
  await page.locator('#saveAction').click();await page.locator('#actionName').fill('桌面验收动作');await page.locator('#confirmSave').click();
  await expect(page.locator('#saveActionDialog')).not.toBeVisible();
  await page.locator('#capturePose').click();await page.locator('#poseName').fill('桌面验收姿势');await page.locator('#confirmPoseSave').click();
  await expect(page.locator('#savePoseDialog')).not.toBeVisible();
  console.log('desktop: saved action and pose');
  await page.locator('#exportMotion').click();await page.locator('#exportSearch').fill('桌面验收动作');await page.locator('#exportEntries input').check();
  await page.locator('#confirmMotionExport').click();
  console.log('desktop: export clicked',await page.locator('#status').textContent());
  const asset=await download(0),glbPath=asset.file;
  await expect.poll(()=>page.evaluate(async()=>(await motionDeckDesktop.settings()).exports)).toBe(dataDir);
  const glb=await readFile(glbPath);expect(glb.subarray(0,4).toString()).toBe('glTF');
  const jsonSize=glb.readUInt32LE(12),json=JSON.parse(glb.subarray(20,20+jsonSize).toString());
  expect(json.animations).toHaveLength(1);expect(json.skins.length).toBeGreaterThan(0);
  await page.locator('#takePhoto').click();
  const photo=await download(1),pngPath=photo.file;
  const png=await readFile(pngPath);expect(png.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');expect(png.readUInt32BE(16)).toBe(1920);
  // 前台页面可见性会影响录像，测试展示独立窗口但不切换用户主服务。
  await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
  await page.locator('#recordVideo').click();
  const video=await download(2),videoPath=video.file;
  const bin=process.env.FFMPEG_BIN?process.env.FFMPEG_BIN+'/':'';
  const info=JSON.parse(execFileSync(bin+'ffprobe',['-v','error','-show_entries','stream=width,height','-of','json',videoPath],{encoding:'utf8'}));
  expect(info.streams[0].width).toBe(1920);expect(info.streams[0].height).toBe(png.readUInt32BE(20));
  execFileSync(bin+'ffmpeg',['-v','error','-i',videoPath,'-frames:v','1','-f','null','-']);
  await handleConfirmation(page);await page.locator('#replaceModel').selectOption('quaternius');await expect(page.locator('#status')).toContainText('117 动作');
  await page.locator('#replaceModel').selectOption('mesh2motion');await expect(page.locator('#status')).toContainText('162 动作');
  await page.screenshot({path:'output/acceptance/motion-desktop.png'});expect(errors).toEqual([]);
  await client.close();client=await launch();const restored=await client.firstWindow();
  await expect(restored.locator('#status')).toContainText('已恢复');
  await restored.locator('#library-actions').click();await expect(restored.locator('#clips [data-custom-id]')).toContainText('桌面验收动作');
  await restored.locator('#library-pose').click();await expect(restored.locator('#clips')).toContainText('桌面验收姿势');
  await expect(restored.locator('#segments .action')).toHaveCount(0);
 }finally{await client.close();}
});
