import {test,expect} from '@playwright/test';
import {handleConfirmation} from './confirm-helper.js';
import {resizeSegment} from './resize-segment-helper.js';
async function setup(page){await page.goto('/labs/motion/index.html?tools=1');await page.locator('#humanDemo').click();await expect(page.locator('#status')).toContainText('已载入');await page.locator('#quickSequence').click();await page.locator('#play').click();}
test('单选、连续选择、批量删除及撤销重做',async({page})=>{
 await setup(page);const actions=page.locator('#segments .action'),original=await actions.evaluateAll(nodes=>nodes.map(n=>n.dataset.key));
 await actions.first().click();await actions.first().click({modifiers:['Control']});await expect(page.locator('#selectionCount')).toHaveText('已选 0');await expect(page.locator('#timelineRemove')).toBeDisabled();
 await actions.nth(0).click();await actions.nth(2).click({modifiers:['Control']});await expect(page.locator('#selectionCount')).toHaveText('已选 2');await expect(page.locator('#segments .selected')).toHaveCount(2);
 await page.locator('#timelineRemove').click();await expect(actions).toHaveCount(3);await page.locator('#timelineUndo').click();expect(await actions.evaluateAll(nodes=>nodes.map(n=>n.dataset.key))).toEqual(original);await expect(page.locator('#segments .selected')).toHaveCount(2);
 await page.locator('#timelineRedo').click();await expect(actions).toHaveCount(3);await page.locator('#timelineUndo').click();
 await actions.first().click();await actions.nth(2).click({modifiers:['Shift']});await expect(page.locator('#selectionCount')).toHaveText('已选 5');await page.keyboard.press('Delete');await expect(actions).toHaveCount(2);await page.locator('#timelineUndo').click();await expect(actions).toHaveCount(5);
 await page.locator('#timelineAll').click();await expect(page.locator('#selectionCount')).toHaveText('已选 5');await page.locator('#timelineNone').click();await expect(page.locator('#selectionCount')).toHaveText('已选 0');await expect(page.locator('#timelineRemove')).toBeDisabled();
 await actions.first().click();await resizeSegment(page,actions.first(),3);await actions.nth(1).click();await page.keyboard.press('Control+z');await expect(actions.first()).toContainText('2.50 s');await page.keyboard.press('Control+y');await expect(actions.first()).toContainText('3.00 s');
 await resizeSegment(page,actions.nth(1),2);await expect(page.locator('#timelineRedo')).toBeDisabled();
 await page.locator('#timelineAll').click();await page.locator('#timelineRemove').click();await expect(actions).toHaveCount(0);await page.locator('#timelineUndo').click();await expect(actions).toHaveCount(5);
 await page.screenshot({path:'output/acceptance/motion-timeline-selection.png'});
});
test('拖动中心交换，边缘插入，多选成组移动与撤销',async({page})=>{
 await setup(page);const actions=page.locator('#segments .action'),keys=await actions.evaluateAll(nodes=>nodes.map(n=>n.dataset.key));
 async function drag(from,to,ratio){const a=await actions.nth(from).boundingBox(),b=await actions.nth(to).boundingBox();await page.mouse.move(a.x+30,a.y+30);await page.mouse.down();await page.mouse.move(b.x+b.width*ratio,b.y+30,{steps:12});}
 await drag(0,2,.5);await expect(actions.nth(2)).toHaveClass(/swap-target/);await expect(page.locator('.timeline-drag-ghost')).toBeVisible();await expect(page.locator('.timeline-swap-preview')).toBeVisible();await expect(actions.first()).toHaveClass(/drag-source/);await page.screenshot({path:'output/acceptance/motion-timeline-swap.png'});await page.mouse.up();await expect(page.locator('.timeline-drag-ghost')).toHaveCount(0);expect(await actions.evaluateAll(nodes=>nodes.map(n=>n.dataset.key))).toEqual([keys[2],keys[1],keys[0],keys[3],keys[4]]);
 await page.locator('#timelineUndo').click();expect(await actions.evaluateAll(nodes=>nodes.map(n=>n.dataset.key))).toEqual(keys);
 await actions.nth(0).click();await actions.nth(1).click({modifiers:['Control']});await drag(0,3,.9);await page.mouse.up();expect(await actions.evaluateAll(nodes=>nodes.map(n=>n.dataset.key))).toEqual([keys[2],keys[3],keys[0],keys[1],keys[4]]);await expect(page.locator('#segments .action.selected')).toHaveCount(2);
 await page.locator('#timelineUndo').click();await expect(page.locator('#segments .action.selected')).toHaveCount(2);await drag(0,3,.5);await page.mouse.up();expect(await actions.evaluateAll(nodes=>nodes.map(n=>n.dataset.key))).toEqual([keys[3],keys[4],keys[2],keys[0],keys[1]]);
 await page.locator('#timelineUndo').click();await drag(0,2,.9);await page.keyboard.press('Escape');await page.mouse.up();expect(await actions.evaluateAll(nodes=>nodes.map(n=>n.dataset.key))).toEqual(keys);
});
test('示例添加、拖动时长、删除过渡均可整步恢复，更换模型清空历史',async({page})=>{
 await setup(page);const actions=page.locator('#segments .action');await page.locator('#timelineUndo').click();await expect(actions).toHaveCount(0);await page.locator('#timelineRedo').click();await expect(actions).toHaveCount(5);
 const handle=await actions.first().locator('.resize-handle:not(.resize-left)').boundingBox(),pps=await page.evaluate(()=>document.getElementById('timelineTrack').clientWidth/Number(document.getElementById('seek').max));await page.keyboard.down('Alt');await page.mouse.move(handle.x+5,handle.y+25);await page.mouse.down();await page.mouse.move(handle.x+5+pps,handle.y+25,{steps:12});await page.mouse.up();await page.keyboard.up('Alt');await expect(actions.first()).toContainText('3.50 s');await page.locator('#timelineUndo').click();await expect(actions.first()).toContainText('2.50 s');await page.locator('#timelineRedo').click();await expect(actions.first()).toContainText('3.50 s');
 await page.locator('#segments .transition').first().click();await page.locator('#timelineRemove').click();await expect(page.locator('#segments .transition')).toHaveCount(3);await page.locator('#timelineUndo').click();await expect(page.locator('#segments .transition')).toHaveCount(4);
 await expect(page.locator('.segment-settings')).toHaveCount(0);
 await handleConfirmation(page);await page.locator('#humanDemo').click();await expect(actions).toHaveCount(0);await expect(page.locator('#timelineUndo')).toBeDisabled();await expect(page.locator('#timelineRedo')).toBeDisabled();
});
