import {test,expect,_electron as electron} from '@playwright/test';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {desktopPackage} from '../helpers/desktop-package.js';
import {rotateJoint} from '../helpers/rotate-joint.js';

test('打包客户端手动旋转另存后重新启动可恢复',async()=>{
 const executablePath=await desktopPackage('public'),root=resolve('output/desktop-tests');await mkdir(root,{recursive:true});
 const dataDir=await mkdtemp(join(root,'user-rotation-')),env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
 let client;
 try{
  client=await electron.launch({executablePath,args:['--smoke-hidden'],env});let page=await client.firstWindow();
  await expect(page.locator('#capturePose')).toBeEnabled();await page.locator('#editPose').click();
  await rotateJoint(page);
  const savedHead=await page.evaluate(async()=>{const {workbench}=await import('./motion.bundle.js');return workbench.rigList({limit:100}).entries.find(n=>n.name==='head').quaternion;});
  await page.locator('#capturePose').click();await page.locator('#poseName').fill('桌面旋转持久化');await page.locator('#confirmPoseSave').click();await expect(page.locator('#savePoseDialog')).toBeHidden();
  await client.close();client=null;
  client=await electron.launch({executablePath,args:['--smoke-hidden'],env});page=await client.firstWindow();await expect(page.locator('#capturePose')).toBeEnabled();
  await page.locator('#library-pose').click();const saved=page.locator('#clips [data-pose-id]').filter({hasText:'桌面旋转持久化'});await expect(saved).toHaveCount(1);await saved.click();
  await page.locator('#editPose').click();expect(await page.evaluate(async()=>{const {workbench}=await import('./motion.bundle.js');return workbench.rigList({limit:100}).entries.find(n=>n.name==='head').quaternion;})).toEqual(savedHead);
  await page.screenshot({path:join(dataDir,'rotation-editor.png')});
 }finally{
  if(client){const page=await client.firstWindow();await page.evaluate(async()=>{const {workbench}=await import('./motion.bundle.js');if(workbench.inspect().draft)workbench.discardDraft();}).catch(()=>{});await client.close();}
 }
});
