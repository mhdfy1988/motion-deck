import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import * as THREE from 'three';
import sharp from 'sharp';
import {waitForModel} from '../motion-lab/model-ready-helper.js';
import {handleConfirmation} from '../motion-lab/confirm-helper.js';
const exec=promisify(execFile);
test('A3 实际外部命令：两模型试摆、批量回滚、历史、PNG、保存恢复与离开保护',async()=>{
 const root=resolve('.');await mkdir(join(root,'output/a3-acceptance'),{recursive:true});const dataDir=await mkdtemp(join(root,'output/a3-acceptance/profile-')),proof=[];
 const executablePath=process.env.MOTIONDECK_PACKAGED_EXE??createRequire(import.meta.url)('electron'),env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>electron.launch({executablePath,args:process.env.MOTIONDECK_PACKAGED_EXE?['--smoke-hidden']:[root,'--smoke-hidden'],env,timeout:30000});let client=await launch();
 const command=async input=>{const file=join(dataDir,randomUUID()+'.json');await writeFile(file,JSON.stringify(input),'utf8');try{return JSON.parse((await exec(process.execPath,[join(root,'scripts/motion-command.mjs'),'--data-dir',dataDir,'--request',file],{windowsHide:true,timeout:35000})).stdout);}catch(error){if(error.stdout)return JSON.parse(error.stdout);throw error;}};
 const read=operation=>command({operation,args:{}});
 const write=async(operation,args={},extra={})=>{const info=(await read('session.inspect')).result;return command({operation,args,modelKey:info.modelKey,expectedRevision:info.revision,...extra});};
 try{let page=await client.firstWindow();
  // Electron主进程已用will-prevent-unload处理离开确认，防止Playwright再次自动dismiss同一事件。
  page.on('dialog',()=>{});
  await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await waitForModel(page,{actions:162});await handleConfirmation(page,true,false);
  await page.locator('#desktopSettings').click();await page.locator('#desktopControlToggle').click();await expect(page.locator('#desktopControlToggle')).toHaveAttribute('aria-checked','true');
  const firstLibrary=await command({operation:'library.list',args:{limit:100}});expect((await write('pose.fromClip',{clipId:firstLibrary.result.entries[0].id,time:.05})).error.code).toBe('WRITE_DISABLED');
  await page.locator('#desktopControlWrite').click();await expect(page.locator('#desktopControlWrite')).toHaveAttribute('aria-checked','true');await page.locator('#closeDesktopSettings').click();
  for(const [model,actions] of [['mesh2motion',162],['quaternius',117]]){
   if(model==='quaternius'){await page.locator('#replaceModel').selectOption(model);await waitForModel(page,{actions});}
   const library=await command({operation:'library.list',args:{limit:100}}),clip=library.result.entries.find(entry=>/Idle/i.test(entry.name))??library.result.entries[0];
   expect((await write('pose.fromClip',{clipId:clip.id,time:Math.min(.2,clip.duration/2)})).ok).toBe(true);await expect(page.locator('#assistantPoseTools')).toBeVisible();
   const rigBefore=await command({operation:'rig.list',args:{limit:100}}),arm=rigBefore.result.entries.find(b=>/upperarm|arm|shoulder/i.test(b.name))??rigBefore.result.entries[3];
   const q=new THREE.Quaternion().fromArray(arm.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.45)).normalize().toArray();
   const invalid=await write('pose.setBones',{changes:[{id:arm.id,quaternion:q},{id:'node:99999',quaternion:q}]});expect(invalid.error.code).toBe('INVALID_ARGUMENT');expect((await command({operation:'rig.list',args:{limit:100}})).result.entries).toEqual(rigBefore.result.entries);
   const movedPosition=[arm.position[0]+.01,arm.position[1],arm.position[2]];
   expect((await write('pose.setBones',{changes:[{id:arm.id,quaternion:arm.quaternion,position:movedPosition}]})).ok).toBe(true);
   expect((await command({operation:'rig.list',args:{limit:100}})).result.entries.find(b=>b.id===arm.id).position).toEqual(movedPosition);
   expect((await write('pose.undo')).ok).toBe(true);expect((await command({operation:'rig.list',args:{limit:100}})).result.entries).toEqual(rigBefore.result.entries);
   const before=(await read('session.inspect')).result,id=randomUUID(),request={operation:'pose.setBones',args:{changes:[{id:arm.id,quaternion:q}]},modelKey:before.modelKey,expectedRevision:before.revision,requestId:id};const changed=await command(request);expect(changed.ok).toBe(true);expect(await command(request)).toEqual(changed);
   expect((await write('pose.setBones',{changes:[{id:arm.id,quaternion:q}]},{expectedRevision:before.revision})).error.code).toBe('REVISION_CONFLICT');
   expect((await write('pose.undo')).ok).toBe(true);expect((await command({operation:'rig.list',args:{limit:100}})).result.entries).toEqual(rigBefore.result.entries);expect((await write('pose.redo')).ok).toBe(true);
   const pictures=await write('view.capture',{views:['front','right','front-right']});expect(pictures.ok).toBe(true);
   for(const file of pictures.result.files){const bytes=await readFile(file.path);expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);expect(file.width).toBeGreaterThan(1000);const metadata=await sharp(bytes).metadata();expect(metadata.width).toBe(file.width);expect(metadata.height).toBe(file.height);await sharp(bytes).raw().toBuffer();}
   const rigAfter=await command({operation:'rig.list',args:{limit:100}});expect(rigAfter.result.entries.find(b=>b.id===arm.id).quaternion).toEqual(q);
   await client.evaluate(({BrowserWindow,dialog})=>{globalThis.a3DialogOriginal=dialog.showMessageBoxSync;globalThis.a3DialogMessages=[];dialog.showMessageBoxSync=(_window,options)=>{globalThis.a3DialogMessages.push(options.message);return 0;};BrowserWindow.getAllWindows()[0].close();});
   expect(await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length)).toBe(1);
   await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.reload());
   await expect.poll(()=>client.evaluate(()=>globalThis.a3DialogMessages.length)).toBeGreaterThan(1);
   expect((await read('session.inspect')).result.editingContext).toBe('pose-draft');await client.evaluate(({dialog})=>{dialog.showMessageBoxSync=globalThis.a3DialogOriginal;});
   // 用户切换模型先确认；取消保持草稿，不能靠switch清掉未保存姿势。
   await page.removeLocatorHandler(page.locator('#motionConfirmDialog'));await handleConfirmation(page,false,true);await page.locator('#replaceModel').selectOption(model==='mesh2motion'?'quaternius':'mesh2motion');await page.locator('#replaceModel').click({trial:true});expect((await read('session.inspect')).result.editingContext).toBe('pose-draft');await page.removeLocatorHandler(page.locator('#motionConfirmDialog'));await handleConfirmation(page,true,false);
   const saved=await write('pose.save',{name:'A3试摆-'+model,confirmed:true,role:'key',stage:'试摆验收'});expect(saved.ok).toBe(true);await expect(page.locator('#assistantPoseTools')).not.toBeVisible();
   proof.push({model,before,arm,q,pictures:saved.ok?pictures.result.files:[],saved:saved.result});
  }
  await client.close();client=await launch();page=await client.firstWindow();await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await waitForModel(page,{actions:117});await page.locator('#library-ai').click();await expect(page.locator('#clips [data-pose-id="'+proof.at(-1).saved.id+'"]')).toHaveCount(1);
  expect((await page.evaluate(()=>window.motionDeckDesktop.controlState())).enabled).toBe(false);
  await page.locator('#desktopSettings').click();await page.locator('#desktopControlToggle').click();await expect(page.locator('#desktopControlToggle')).toHaveAttribute('aria-checked','true');await page.locator('#closeDesktopSettings').click();
  for(const entry of [...proof].reverse()){
   if(entry.model==='mesh2motion'){await page.locator('#replaceModel').selectOption(entry.model);await waitForModel(page,{actions:162});await page.locator('#library-ai').click();}
   await page.locator('#clips [data-pose-id="'+entry.saved.id+'"]').click();const restored=await command({operation:'rig.list',args:{limit:100}});expect(restored.result.entries.find(b=>b.id===entry.arm.id).quaternion).toEqual(entry.q);
  }
  await writeFile(join(root,'output/a3-acceptance/pose-command-proof.json'),JSON.stringify({testedAt:new Date().toISOString(),executablePath,dataDir,proof},null,2)+'\n','utf8');
 }finally{await client.evaluate(({BrowserWindow,dialog})=>{dialog.showMessageBoxSync=()=>1;for(const win of BrowserWindow.getAllWindows())win.destroy();}).catch(()=>{});await client.close();}
});
