import {test,expect} from '@playwright/test';
import {placeAction} from './drag-source-helper.js';
import {resizeSegment} from './resize-segment-helper.js';

test('简版空状态、两栏布局及短窗口没有外层滚动',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await expect(page.locator('#welcome')).toBeVisible();await expect(page.locator('main')).toBeHidden();
 await page.setViewportSize({width:1920,height:900});await page.screenshot({path:'output/acceptance/motion-simple-welcome.png'});
 await page.locator('#welcomeDemo').click();await expect(page.locator('#status')).toContainText('已载入');await expect(page.locator('#welcome')).toBeHidden();await expect(page.locator('.settings')).toBeHidden();await expect(page.locator('.library-bottom')).toBeHidden();
 for(const size of [{width:1920,height:900},{width:1280,height:720},{width:1280,height:600}]){
  await page.setViewportSize(size);await expect(page.locator('#green')).toBeVisible();await expect(page.locator('#skeleton')).toBeVisible();await expect(page.locator('#transitionSource')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.querySelector('.library').scrollHeight-document.querySelector('.library').clientHeight)).toBeLessThanOrEqual(1);
  const stage=await page.locator('#stage').boundingBox(),axis=await page.locator('.timeline').boundingBox();expect(stage.width).toBeGreaterThan(size.width*.7);expect(axis.y+axis.height).toBeLessThanOrEqual(size.height+1);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollHeight-innerHeight)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`output/acceptance/motion-simple-${size.width}-${size.height}.png`});
 }
 expect(errors).toEqual([]);
});

test('简版真实拖放、手动过渡、改时长、排序交换及删除恢复',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('#welcomeDemo').click();await expect(page.locator('#status')).toContainText('已载入');
 const idle=page.locator('#clips [data-clip-name="Idle_Loop"]'),sword=page.locator('#clips [data-clip-name="Sword_Attack"]').first(),actions=page.locator('#segments .action');
 await idle.click();await expect(idle).toHaveClass(/active/);await expect(actions).toHaveCount(0);await placeAction(page,idle);await placeAction(page,sword);await expect(actions).toHaveCount(2);await expect(page.locator('#segments .transition')).toHaveCount(0);
 const second=await actions.last().boundingBox();await placeAction(page,page.locator('#transitionSource'),{x:second.x+8,y:second.y+30});await expect(page.locator('#segments .transition')).toHaveCount(1);
 await resizeSegment(page,actions.first(),3);await expect(actions.first()).toContainText('3.00 s');await page.locator('#timelineUndo').click();await expect(actions.first()).toContainText('2.50 s');await page.locator('#timelineRedo').click();await expect(actions.first()).toContainText('3.00 s');
 const keys=await actions.evaluateAll(nodes=>nodes.map(n=>n.dataset.key)),a=await actions.first().boundingBox(),b=await actions.last().boundingBox();await page.mouse.move(a.x+30,a.y+30);await page.mouse.down();await page.mouse.move(b.x+b.width*.5,b.y+30,{steps:12});await expect(page.locator('.timeline-drag-ghost')).toBeVisible();await page.mouse.up();expect(await actions.evaluateAll(nodes=>nodes.map(n=>n.dataset.key))).toEqual(keys.toReversed());await page.locator('#timelineUndo').click();
 await page.locator('#green').check();await page.locator('#green').uncheck();await page.locator('#skeleton').check();await page.locator('#skeleton').uncheck();
 await expect(page.locator('#sequencePlay')).toHaveCount(0);
 await actions.first().click();await page.locator('#play').click();await expect.poll(()=>page.locator('#seek').inputValue().then(Number)).toBeGreaterThan(.05);await page.locator('#play').click();
 await expect(page.locator('#timelineAll')).toHaveText('全选');await expect(page.locator('#timelineNone')).toHaveText('全不选');await expect(page.locator('#timelineAll svg, #timelineNone svg')).toHaveCount(0);
 await page.locator('#timelineAll').click();await expect(page.locator('#selectionCount')).toHaveText('已选 2');await page.locator('#timelineNone').click();await expect(page.locator('#selectionCount')).toHaveText('已选 0');
 await actions.last().click();await page.locator('#timelineRemove').click();await expect(actions).toHaveCount(1);await page.locator('#timelineUndo').click();await expect(actions).toHaveCount(2);
 await page.screenshot({path:'output/acceptance/motion-simple-composed.png'});expect(errors).toEqual([]);
});
