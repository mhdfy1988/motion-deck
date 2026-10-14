import {waitForModel} from './model-ready-helper.js';
import {test,expect} from '@playwright/test';
import {placeAction} from './drag-source-helper.js';
async function setup(page){await page.goto('/');await page.locator('#replaceModel').selectOption('quaternius');await waitForModel(page,{actions:117});await expect(page.locator('#status')).toContainText('117 动作');await placeAction(page,page.locator('#clips [data-clip-name="Idle_Loop"]'));await placeAction(page,page.locator('#clips [data-clip-name="Sword_Attack"]').first());}
async function edge(page,row,delta,cancel=false){const h=await row.locator('.resize-handle:not(.resize-left)').boundingBox(),pps=await page.evaluate(()=>document.getElementById('timelineTrack').clientWidth/Number(document.getElementById('seek').max));await page.mouse.move(h.x+5,h.y+25);await page.mouse.down();await page.mouse.move(h.x+5+pps*delta,h.y+25,{steps:10});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}
test('只保留裁剪/变速切换和边缘拖动，秒数不再打开输入',async({page})=>{
 await setup(page);const action=page.locator('#segments .action').first(),modes=page.getByRole('group',{name:'边缘拖动模式'}),tools=page.locator('.timeline-duration-tools');await action.click();
 await expect(modes).toBeVisible();await expect(tools.locator('button')).toHaveCount(2);await expect(page.getByRole('button',{name:/变速时长/})).toHaveCount(0);
 await action.locator('.segment-duration').click();await page.keyboard.press('Enter');await expect(page.locator('.duration-editor')).toHaveCount(0);await expect(action.locator('.segment-duration')).not.toHaveAttribute('tabindex','0');await expect(action).toHaveAttribute('data-duration','2.5');
 await modes.getByRole('button',{name:'变速',exact:true}).click();await expect(modes.getByRole('button',{name:'变速',exact:true})).toHaveAttribute('aria-pressed','true');await edge(page,action,.5);await expect(action).toHaveAttribute('data-duration','3');await expect(action).toHaveAttribute('data-source-out','2.5');
 await edge(page,action,-.2,true);await expect(action).toHaveAttribute('data-duration','3');
 await modes.getByRole('button',{name:'裁剪',exact:true}).click();await edge(page,action,-.6);await expect(action).toHaveAttribute('data-duration','2.4');await expect(action).toHaveAttribute('data-source-out','2');
 await page.locator('#timelineUndo').click();await expect(action).toHaveAttribute('data-duration','3');await page.locator('#timelineRedo').click();await expect(action).toHaveAttribute('data-duration','2.4');
 await page.screenshot({path:'output/acceptance/motion-edge-modes-only.png'});await page.locator('#timelineNone').click();await expect(tools).toBeVisible();await expect(tools.locator('button').first()).toBeDisabled();
});

test('边缘按下及拖动保持双箭头，取消后释放光标并保留原时长',async({page})=>{
 await setup(page);const action=page.locator('#segments .action').first(),duration=await action.getAttribute('data-duration');
 for(const selector of ['.resize-left','.resize-handle:not(.resize-left)']){
  const handle=action.locator(selector),bounds=await handle.boundingBox();
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+25);await expect(handle).toHaveCSS('cursor','ew-resize');
  await page.mouse.down();await expect(action).toHaveCSS('cursor','ew-resize');
  await page.mouse.move(bounds.x+bounds.width/2+10,bounds.y-40,{steps:4});await expect(page.locator('body')).toHaveCSS('cursor','ew-resize');
  await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('body')).not.toHaveClass(/timeline-resizing/);await expect(action).toHaveCSS('cursor','grab');await expect(action).toHaveAttribute('data-duration',duration);
 }
 const right=await action.locator('.resize-handle:not(.resize-left)').boundingBox();await page.mouse.move(right.x+right.width/2,right.y+25);await page.mouse.down();await expect(action).toHaveCSS('cursor','ew-resize');await page.mouse.up();await expect(page.locator('body')).not.toHaveClass(/timeline-resizing/);await expect(action).toHaveAttribute('data-duration',duration);
});
test('向内20像素命中，短片段和邻接边缘不重叠',async({page})=>{
 await setup(page);const first=page.locator('#segments .action').first(),last=page.locator('#segments .action').last();const right=await first.locator('.resize-handle:not(.resize-left)').boundingBox(),left=await last.locator('.resize-left').boundingBox();expect(right.width).toBeCloseTo(20,0);expect(right.x+right.width).toBeLessThanOrEqual(left.x+1);
 await page.mouse.move(right.x+5,right.y+25);expect(await first.locator('.resize-handle:not(.resize-left)').evaluate(n=>getComputedStyle(n).cursor)).toBe('ew-resize');expect(await first.locator('.resize-handle:not(.resize-left)').evaluate(n=>getComputedStyle(n,'::after').opacity)).toBe('1');
 await edge(page,first,-2.45);await expect(first).toHaveAttribute('data-duration','0.05');const short=await first.boundingBox(),l=await first.locator('.resize-left').boundingBox(),r=await first.locator('.resize-handle:not(.resize-left)').boundingBox();expect(l.x+l.width).toBeLessThanOrEqual(r.x+.1);expect(l.x).toBeGreaterThanOrEqual(short.x);expect(r.x+r.width).toBeLessThanOrEqual(short.x+short.width);
});
test('姿势和过渡继续通过边缘调整时长',async({page})=>{
 await page.goto('/labs/motion/index.html?tools=1');await page.locator('#humanDemo').click();await waitForModel(page,{actions:117});await expect(page.locator('#status')).toContainText('117 动作');await page.locator('#quickSequence').click();await page.locator('#play').click();
 const transition=page.locator('#segments .transition').first();await edge(page,transition,.25);await expect(transition).toHaveAttribute('data-duration','0.6');await expect(page.locator('.timeline-duration-tools')).toBeVisible();await expect(page.locator('.timeline-duration-tools button').first()).toBeDisabled();
 await page.locator('#capturePose').click();await page.locator('#poseName').fill('拖动验证姿势');await page.locator('#confirmPoseSave').click();await expect(page.locator('#status')).toContainText('姿势已保存');
 const first=await page.locator('#segments .action').first().boundingBox();await placeAction(page,page.locator('#clips [data-pose-id]').filter({hasText:'拖动验证姿势'}),{x:first.x+8,y:first.y+25});const pose=page.locator('#segments .pose');await edge(page,pose,.8);await expect(pose).toHaveAttribute('data-duration','1.8');await page.locator('#timelineUndo').click();await expect(pose).toHaveAttribute('data-duration','1');await expect(page.locator('.timeline-duration-tools')).toBeVisible();await expect(page.locator('.timeline-duration-tools button').first()).toBeDisabled();
});
