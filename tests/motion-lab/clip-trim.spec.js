import {test,expect} from '@playwright/test';
import {placeAction} from './drag-source-helper.js';
test('简单动作裁剪、编排与辅助编辑默认隐藏',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/labs/motion/index.html?tools=1');await page.locator('#humanDemo').click();await expect(page.locator('#status')).toContainText('已载入');await expect(page.locator('.pose-handles')).toBeHidden();await expect(page.locator('.body-handles')).toBeHidden();
 await page.locator('#quickSequence').click();await expect(page.locator('#segments .action')).toHaveCount(5);await expect(page.locator('#segments .transition')).toHaveCount(4);await expect(page.locator('#segments .action').first()).toContainText('站立待机');await expect(page.locator('#segments .action').last()).toContainText('站立待机');await page.locator('#play').click();await page.screenshot({path:'output/acceptance/motion-simple-sequence.png'});
 await page.locator('#source').selectOption({label:'Sword_Attack'});await page.locator('#sourceTrim > summary').click();await page.locator('#trimIn').fill('.2');await page.locator('#trimOut').fill('.7');await placeAction(page);await expect(page.locator('#segments .action')).toHaveCount(6);await expect(page.locator('#segments .action').last()).toContainText('0.50 s');
 await page.locator('#trimOut').fill('.8');await expect(page.locator('#segments .action').last()).toContainText('0.50 s');
 await page.locator('#trimIn').fill('5');await placeAction(page);await expect(page.locator('#error')).toContainText('动作范围');await expect(page.locator('#segments .action')).toHaveCount(6);
 await page.locator('#posePanel > summary').click();await expect(page.locator('.body-handles')).toBeVisible();await page.locator('#posePanel > summary').click();await expect(page.locator('.body-handles')).toBeHidden();expect(errors).toEqual([]);
 await page.setViewportSize({width:1280,height:720});await expect(page.locator('.segment-settings')).toHaveCount(0);const axis=await page.locator('.timeline').boundingBox();expect(axis.y+axis.height).toBeLessThanOrEqual(720);await page.screenshot({path:'output/acceptance/motion-simple-short.png'});
});
