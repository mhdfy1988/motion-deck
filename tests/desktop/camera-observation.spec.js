import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {desktopPackage} from '../helpers/desktop-package.js';
import {waitForModel} from '../motion-lab/model-ready-helper.js';
import {checkObservationCamera} from '../helpers/observe-camera.js';

test('真实桌面人物观察相机无需锁鼠，编辑与手部近景隔离',async()=>{
 const executablePath=await desktopPackage('public'),root=resolve('output/desktop-tests');await mkdir(root,{recursive:true});const dataDir=await mkdtemp(join(root,'camera-observation-')),env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;delete env.MOTIONDECK_DEV_AUTO_CONTROL;
 const client=await electron.launch({executablePath,args:['--smoke-hidden'],env});
 try{
  const page=await client.firstWindow();await waitForModel(page,{actions:162});await client.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setTitle('MotionDeck · 人物观察隔离验证');w.setSize(1440,900);w.show();w.focus();w.webContents.focus();});
  await page.evaluate(()=>{globalThis.pointerLockCalls=0;HTMLCanvasElement.prototype.requestPointerLock=()=>{globalThis.pointerLockCalls++;throw new Error('人物观察不应申请锁鼠');};});
  await checkObservationCamera(page);expect(await page.evaluate(()=>globalThis.pointerLockCalls)).toBe(0);await page.locator('#editPose').click();await expect(page.locator('#viewportPoseTools')).toBeVisible();await page.screenshot({path:'output/acceptance/desktop-pose-dock.png'});await page.evaluate(async()=>{const {workbench:w}=await import('/labs/motion/motion.bundle.js');w.discardDraft();});await expect(page.locator('#viewportPoseTools')).toBeHidden();await page.locator('#windowClose').click();await expect.poll(()=>client.windows().length).toBe(0);
 }finally{await client.close();}
});
