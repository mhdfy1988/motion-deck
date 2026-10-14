import {test,expect} from '@playwright/test';
import {handleConfirmation} from './confirm-helper.js';
import {placeAction} from './drag-source-helper.js';
import {resolve} from 'node:path';
import {cpus,totalmem} from 'node:os';
// 保留真实失败，不重试、不延长预算；轨迹用于区分等待点击和前序耗时。
test.use({trace:'retain-on-failure'});
async function timedStep(name,run){
 const start=performance.now();console.log(`[pose-profile] begin ${name}`);
 try{return await test.step(name,run);}finally{console.log(`[pose-profile] end ${name}: ${Math.round(performance.now()-start)} ms`);}
}
test.beforeEach(async({page,browser})=>{
 console.log('[pose-profile] host',JSON.stringify({cpu:cpus()[0]?.model,cores:cpus().length,memoryGiB:Math.round(totalmem()/2**30),browser:browser.version()}));
 const session=await browser.newBrowserCDPSession();
 try{const {gpu}=await session.send('SystemInfo.getInfo');console.log('[pose-profile] graphics',JSON.stringify({devices:gpu.devices,renderer:gpu.auxAttributes.glRenderer,vendor:gpu.auxAttributes.glVendor,displayType:gpu.auxAttributes.displayType,featureStatus:gpu.featureStatus}));}finally{await session.detach();}
 await page.addInitScript(()=>{
  window.__poseProfile={longTasks:0,longTaskMs:0,maxLongTaskMs:0};
  new PerformanceObserver(list=>{for(const entry of list.getEntries()){const p=window.__poseProfile;p.longTasks++;p.longTaskMs+=entry.duration;p.maxLongTaskMs=Math.max(p.maxLongTaskMs,entry.duration);}}).observe({type:'longtask',buffered:true});
 });
});
async function savePose(page,name){await page.locator('#capturePose').click();await page.locator('#poseName').fill(name);await page.locator('#confirmPoseSave').click();await expect(page.locator('#savePoseDialog')).not.toBeVisible();await expect(page.locator('#status')).toContainText('姿势已保存');}
async function seek(page,time){await page.locator('#previewSeek').evaluate((el,t)=>{el.value=t;el.dispatchEvent(new Event('input',{bubbles:true}));},time);}
test('姿势提取、持久化、独立拖放与动作混排过渡',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await handleConfirmation(page,true,false);
 await timedStep('加载默认模型并切换Quaternius',async()=>{await page.goto('/');await page.locator('#replaceModel').selectOption('quaternius');await expect(page.locator('#status')).toContainText('117 动作');});
 await timedStep('选择挥剑并保存姿势',async()=>{await page.locator('#clips [data-clip-name="Sword_Attack"]').first().click();await seek(page,.4);await savePose(page,'举剑');});
 await timedStep('预览保存姿势',async()=>{await expect(page.locator('#clips [data-pose-id]')).toHaveCount(100);await page.locator('#clips [data-pose-id]').filter({hasText:'举剑'}).click();await expect(page.locator('#currentClip')).toHaveText('举剑');});
 await timedStep('第一次拖放姿势',()=>placeAction(page,page.locator('#clips [data-pose-id]').filter({hasText:'举剑'})));
 await timedStep('第二次拖放姿势',async()=>{await placeAction(page,page.locator('#clips [data-pose-id]').filter({hasText:'举剑'}));await expect(page.locator('#segments .pose')).toHaveCount(2);});
 const keys=await page.locator('#segments .pose').evaluateAll(rows=>rows.map(r=>r.dataset.key));expect(keys[0]).not.toBe(keys[1]);
 await timedStep('拖放过渡',async()=>{const pose=await page.locator('#segments .pose').last().boundingBox();await placeAction(page,page.locator('#transitionSource'),{x:pose.x+8,y:pose.y+25});await expect(page.locator('#segments .transition')).toHaveCount(1);});
 console.log('[pose-profile] before undo',JSON.stringify(await page.evaluate(()=>({performance:window.__poseProfile,undoDisabled:document.querySelector('#timelineUndo').disabled}))));
 await timedStep('点击撤销',()=>page.locator('#timelineUndo').click());
 await timedStep('确认撤销并重做',async()=>{await expect(page.locator('#segments .transition')).toHaveCount(0);await page.locator('#timelineRedo').click();});
 await timedStep('拖放待机动作',async()=>{await page.locator('#library-actions').click();await placeAction(page,page.locator('#clips [data-clip-name="Idle_Loop"]'));await expect(page.locator('#segments .action')).toHaveCount(1);});
 await timedStep('保存合并动作',async()=>{await page.locator('#saveAction').click();await page.locator('#actionName').fill('姿势接待机');await page.locator('#confirmSave').click();await expect(page.locator('#saveActionDialog')).not.toBeVisible();});
 await timedStep('刷新恢复并拖放完整动作',async()=>{await page.reload();await expect(page.locator('#status')).toContainText('已恢复');await expect(page.locator('#segments button')).toHaveCount(0);await expect(page.locator('#clips [data-custom-id]')).toHaveCount(1);await placeAction(page,page.locator('#clips [data-custom-id]'));await expect(page.locator('#segments .action')).toHaveCount(1);await expect(page.locator('#segments .pose,#segments .transition')).toHaveCount(0);});
 await page.locator('#library-pose').click();await expect(page.locator('#clips [data-pose-id]')).toHaveCount(100);await page.screenshot({path:'output/acceptance/motion-pose-library.png'});
 await page.locator('#modelFiles').setInputFiles(resolve('fixtures/RobotExpressive.glb'));await expect(page.locator('#status')).toContainText('已载入');await page.locator('#library-pose').click();await expect(page.locator('#clips [data-pose-id]')).toHaveCount(0);expect(errors).toEqual([]);
});
test('只保存姿势也可刷新恢复，失败和取消不发布素材',async({page})=>{
 await page.goto('/');await page.locator('#replaceModel').selectOption('quaternius');await expect(page.locator('#status')).toContainText('117 动作');await savePose(page,'站立');
 await page.reload();await expect(page.locator('#status')).toContainText('已恢复上次保存的姿势库');await expect(page.locator('#clips [data-pose-id]')).toHaveCount(100);await expect(page.locator('#segments button')).toHaveCount(0);await expect(page.locator('#actionTitle')).toHaveText('未命名动作');
 await page.locator('#capturePose').click();await page.locator('#poseName').fill('取消');await page.locator('#cancelPoseSave').click();await expect(page.locator('#clips [data-pose-id]')).toHaveCount(100);
 await page.evaluate(()=>{IDBObjectStore.prototype.put=function(){throw new Error('storage blocked');};});
 await page.locator('#capturePose').click();await page.locator('#poseName').fill('失败');await page.locator('#confirmPoseSave').click();await expect(page.locator('#error')).toContainText('姿势保存失败');await expect(page.locator('#savePoseDialog')).toBeVisible();await expect(page.locator('#clips [data-pose-id]')).toHaveCount(100);
});
