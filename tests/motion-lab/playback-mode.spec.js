import {waitForModel} from './model-ready-helper.js';
import {test,expect} from '@playwright/test';
import {placeAction} from './drag-source-helper.js';
async function load(page){await page.goto('/');await page.locator('#replaceModel').selectOption('quaternius');await waitForModel(page,{actions:117});await expect(page.locator('#status')).toContainText('117 动作');}

test('连续播放帧不重复扫描素材，显式查询仍观察状态且版本稳定',async({page})=>{
 await load(page);await page.locator('#restart').click();
 const result=await page.evaluate(async()=>{
  const {workbench,bodyControls}=await import('/labs/motion/motion.bundle.js'),state=bodyControls.getState();
  const revision=workbench.inspect().revision,poses=state.poses,sampler=state.sampler,original=sampler.sample;
  let scans=0,samples=0;
  state.poses=new Proxy(poses,{get(target,key,receiver){if(key==='map')scans++;return Reflect.get(target,key,receiver);}});
  sampler.sample=function(...args){samples++;return original.apply(this,args);};
  try{
   for(let frame=0;frame<30;frame++)await new Promise(requestAnimationFrame);
   const frameScans=scans,queryRevision=workbench.inspect().revision;
   return {frameScans,scansAfterQuery:scans,samples,revision,queryRevision};
  }finally{state.poses=poses;sampler.sample=original;state.playing=false;}
 });
 expect(result.samples).toBeGreaterThan(0);expect(result.frameScans).toBe(0);expect(result.scansAfterQuery).toBe(1);expect(result.queryRevision).toBe(result.revision);
});
test('姿势预览重新播放无编排不切源，有编排从轴首开始并正确结束',async({page})=>{
 await load(page);await page.locator('#library-pose').click();const pose=page.locator('#clips [data-pose-id]').filter({hasText:/^Fight 01/});await pose.click();
 const idleIcon=await page.locator('#play').innerHTML();await page.locator('#restart').click();await expect(page.locator('#currentClip')).toHaveText('Fight 01');expect(await page.locator('#play').innerHTML()).toBe(idleIcon);
 await placeAction(page,pose);await pose.click();await page.locator('#restart').click();await expect(page.locator('#currentClip')).toHaveText('Fight 01');await expect(page.locator('#clock')).toHaveText('1.00 s');expect(await page.locator('#play').innerHTML()).toBe(idleIcon);
 await page.locator('#restart').click();await expect.poll(async()=>Number(await page.locator('#seek').inputValue())).toBeLessThan(.5);
});
test('源动作、自定义预览与混排编排的重新播放各自保持上下文',async({page})=>{
 await load(page);const source=page.locator('#clips [data-clip-name="Crouch_Fwd_Loop"]');await source.click();await page.locator('#restart').click();await expect(page.locator('#currentClip')).toHaveText('蹲行');await page.locator('#play').click();
 await page.locator('#library-pose').click();const pose=page.locator('#clips [data-pose-id]').filter({hasText:/^Fight 01/});await placeAction(page,pose);await page.locator('#library-actions').click();await placeAction(page,source);
 const second=await page.locator('#segments .action').boundingBox();await placeAction(page,page.locator('#transitionSource'),{x:second.x+8,y:second.y+25});
 await page.locator('#saveAction').click();await page.locator('#actionName').fill('姿势接蹲走');await page.locator('#confirmSave').click();await expect(page.locator('#saveActionDialog')).not.toBeVisible();
 await page.locator('#clips [data-custom-id]').click();await page.locator('#restart').click();await expect(page.locator('#currentClip')).toHaveText('姿势接蹲走');await page.locator('#play').click();
 await page.locator('#seek').evaluate(el=>{el.value=2;el.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#restart').click();await expect(page.locator('#currentClip')).toHaveText('Fight 01');await expect.poll(async()=>Number(await page.locator('#seek').inputValue())).toBeLessThan(.5);
});

test('播放栏倍速/预览定位同步，编辑草稿期间不触发播放或定位',async({page})=>{
 await load(page);await page.locator('#clips [data-clip-name="Crouch_Fwd_Loop"]').click();await page.locator('#play').click();
 await page.locator('.speed-buttons [data-speed="2"]').click();await expect(page.locator('#speed')).toHaveValue('2');
 await expect(page.locator('.speed-buttons [data-speed="2"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#previewSeek').evaluate(el=>{el.value=.3;el.dispatchEvent(new Event('input',{bubbles:true}));});
 await expect(page.locator('#clock')).toHaveText('0.30 s');await expect(page.locator('#currentClip')).toHaveText('蹲行');
 await page.locator('#restart').click();await expect.poll(async()=>Number(await page.locator('#clock').textContent().then(text=>text.replace(' s','')))).toBeGreaterThan(.3);
 await page.locator('#editPose').click();
 const before=await page.evaluate(async()=>{const {workbench,bodyControls}=await import('/labs/motion/motion.bundle.js');return {inspect:workbench.inspect(),time:bodyControls.getState().sourceTime};});
 await page.locator('#play').click();await page.locator('#previewSeek').evaluate(el=>{el.value=.5;el.dispatchEvent(new Event('input',{bubbles:true}));});
 const after=await page.evaluate(async()=>{const {workbench,bodyControls}=await import('/labs/motion/motion.bundle.js');return {inspect:workbench.inspect(),time:bodyControls.getState().sourceTime};});
 expect(after).toEqual(before);
});
