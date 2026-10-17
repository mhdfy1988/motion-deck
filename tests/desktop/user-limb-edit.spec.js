import {test,expect,_electron as electron} from '@playwright/test';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {desktopPackage} from '../helpers/desktop-package.js';
import {placeAction} from '../motion-lab/drag-source-helper.js';
import {rotateJoint} from '../helpers/rotate-joint.js';

test('打包客户端编辑草稿禁止素材拖放，退出恢复',async()=>{
 const executablePath=await desktopPackage('public'),root=resolve('output/desktop-tests');await mkdir(root,{recursive:true});const dataDir=await mkdtemp(join(root,'draft-drop-')),env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
 const client=await electron.launch({executablePath,args:['--smoke-hidden'],env});
 try{
  const page=await client.firstWindow();await expect(page.locator('#capturePose')).toBeEnabled();const source=page.locator('#clips [data-clip-index]').first();await page.locator('#editPose').click();
  const inspect=()=>page.evaluate(async()=>{const {workbench}=await import('./motion.bundle.js');return {state:workbench.inspect(),rig:workbench.rigList({limit:100}).entries};}),before=await inspect();
  await placeAction(page,source,undefined,async()=>{await expect(page.locator('.timeline-drag-ghost')).toHaveCount(0);await expect(page.locator('.timeline-drop')).toBeHidden();});
  expect(await inspect()).toEqual(before);await expect(page.locator('#segments button')).toHaveCount(0);
  await page.locator('#editPose').click();await page.getByRole('button',{name:'放弃',exact:true}).click();await placeAction(page,source);await expect(page.locator('#segments .action')).toHaveCount(1);
 }finally{const page=await client.firstWindow();await page.evaluate(async()=>{const {workbench}=await import('./motion.bundle.js');if(workbench.inspect().draft)workbench.discardDraft();}).catch(()=>{});await client.close();}
});

test('打包客户端编辑中双向切模型退出编辑，取消保留草稿',async()=>{
 const executablePath=await desktopPackage('public'),root=resolve('output/desktop-tests');await mkdir(root,{recursive:true});const dataDir=await mkdtemp(join(root,'pose-reset-')),env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
 const client=await electron.launch({executablePath,args:['--smoke-hidden'],env});
 try{
  const page=await client.firstWindow();await expect(page.locator('#capturePose')).toBeEnabled();
  for(const [model,count] of [['Quaternius',117],['Mesh2Motion',162]]){
   await page.locator('#editPose').click();await rotateJoint(page);
   const inspect=()=>page.evaluate(async()=>{const {workbench}=await import('./motion.bundle.js');return {draft:workbench.inspect().draft,rig:workbench.rigList({limit:100}).entries};}),before=await inspect();
   await page.locator('#replaceModel').selectOption({label:model});await page.getByRole('button',{name:'取消',exact:true}).click();expect(await inspect()).toEqual(before);await expect(page.locator('#editPose')).toHaveText('退出编辑');
   await page.locator('#replaceModel').selectOption({label:model});await page.getByRole('button',{name:'放弃',exact:true}).click();await expect(page.locator('#source option')).toHaveCount(count);await expect(page.locator('#capturePose')).toBeEnabled();
   await expect(page.locator('#editPose')).toHaveText('编辑姿势');await expect(page.locator('#viewportPoseTools')).toBeHidden();await expect(page.locator('#bone')).toBeHidden();await expect(page.locator('.body-handles')).toHaveCount(2);await expect(page.locator('.body-handles:not([hidden])')).toHaveCount(0);await expect(page.locator('body')).not.toHaveClass(/pose-editing|pose-details-open/);expect((await inspect()).draft).toBeNull();
   await page.screenshot({path:join(dataDir,`${model}-editor-reset.png`)});
  }
 }finally{const page=await client.firstWindow();await page.evaluate(async()=>{const {workbench}=await import('./motion.bundle.js');if(workbench.inspect().draft)workbench.discardDraft();}).catch(()=>{});await client.close();}
});

test('打包客户端两模型手脚拖动另存并重启恢复',async()=>{
 const executablePath=await desktopPackage('public'),root=resolve('output/desktop-tests');await mkdir(root,{recursive:true});
 const dataDir=await mkdtemp(join(root,'user-limbs-')),env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
 let client;
 const launch=async()=>{client=await electron.launch({executablePath,args:['--smoke-hidden'],env});const page=await client.firstWindow();await expect(page.locator('#capturePose')).toBeEnabled();return page;};
 const snapshot=page=>page.evaluate(async()=>{const {workbench}=await import('./motion.bundle.js');return workbench.rigList({limit:100}).entries;});
 const pointBox=async(page,name)=>{
  const handle=page.getByRole('button',{name:`拖动${name}`,exact:true});await expect(handle).toBeEnabled();
  await expect.poll(()=>handle.evaluate(async el=>{const {bodyControls:c}=await import('./motion.bundle.js'),part=c.parts.find(p=>p.button===el),v=part.node.getWorldPosition(part.node.position.clone()).project(c.camera),box=c.stage.getBoundingClientRect();return Math.hypot(parseFloat(el.style.left)-(v.x+1)*box.width/2,parseFloat(el.style.top)-(1-v.y)*box.height/2);})).toBeLessThan(.1);
  const box=await handle.boundingBox();await expect.poll(()=>handle.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;})).toBe(true);return box;
 };
 try{
  let page=await launch();
  for(const model of ['Mesh2Motion','Quaternius']){
   if(model==='Quaternius'){await page.locator('#replaceModel').selectOption({label:model});await expect(page.locator('#source option')).toHaveCount(117);await expect(page.locator('#capturePose')).toBeEnabled();}
   await page.locator('#editPose').click();await expect(page.locator('.body-handle.draggable')).toHaveCount(4);
   const before=await snapshot(page),box=await pointBox(page,'右手');
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x-36,box.y-60,{steps:14});await page.mouse.up();
   const after=await snapshot(page);expect(after.map(b=>b.position)).toEqual(before.map(b=>b.position));expect(after.map(b=>b.quaternion)).not.toEqual(before.map(b=>b.quaternion));
   await page.locator('#undoDrag').click();expect((await snapshot(page)).map(b=>b.quaternion)).toEqual(before.map(b=>b.quaternion));await page.locator('#redoRotation').click();
   const endpoint=()=>page.evaluate(async()=>{const {bodyControls}=await import('./motion.bundle.js'),{chain}=bodyControls.limbs[1];return {position:chain.end.getWorldPosition(chain.end.position.clone()).toArray(),middle:chain.middle.quaternion.toArray(),end:chain.end.quaternion.toArray()};});
   const fixed=await endpoint(),elbow=await pointBox(page,'右肘');await page.mouse.move(elbow.x+elbow.width/2,elbow.y+elbow.height/2);await page.mouse.down();await page.mouse.move(elbow.x+30,elbow.y-12,{steps:12});expect(await page.evaluate(async()=>{const {bodyControls}=await import('./motion.bundle.js');return bodyControls.getState().busy;})).toBe(true);await page.mouse.up();
   const polePose=await snapshot(page),result=await endpoint();expect(Math.hypot(...result.position.map((v,i)=>v-fixed.position[i]))).toBeGreaterThan(.001);expect(result.middle).toEqual(fixed.middle);expect(result.end).toEqual(fixed.end);expect(polePose.map(b=>b.quaternion)).not.toEqual(after.map(b=>b.quaternion));
   await page.locator('#undoDrag').click();expect((await snapshot(page)).map(b=>b.quaternion)).toEqual(after.map(b=>b.quaternion));await page.locator('#redoRotation').click();
   await page.locator('#capturePose').click();await page.locator('#poseName').fill(`${model}桌面手脚编辑`);await page.locator('#confirmPoseSave').click();await expect(page.locator('#savePoseDialog')).toBeHidden();
   await client.close();client=null;page=await launch();await page.locator('#library-pose').click();
   const saved=page.locator('#clips [data-pose-id]').filter({hasText:`${model}桌面手脚编辑`});await expect(saved).toHaveCount(1);await saved.click();
   expect((await snapshot(page)).map(b=>[b.id,b.position,b.quaternion])).toEqual(polePose.map(b=>[b.id,b.position,b.quaternion]));
   await page.screenshot({path:join(dataDir,`${model}-limb-editor.png`)});
  }
 }finally{
  if(client){const page=await client.firstWindow();await page.evaluate(async()=>{const {workbench}=await import('./motion.bundle.js');if(workbench.inspect().draft)workbench.discardDraft();}).catch(()=>{});await client.close();}
 }
});

test('打包客户端关节点远小近大且保留点击范围',async()=>{
 const executablePath=await desktopPackage('public'),root=resolve('output/desktop-tests');await mkdir(root,{recursive:true});const dataDir=await mkdtemp(join(root,'marker-scale-')),env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
 const client=await electron.launch({executablePath,args:['--smoke-hidden'],env});
 try{
  const page=await client.firstWindow();await expect(page.locator('.view-head #editPose')).toBeEnabled();await page.locator('#editPose').click();
  const edit=await page.locator('#editPose').boundingBox(),save=await page.locator('#capturePose').boundingBox();expect(save.x+save.width).toBeLessThan(edit.x);await expect(page.locator('.player #editPose')).toHaveCount(0);await expect(page.locator('#viewportPoseTools #editPose')).toHaveCount(0);
  const point=page.getByRole('button',{name:'拖动右手',exact:true}),size=()=>point.evaluate(async el=>{const {bodyControls:c}=await import('./motion.bundle.js');return c.parts.find(p=>p.button===el).marker.userData.diameter;});
  await expect.poll(size).toBeGreaterThan(0);
  const initial=await size(),hitbox=await point.boundingBox(),stage=await page.locator('#stage').boundingBox(),pose=()=>page.evaluate(async()=>{const {workbench:w}=await import('./motion.bundle.js');return w.rigList({limit:100}).entries;}),before=await pose();
  await page.mouse.move(stage.x+stage.width*.6,stage.y+stage.height*.45);await page.mouse.wheel(0,-450);await expect.poll(size).toBeGreaterThan(initial*1.15);
  await page.screenshot({path:join(dataDir,'markers-near.png')});const close=await size();await page.mouse.wheel(0,900);await expect.poll(size).toBeLessThan(close*.8);await page.screenshot({path:join(dataDir,'markers-far.png')});
  const after=await point.boundingBox();expect(after.width).toBe(hitbox.width);expect(after.height).toBe(hitbox.height);expect(await pose()).toEqual(before);
 }finally{const page=await client.firstWindow();await page.evaluate(async()=>{const {workbench}=await import('./motion.bundle.js');if(workbench.inspect().draft)workbench.discardDraft();}).catch(()=>{});await client.close();}
});
