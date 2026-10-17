import {test,expect} from '@playwright/test';
import {waitForModel} from './model-ready-helper.js';

test('提示缓冲：短命令可见1.5秒、连续命令合并、结束立即清除',async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});await page.clock.install();
 await page.evaluate(async()=>{
  const {bindDesktopControl}=await import('/labs/motion/ui/desktop-control.js');
  window.motionDeckDesktop={onAssistantState:callback=>{window.activityState=callback;return ()=>{};},controlState:()=>Promise.resolve({assistant:{status:'idle'}}),onControlQuery:()=>()=>{},controlReady:()=>Promise.resolve()};
  window.disposeActivity=bindDesktopControl({});
 });
 const indicator=page.locator('#assistantActivity');
 await page.evaluate(()=>{activityState({status:'waiting'});});await expect(indicator).toHaveText('等待 AI');
 await page.evaluate(()=>{activityState({status:'operating'});activityState({status:'waiting'});});
 await page.clock.runFor(500);await expect(indicator).toHaveText('AI 助手正在操作');
 await page.evaluate(()=>{activityState({status:'operating'});activityState({status:'waiting'});});
 await page.clock.runFor(1100);await expect(indicator).toHaveText('AI 助手正在操作');
 await page.clock.runFor(400);await expect(indicator).toHaveText('等待 AI');
 await page.evaluate(()=>activityState({status:'operating'}));await page.clock.runFor(2000);await expect(indicator).toHaveText('AI 助手正在操作');
 await page.evaluate(()=>activityState({status:'waiting'}));await expect(indicator).toHaveText('等待 AI');
 await page.evaluate(()=>{activityState({status:'operating'});activityState({status:'waiting'});activityState({status:'idle'});});await expect(indicator).toBeHidden();
 await page.clock.runFor(2000);await expect(indicator).toBeHidden();
 await page.evaluate(()=>{activityState({status:'operating'});activityState({status:'waiting'});disposeActivity();});await page.clock.runFor(2000);await expect(indicator).toHaveCount(0);
});

test('实际工作台：共享查询/取帧与视图，草稿不被播放覆盖，放弃恢复',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/');await waitForModel(page,{actions:162});
 for(const [model,actions] of [['mesh2motion',162],['quaternius',117]]){
  if(model==='quaternius'){await page.locator('#replaceModel').selectOption(model);await waitForModel(page,{actions});}
  const before=await page.evaluate(async()=>{const {workbench}=await import('/labs/motion/motion.bundle.js');const info=workbench.inspect();return {info,rig:workbench.rigList({limit:2}),library:workbench.libraryList({limit:1})};});
  expect(before.info.status).toBe('ready');expect(before.info.counts.actions).toBe(actions);expect(before.rig.entries).toHaveLength(2);
  const frame=await page.evaluate(async snapshot=>{const {workbench}=await import('/labs/motion/motion.bundle.js');workbench.fromClip({clipId:snapshot.library.entries[0].id,time:.05,modelKey:snapshot.info.modelKey,revision:snapshot.info.revision});return {info:workbench.inspect(),rig:workbench.rigList({limit:2})};},before);
  expect(frame.info.editingContext).toBe('pose-draft');expect(frame.info.playing).toBe(false);await expect(page.locator('#currentClip')).toContainText('动作取帧');
  await expect(page.locator('#assistantPoseTools')).toHaveCount(0);await expect(page.locator('body')).not.toHaveClass(/assistant-operating/);
  // 等真实渲染帧，确认tick没有把姿势采样回源动作。
  await page.evaluate(()=>new Promise(resolve=>{let frames=0;function next(){if(++frames===12)resolve();else requestAnimationFrame(next);}requestAnimationFrame(next);}));
  const after=await page.evaluate(async()=>{const {workbench}=await import('/labs/motion/motion.bundle.js');return {info:workbench.inspect(),rig:workbench.rigList({limit:2})};});
  expect(after.rig.entries).toEqual(frame.rig.entries);expect(after.info.revision).toBe(frame.info.revision);
  await page.evaluate(async()=>{const {workbench}=await import('/labs/motion/motion.bundle.js');workbench.discardDraft();});
  await expect(page.locator('#previewContext')).toHaveText('源动作');
  await expect(page.locator('body')).not.toHaveClass(/assistant-operating/);
 }
 expect(errors).toEqual([]);
});

test('协作状态显示操作中与等待AI，结束隐藏，全窗且减少动态效果',async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});
 await page.evaluate(async()=>{
  const {bindDesktopControl}=await import('/labs/motion/ui/desktop-control.js');
  window.motionDeckDesktop={onAssistantState:callback=>{window.activityState=callback;return ()=>{};},controlState:()=>Promise.resolve({assistant:{status:'idle'}}),onControlQuery:callback=>{window.activityQuery=callback;return ()=>{};},controlReady:()=>Promise.resolve(),answerControlQuery:()=>Promise.resolve()};
  window.disposeActivity=bindDesktopControl({modelInspect:()=>new Promise(resolve=>{window.finishActivity=()=>resolve({revision:1});})});
 });
 const indicator=page.locator('#assistantActivity');await expect(indicator).toBeHidden();
 await page.evaluate(()=>activityState({status:'operating'}));
 await expect(indicator).toBeVisible();await expect(indicator).toHaveText('AI 助手正在操作');await expect(indicator.locator('button')).toHaveCount(0);
 expect(await page.locator('body').evaluate(el=>{const css=getComputedStyle(el,'::after');return [css.position,css.pointerEvents,css.top,css.left];})).toEqual(['fixed','none','3px','3px']);
 expect(await indicator.evaluate(el=>el.closest('.top')!==null)).toBe(true);
 expect(await page.locator('body').evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('assistant-orbit');
 const firstAngle=await page.locator('body').evaluate(el=>getComputedStyle(el,'::before').getPropertyValue('--assistant-angle'));
 await page.waitForTimeout(200);expect(await page.locator('body').evaluate(el=>getComputedStyle(el,'::before').getPropertyValue('--assistant-angle'))).not.toBe(firstAngle);
 expect(await indicator.evaluate(el=>getComputedStyle(el).color)).toBe('rgb(224, 243, 255)');
 expect(await indicator.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('assistant-pill-sweep');
 await page.screenshot({path:'output/assistant-activity/halo-operating.png'});
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('body').evaluate(el=>getComputedStyle(el,'::after').animationName)).toBe('none');
 await page.screenshot({path:'output/assistant-activity/global-active.png'});
 expect(await indicator.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>activityState({status:'waiting'}));await expect(indicator).toHaveText('等待 AI');await expect(page.locator('body')).toHaveClass(/assistant-waiting/);
 expect(await indicator.evaluate(el=>getComputedStyle(el).color)).toBe('rgb(224, 243, 255)');
 expect(await page.locator('body').evaluate(el=>getComputedStyle(el,'::before').animationDuration)).toBe('8s');
 const waitingAngle=await page.locator('body').evaluate(el=>getComputedStyle(el,'::before').getPropertyValue('--assistant-angle'));
 const sweepPosition=await indicator.evaluate(el=>getComputedStyle(el,'::before').left);
 await page.waitForTimeout(1100);
 expect(await page.locator('body').evaluate(el=>getComputedStyle(el,'::before').getPropertyValue('--assistant-angle'))).not.toBe(waitingAngle);
 expect(await indicator.evaluate(el=>getComputedStyle(el,'::before').left)).not.toBe(sweepPosition);
 const centered=await indicator.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.top').getBoundingClientRect();return Math.abs((a.left+a.width/2)-(b.left+b.width/2));});expect(centered).toBeLessThan(1);await page.screenshot({path:'output/assistant-activity/halo-waiting.png'});
 await page.evaluate(()=>activityState({status:'idle'}));await expect(indicator).toBeHidden();await expect(page.locator('body')).not.toHaveClass(/assistant-operating/);
 await page.evaluate(()=>{activityState({status:'waiting'});disposeActivity();});await expect(indicator).toHaveCount(0);await expect(page.locator('body')).not.toHaveClass(/assistant-operating/);
});
