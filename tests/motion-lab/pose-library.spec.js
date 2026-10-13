import {test,expect} from '@playwright/test';
import {handleConfirmation} from './confirm-helper.js';
import {placeAction} from './drag-source-helper.js';
import {resolve} from 'node:path';
async function savePose(page,name){await page.locator('#capturePose').click();await page.locator('#poseName').fill(name);await page.locator('#confirmPoseSave').click();await expect(page.locator('#savePoseDialog')).not.toBeVisible();await expect(page.locator('#status')).toContainText('姿势已保存');}
async function seek(page,time){await page.locator('#previewSeek').evaluate((el,t)=>{el.value=t;el.dispatchEvent(new Event('input',{bubbles:true}));},time);}
test('姿势提取、持久化、独立拖放与动作混排过渡',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await handleConfirmation(page,true,false);
 await page.goto('/');await page.locator('#welcomeDemo').click();await expect(page.locator('#status')).toContainText('已载入');
 await page.locator('#clips [data-clip-name="Sword_Attack"]').first().click();await seek(page,.4);await savePose(page,'举剑');
 await expect(page.locator('#clips [data-pose-id]')).toHaveCount(100);await page.locator('#clips [data-pose-id]').filter({hasText:'举剑'}).click();await expect(page.locator('#currentClip')).toHaveText('举剑');
 await placeAction(page,page.locator('#clips [data-pose-id]').filter({hasText:'举剑'}));await placeAction(page,page.locator('#clips [data-pose-id]').filter({hasText:'举剑'}));await expect(page.locator('#segments .pose')).toHaveCount(2);
 const keys=await page.locator('#segments .pose').evaluateAll(rows=>rows.map(r=>r.dataset.key));expect(keys[0]).not.toBe(keys[1]);
 const pose=await page.locator('#segments .pose').last().boundingBox();await placeAction(page,page.locator('#transitionSource'),{x:pose.x+8,y:pose.y+25});await expect(page.locator('#segments .transition')).toHaveCount(1);
 await page.locator('#timelineUndo').click();await expect(page.locator('#segments .transition')).toHaveCount(0);await page.locator('#timelineRedo').click();
 await page.locator('#library-actions').click();await placeAction(page,page.locator('#clips [data-clip-name="Idle_Loop"]'));await expect(page.locator('#segments .action')).toHaveCount(1);
 await page.locator('#saveAction').click();await page.locator('#actionName').fill('姿势接待机');await page.locator('#confirmSave').click();await expect(page.locator('#saveActionDialog')).not.toBeVisible();
 await page.reload();await expect(page.locator('#status')).toContainText('已恢复');await expect(page.locator('#segments button')).toHaveCount(0);await expect(page.locator('#clips [data-custom-id]')).toHaveCount(1);await placeAction(page,page.locator('#clips [data-custom-id]'));await expect(page.locator('#segments .action')).toHaveCount(1);await expect(page.locator('#segments .pose,#segments .transition')).toHaveCount(0);
 await page.locator('#library-pose').click();await expect(page.locator('#clips [data-pose-id]')).toHaveCount(100);await page.screenshot({path:'output/acceptance/motion-pose-library.png'});
 await page.locator('#modelFiles').setInputFiles(resolve('fixtures/RobotExpressive.glb'));await expect(page.locator('#status')).toContainText('已载入');await page.locator('#library-pose').click();await expect(page.locator('#clips [data-pose-id]')).toHaveCount(0);expect(errors).toEqual([]);
});
test('只保存姿势也可刷新恢复，失败和取消不发布素材',async({page})=>{
 await page.goto('/');await page.locator('#welcomeDemo').click();await expect(page.locator('#status')).toContainText('已载入');await savePose(page,'站立');
 await page.reload();await expect(page.locator('#status')).toContainText('已恢复上次保存的姿势库');await expect(page.locator('#clips [data-pose-id]')).toHaveCount(100);await expect(page.locator('#segments button')).toHaveCount(0);await expect(page.locator('#actionTitle')).toHaveText('未命名动作');
 await page.locator('#capturePose').click();await page.locator('#poseName').fill('取消');await page.locator('#cancelPoseSave').click();await expect(page.locator('#clips [data-pose-id]')).toHaveCount(100);
 await page.evaluate(()=>{IDBObjectStore.prototype.put=function(){throw new Error('storage blocked');};});
 await page.locator('#capturePose').click();await page.locator('#poseName').fill('失败');await page.locator('#confirmPoseSave').click();await expect(page.locator('#error')).toContainText('姿势保存失败');await expect(page.locator('#savePoseDialog')).toBeVisible();await expect(page.locator('#clips [data-pose-id]')).toHaveCount(100);
});
