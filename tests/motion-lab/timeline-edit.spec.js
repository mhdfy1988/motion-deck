import {test,expect} from '@playwright/test';
test('直接拖动时间轴调整时长、取消、排序和删除',async({page})=>{
 await page.goto('/labs/motion/index.html?tools=1');await page.locator('#humanDemo').click();await expect(page.locator('#status')).toContainText('已载入');await page.locator('#quickSequence').click();await page.locator('#play').click();
 const first=page.locator('#segments .action').first(),key=await first.getAttribute('data-key');
 let handle=await first.locator('.resize-handle:not(.resize-left)').boundingBox();const old=Number(await first.getAttribute('data-duration'));
 const pps=await page.evaluate(()=>document.getElementById('timelineTrack').clientWidth/Number(document.getElementById('seek').max));
 await page.keyboard.down('Alt');await page.mouse.move(handle.x+handle.width/2,handle.y+25);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+pps,handle.y+25,{steps:5});
 await expect(first).toContainText('3.50 s');await page.mouse.up();
 handle=await first.locator('.resize-handle:not(.resize-left)').boundingBox();await page.mouse.move(handle.x+5,handle.y+25);await page.mouse.down();await page.mouse.move(handle.x+70,handle.y+25,{steps:4});await page.keyboard.press('Escape');await page.mouse.up();expect(Number(await first.getAttribute('data-duration'))).toBeCloseTo(old+1,2);await page.keyboard.up('Alt');
 const source=await first.boundingBox(),target=await page.locator('#segments .action').nth(2).boundingBox();await page.mouse.move(source.x+30,source.y+25);await page.mouse.down();await page.mouse.move(target.x+target.width*.8,target.y+25,{steps:12});await expect(page.locator('.timeline-drop')).toBeVisible();await page.mouse.up();await expect(page.locator('#segments .action').nth(2)).toHaveAttribute('data-key',key);
 const transition=page.locator('#segments .transition').first(),edge=await transition.locator('.resize-handle:not(.resize-left)').boundingBox(),scale=await page.evaluate(()=>document.getElementById('timelineTrack').clientWidth/Number(document.getElementById('seek').max));await page.mouse.move(edge.x+5,edge.y+25);await page.mouse.down();await page.mouse.move(edge.x+5+scale*.5,edge.y+25,{steps:5});await expect(transition).toContainText('0.85 s');await page.mouse.up();
 const transitionCount=await page.locator('#segments .transition').count();await transition.click();await page.locator('#timelineRemove').click();await expect(page.locator('#segments .transition')).toHaveCount(transitionCount-1);await expect(page.locator('#segments .action')).toHaveCount(5);
 await page.locator('#segments .action').nth(2).click();await page.keyboard.press('Delete');await expect(page.locator('#segments .action')).toHaveCount(4);
 await page.screenshot({path:'output/acceptance/motion-timeline-edit.png'});
 for(let i=0;i<4;i++){await page.locator('#segments .action').first().click();await page.locator('#timelineRemove').click();}await expect(page.locator('#segments button')).toHaveCount(0);await expect(page.locator('#timelineRemove')).toBeDisabled();
});
