import {test,expect} from '@playwright/test';
import {resizeSegment} from './resize-segment-helper.js';
test('移除右栏片段设置，时间轴仍可调整动作与过渡时长',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/labs/motion/index.html?tools=1');await expect(page.locator('.segment-settings')).toHaveCount(0);
 await page.locator('#humanDemo').click();await expect(page.locator('#status')).toContainText('已载入');await page.locator('#quickSequence').click();await page.locator('#play').click();
 const action=page.locator('#segments .action').first(),transition=page.locator('#segments .transition').first();
 const original=Number(await page.locator('#seek').getAttribute('max'));await resizeSegment(page,action,3);await expect(action).toContainText('3.00 s');expect(Number(await page.locator('#seek').getAttribute('max'))).toBeCloseTo(original+.5,5);
 await resizeSegment(page,transition,.7);await expect(transition).toContainText('0.70 s');
 await page.locator('#timelineUndo').click();await expect(transition).toContainText('0.35 s');await page.locator('#timelineRedo').click();await expect(transition).toContainText('0.70 s');
 await transition.click();await page.keyboard.press('Delete');await expect(page.locator('#segments .transition')).toHaveCount(3);await expect(page.locator('#segments .action')).toHaveCount(5);
 await page.setViewportSize({width:1280,height:720});await page.screenshot({path:'output/acceptance/motion-no-segment-settings.png'});expect(errors).toEqual([]);
});
