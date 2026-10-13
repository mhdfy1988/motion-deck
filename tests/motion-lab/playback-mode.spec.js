import {test,expect} from '@playwright/test';
import {placeAction} from './drag-source-helper.js';
async function load(page){await page.goto('/');await page.locator('#welcomeDemo').click();await expect(page.locator('#status')).toContainText('已载入');}
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
