import {test,expect} from '@playwright/test';
import {resizeSegment} from './resize-segment-helper.js';
import {placeAction} from './drag-source-helper.js';

test('过渡必须主动放置，边界拒绝、取消、删除和历史恢复',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/labs/motion/index.html?tools=1');
 const card=page.locator('#transitionSource'),actions=page.locator('#segments .action'),transitions=page.locator('#segments .transition');
 await expect(card).toHaveAttribute('aria-disabled','true');await page.locator('#humanDemo').click();await expect(page.locator('#status')).toContainText('已载入');
 await page.locator('#source').selectOption({label:'Idle_Loop'});await placeAction(page);await expect(card).toHaveAttribute('aria-disabled','true');
 await page.locator('#source').selectOption({label:'Sword_Idle'});await placeAction(page);await expect(transitions).toHaveCount(0);await expect(card).toHaveAttribute('aria-disabled','false');
 const boundary=async()=>{const b=await actions.nth(1).boundingBox();return {x:b.x+10,y:b.y+35};};
 let first=await actions.first().boundingBox();await placeAction(page,card,{x:first.x+8,y:first.y+35});await expect(transitions).toHaveCount(0);
 let last=await actions.last().boundingBox();await placeAction(page,card,{x:last.x+last.width-8,y:last.y+35});await expect(transitions).toHaveCount(0);
 await placeAction(page,card,await boundary(),async()=>{await page.keyboard.press('Escape');});await expect(transitions).toHaveCount(0);
 await placeAction(page,card,await boundary(),async()=>{await expect(page.locator('.timeline-drag-ghost')).toBeVisible();await expect(page.locator('.timeline-drop.transition-placement')).toBeVisible();await page.screenshot({path:'output/acceptance/motion-transition-dragging.png'});});
 await expect(transitions).toHaveCount(1);await expect(actions).toHaveCount(2);await expect(transitions.first()).toContainText('0.35 s');
 await resizeSegment(page,transitions.first(),.8);await page.locator('#stage').click();
 await placeAction(page,card,await boundary());await expect(transitions).toHaveCount(1);await expect(transitions.first()).toContainText('0.80 s');
 await transitions.first().click();await page.locator('#timelineRemove').click();await expect(transitions).toHaveCount(0);await expect(actions).toHaveCount(2);
 await page.locator('#timelineUndo').click();await expect(transitions.first()).toContainText('0.80 s');await page.locator('#timelineRedo').click();await expect(transitions).toHaveCount(0);
 await actions.last().click();await page.locator('#addTransition').click();await expect(transitions.first()).toContainText('0.35 s');await expect(page.locator('#addTransition')).toBeDisabled();
 await page.locator('#timelineUndo').click();await expect(transitions).toHaveCount(0);await page.locator('#timelineRedo').click();await expect(transitions).toHaveCount(1);
 await page.setViewportSize({width:1280,height:720});await card.scrollIntoViewIfNeeded();await expect(card).toBeVisible();await page.screenshot({path:'output/acceptance/motion-transition-placed.png'});expect(errors).toEqual([]);
});
