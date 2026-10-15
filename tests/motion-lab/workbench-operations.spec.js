import {test,expect} from '@playwright/test';
import {waitForModel} from './model-ready-helper.js';

test('实际工作台：共享查询/取帧与视图，草稿不被播放覆盖，放弃恢复',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/');await waitForModel(page,{actions:162});
 for(const [model,actions] of [['mesh2motion',162],['quaternius',117]]){
  if(model==='quaternius'){await page.locator('#replaceModel').selectOption(model);await waitForModel(page,{actions});}
  const before=await page.evaluate(async()=>{const {workbench}=await import('/labs/motion/motion.bundle.js');const info=workbench.inspect();return {info,rig:workbench.rigList({limit:2}),library:workbench.libraryList({limit:1})};});
  expect(before.info.status).toBe('ready');expect(before.info.counts.actions).toBe(actions);expect(before.rig.entries).toHaveLength(2);
  const frame=await page.evaluate(async snapshot=>{const {workbench}=await import('/labs/motion/motion.bundle.js');workbench.fromClip({clipId:snapshot.library.entries[0].id,time:.05,modelKey:snapshot.info.modelKey,revision:snapshot.info.revision});return {info:workbench.inspect(),rig:workbench.rigList({limit:2})};},before);
  expect(frame.info.editingContext).toBe('pose-draft');expect(frame.info.playing).toBe(false);await expect(page.locator('#currentClip')).toContainText('动作取帧');
  // 等真实渲染帧，确认tick没有把姿势采样回源动作。
  await page.evaluate(()=>new Promise(resolve=>{let frames=0;function next(){if(++frames===12)resolve();else requestAnimationFrame(next);}requestAnimationFrame(next);}));
  const after=await page.evaluate(async()=>{const {workbench}=await import('/labs/motion/motion.bundle.js');return {info:workbench.inspect(),rig:workbench.rigList({limit:2})};});
  expect(after.rig.entries).toEqual(frame.rig.entries);expect(after.info.revision).toBe(frame.info.revision);
  await page.evaluate(async()=>{const {workbench}=await import('/labs/motion/motion.bundle.js');workbench.discardDraft();});
  await expect(page.locator('#previewContext')).toHaveText('源动作');
 }
 expect(errors).toEqual([]);
});
