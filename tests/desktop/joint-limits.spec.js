import {test,expect,_electron as electron} from '@playwright/test';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {desktopPackage} from '../helpers/desktop-package.js';
import {waitForModel} from '../motion-lab/model-ready-helper.js';
import {rotateJoint} from '../helpers/rotate-joint.js';

test('真实包两模型自然约束、操作层投影与保存重启回读',async()=>{
 test.setTimeout(60000);
 const executablePath=await desktopPackage('public'),base=resolve('output/desktop-tests');await mkdir(base,{recursive:true});
 const dataDir=await mkdtemp(join(base,'joint-limits-')),env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;delete env.MOTIONDECK_DEV_AUTO_CONTROL;
 let client,throttling;
 const unthrottle=async()=>{throttling=await client.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0],contents=window.webContents,previous=contents.getBackgroundThrottling();contents.setBackgroundThrottling(false);window.showInactive();return previous;});};
 const restoreThrottling=async()=>{if(throttling!==undefined)await client.evaluate(({BrowserWindow},previous)=>{for(const w of BrowserWindow.getAllWindows())w.webContents.setBackgroundThrottling(previous);},throttling);};
 try{
  client=await electron.launch({executablePath,args:['--smoke-hidden'],env});let page=await client.firstWindow();await unthrottle();await waitForModel(page,{actions:162});const saved=[];
  for(const model of ['Mesh2Motion','Quaternius']){
   console.log('关节桌面阶段',model,'载入');
   if(model==='Quaternius'){await page.locator('#replaceModel').selectOption({label:model});await waitForModel(page,{actions:117});}
   await page.locator('#viewPreset').selectOption('front');await page.locator('#editPose').click();
   await page.evaluate(async()=>{const {workbench:w}=await import('./motion.bundle.js'),rig=w.rigList({limit:100});w.setBones(rig.entries.filter(e=>e.jointLimit.status==='calibrated').map(e=>({id:e.id,quaternion:e.jointLimit.reference})),undefined,{constraintMode:'natural'});});
   await expect(page.getByRole('button',{name:'自然约束',exact:true})).toHaveAttribute('aria-pressed','true');
   console.log('关节桌面阶段',model,'旋转');
   await rotateJoint(page,{joint:'右肘',axis:'X',dx:450,dy:-400,during:async()=>{await expect(page.locator('.joint-limit-status')).toHaveText('已到关节边界');}});
   console.log('关节桌面阶段',model,'投影保存');
   const result=await page.evaluate(async model=>{const {workbench:w}=await import('./motion.bundle.js'),rig=w.rigList({limit:100}),head=rig.entries.find(e=>e.jointLimit.type==='head'),reply=w.setBones([{id:head.id,quaternion:[1,0,0,0]}],undefined,{constraintMode:'natural'});return {clamped:reply.constraints.applied[0].clamped,pose:await w.saveDraft({name:model+'约束保存',confirmed:true})};},model);expect(result.clamped).toBe(true);saved.push({model,id:result.pose.id});
  }
  await page.evaluate(()=>window.motionDeckDesktop.controlDraftState(false));console.log('关节桌面阶段','关闭并重开');
  await restoreThrottling();await client.close();client=null;client=await electron.launch({executablePath,args:['--smoke-hidden'],env});page=await client.firstWindow();await unthrottle();await waitForModel(page,{actions:117});
  for(const item of [...saved].reverse()){
   if(item.model==='Mesh2Motion'){await page.locator('#replaceModel').selectOption({label:item.model});await waitForModel(page,{actions:162});}
   await page.locator('#library-pose').click();await page.locator(`#clips [data-pose-id="${item.id}"]`).click();
   const report=await page.evaluate(async()=>{const {workbench:w}=await import('./motion.bundle.js');return w.inspect().jointConstraints;});expect(report.supported).toBe(true);expect(report.violations).toEqual([]);
  }
 }finally{
  // 行为和持久化断言结束后只销毁本用例窗口，失败亦不残留原生退出确认。
  if(client){await client.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.destroy();}).catch(()=>{});await client.close();}
 }
});
