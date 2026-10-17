import {test,expect,_electron as electron} from '@playwright/test';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {desktopPackage} from '../helpers/desktop-package.js';
import {waitForModel} from '../motion-lab/model-ready-helper.js';

test('真实包两模型拖肘膝让整条肢体跟随，双击开环及撤销取消',async()=>{
 const executablePath=await desktopPackage('public'),root=resolve('output/desktop-tests');await mkdir(root,{recursive:true});const dataDir=await mkdtemp(join(root,'direct-joint-')),env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
 const client=await electron.launch({executablePath,args:['--smoke-hidden'],env});
 // 真实多步拖动需显示隔离窗口；仅禁用后台节流仍可能让输入逐步等待隐藏表面。
 let throttling;
 const read=page=>page.evaluate(async()=>{const {bodyControls:c}=await import('./motion.bundle.js'),s=c.getState();return {pose:s.poseDraft.pose,undo:s.poseDraft.undo.length,limbs:c.limbs.map(({chain:l})=>({root:l.upper.getWorldPosition(l.upper.position.clone()).toArray(),end:l.end.getWorldPosition(l.end.position.clone()).toArray(),middle:l.middle.quaternion.toArray(),wrist:l.end.quaternion.toArray()}))};});
 try{
  const page=await client.firstWindow();throttling=await client.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0],contents=window.webContents,previous=contents.getBackgroundThrottling();contents.setBackgroundThrottling(false);window.showInactive();return previous;});await waitForModel(page,{actions:162});
  for(const model of ['Mesh2Motion','Quaternius']){
   if(model==='Quaternius'){await page.locator('#replaceModel').selectOption({label:model});await waitForModel(page,{actions:117});}
   await page.locator('#editPose').click();
   for(const [i,name] of ['左肘','右肘','左膝','右膝'].entries()){
    const handle=page.getByRole('button',{name:`拖动${name}`,exact:true});await expect(handle).toBeEnabled();
    await expect.poll(()=>handle.evaluate(async el=>{const {bodyControls:c}=await import('./motion.bundle.js'),part=c.parts.find(p=>p.button===el),v=part.node.getWorldPosition(part.node.position.clone()).project(c.camera),box=c.stage.getBoundingClientRect();return Math.hypot(parseFloat(el.style.left)-(v.x+1)*box.width/2,parseFloat(el.style.top)-(1-v.y)*box.height/2);})).toBeLessThan(.1);
    const point=await handle.boundingBox();await page.mouse.click(point.x+point.width/2,point.y+point.height/2);
    expect(await page.evaluate(async()=>{const {bodyControls:c}=await import('./motion.bundle.js');return c.rotationOpen||!!c.gizmo.object;})).toBe(false);
    await handle.dblclick();
    expect(await page.evaluate(async name=>{const {bodyControls:c}=await import('./motion.bundle.js');return c.gizmo.object===c.parts.find(p=>p.name===name).node;},name)).toBe(true);
    const before=await read(page),box=await handle.boundingBox();await page.mouse.move(box.x+8,box.y+8);await page.mouse.down();await page.mouse.move(box.x+28,box.y-20,{steps:10});await page.mouse.up();const after=await read(page);
    expect(await page.evaluate(async()=>{const {bodyControls:c}=await import('./motion.bundle.js');return c.rotationOpen||!!c.gizmo.object;})).toBe(false);
    expect(after.undo).toBe(before.undo+1);expect(after.limbs[i].root).toEqual(before.limbs[i].root);expect(after.limbs[i].middle).toEqual(before.limbs[i].middle);expect(after.limbs[i].wrist).toEqual(before.limbs[i].wrist);expect(Math.hypot(...after.limbs[i].end.map((v,k)=>v-before.limbs[i].end[k]))).toBeGreaterThan(.001);expect(after.pose.map(p=>[p.p,p.s])).toEqual(before.pose.map(p=>[p.p,p.s]));
    await page.locator('#undoDrag').click();expect((await read(page)).pose).toEqual(before.pose);await page.locator('#redoRotation').click();expect((await read(page)).pose).toEqual(after.pose);
   }
   await page.screenshot({path:join(dataDir,`${model}-direct-joint.png`)});
   await page.locator('#editPose').click();await page.getByRole('button',{name:'放弃',exact:true}).click();
  }
 }finally{
  // 所有行为断言结束后只销毁本用例窗口，失败路径不留下草稿退出确认和锁定资料。
  await client.evaluate(({BrowserWindow},previous)=>{for(const window of BrowserWindow.getAllWindows()){if(previous!==undefined)window.webContents.setBackgroundThrottling(previous);window.destroy();}},throttling).catch(()=>{});await client.close();
 }
});
