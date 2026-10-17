import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {desktopPackage} from '../../helpers/desktop-package.js';
import {waitForModel} from '../../motion-lab/model-ready-helper.js';

for(const height of [900,720])test('真实桌面包自由飞行转角、WASD与滚轮 '+height,async()=>{
 const executablePath=await desktopPackage('public'),root=resolve('output/desktop-tests');await mkdir(root,{recursive:true});const dataDir=await mkdtemp(join(root,'camera-flight-')),env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;delete env.MOTIONDECK_DEV_AUTO_CONTROL;
 const client=await electron.launch({executablePath,args:['--smoke-hidden'],env});
 try{
  const page=await client.firstWindow();await waitForModel(page,{actions:162});await client.evaluate(({BrowserWindow},height)=>{const w=BrowserWindow.getAllWindows()[0];w.setTitle('MotionDeck · 相机隔离验证');w.setSize(1440,height);w.show();w.focus();w.webContents.focus();},height);
  await page.locator('#cameraMode').selectOption('fly');const b=await page.locator('#stage canvas').boundingBox();await page.mouse.move(b.x+30,b.y+b.height*.55);
  const before=await page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js');globalThis.flightMouseDelta=0;document.addEventListener('mousemove',e=>{if(document.pointerLockElement)globalThis.flightMouseDelta+=e.movementX;});return {p:c.camera.position.toArray(),q:c.camera.quaternion.toArray(),yaw:c.camera.rotation.clone().reorder('YXZ').y,height:c.canvas.clientHeight};});await page.mouse.down();await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement),{timeout:3000}).toBe(true);await page.mouse.move(b.x+100,b.y+b.height*.55-20,{steps:8});
  const angle=await page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js');return {yaw:c.camera.rotation.clone().reorder('YXZ').y,dx:globalThis.flightMouseDelta};}),expected=before.yaw-angle.dx*2*Math.PI/before.height;expect(Math.abs(angle.dx)).toBeGreaterThan(10);expect(Math.atan2(Math.sin(angle.yaw-expected),Math.cos(angle.yaw-expected))).toBeCloseTo(0,7);
  const turned=await page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js');return {p:c.camera.position.toArray(),q:c.camera.quaternion.toArray()};});expect(turned.p).toEqual(before.p);expect(turned.q).not.toEqual(before.q);await page.mouse.up();await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(false);
  await page.keyboard.down('KeyW');await expect.poll(()=>page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js');return c.camera.position.toArray();})).not.toEqual(turned.p);await page.keyboard.up('KeyW');const stopped=await page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js');return c.camera.position.toArray();});await page.waitForTimeout(100);expect(await page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js');return c.camera.position.toArray();})).toEqual(stopped);
  await page.mouse.wheel(0,-160);await expect.poll(()=>page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js');return c.camera.position.toArray();})).not.toEqual(stopped);
  await page.screenshot({path:'output/acceptance/desktop-flight-pointer.png'});await page.locator('#windowClose').click();await expect.poll(()=>client.windows().length).toBe(0);
 }finally{await client.close();}
});
