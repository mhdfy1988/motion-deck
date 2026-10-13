import {test,expect} from '@playwright/test';
import {handleConfirmation} from './confirm-helper.js';
import {placeAction} from './drag-source-helper.js';
test('UAL2原始GLB渲染、43动作接入、混排过渡保存恢复，资源失败不回退',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/labs/motion/index.html?tools=1');await page.locator('#humanDemo').click();await expect(page.locator('#status')).toContainText('117 动作');
 const rows=page.locator('#clips button').filter({hasText:'UAL2 ·'});await expect(rows).toHaveCount(61);
 const source=rows.filter({hasText:'Sword_Heavy_Combo'}).first();await source.click();await expect(page.locator('#currentClip')).toHaveText('UAL2 · Sword_Heavy_Combo');await page.locator('#play').click();await expect.poll(()=>page.locator('#clock').textContent()).not.toBe('0.00 s');await page.locator('#play').click();await placeAction(page,source);
 await page.locator('#library-pose').click();await placeAction(page,page.locator('#clips [data-pose-id]').nth(1));const pose=await page.locator('#segments .pose').boundingBox();await placeAction(page,page.locator('#transitionSource'),{x:pose.x+8,y:pose.y+30});await expect(page.locator('#segments .transition')).toHaveCount(1);
 await page.locator('#saveAction').click();await page.locator('#actionName').fill('动作②接姿势');await page.locator('#confirmSave').click();await expect(page.locator('#status')).toContainText('保存');await page.reload();await expect(page.locator('#status')).toContainText('已恢复');await expect(page.locator('#segments button')).toHaveCount(0);await placeAction(page,page.locator('#clips [data-custom-id]'));await expect(page.locator('#segments .action')).toContainText('动作②接姿势');await expect(page.locator('#segments .pose,#segments .transition')).toHaveCount(0);
 await page.screenshot({path:'output/acceptance/motion-ual2-sequence.png'});
 await page.route('**/UAL2_Standard.glb',r=>r.fulfill({status:404,body:'missing'}));await handleConfirmation(page);await page.locator('#humanDemo').click();await expect(page.locator('#error')).toContainText('动作②未准备');await expect(page.locator('#segments .action')).toHaveCount(1);expect(errors).toEqual([]);
});
