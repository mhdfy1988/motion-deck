import {test,expect} from '@playwright/test';
import {waitForModel} from './model-ready-helper.js';

test('工作台文字层级、可读性及紧凑窗口控件可达',async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});
 await expect(page.locator('body')).toHaveCSS('font-family','"Segoe UI", "Microsoft YaHei UI", sans-serif');
 await expect(page.locator('#clips [data-clip-index]').first()).toHaveCSS('font-size','13px');
 await expect(page.locator('#clips [data-clip-index]').first()).toHaveCSS('font-weight','400');
 await expect(page.locator('.section-head h2')).toHaveCSS('font-size','16px');
 for(const selector of ['#viewPreset','#librarySearch','#exportMotion','#capturePose','#currentClip','.library-tabs button','.timeline-edge-modes button']){
  for(const control of await page.locator(selector).all())await expect(control).toHaveCSS('font-size','13px');
 }
 for(const viewport of [{width:1920,height:1080},{width:1000,height:600}]){
  await page.setViewportSize(viewport);
  for(const id of ['exportMotion','viewPreset','capturePose','saveAction'])await expect(page.locator('#'+id)).toBeInViewport();
  const first=page.locator('#clips [data-clip-index]').first();await expect(first).toBeInViewport();
  const row=await first.boundingBox(),list=await page.locator('#clips').boundingBox();expect(row.y+row.height).toBeLessThanOrEqual(list.y+list.height);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  const library=await page.locator('.library').boundingBox(),preview=await page.locator('.viewport').boundingBox(),divider=await page.locator('.titlebar-divider').boundingBox(),model=await page.locator('#replaceModel').boundingBox();
  expect(Math.abs(divider.x-(library.x+library.width+preview.x)/2)).toBeLessThan(1);
  expect(model.x).toBeGreaterThan(preview.x);expect(model.width).toBeCloseTo(176,0);
  await page.screenshot({path:`output/acceptance/motion-typography-${viewport.width}.png`});
 }
});

test('播放三档按钮直接点选、键盘切换和短窗布局',async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});
 const buttons=page.locator('.speed-buttons button');await expect(buttons).toHaveCount(3);
 await expect(page.locator('.speed-buttons [aria-pressed=true]')).toHaveText('1×');
 await expect(page.locator('.speed-buttons [aria-pressed=true]')).toHaveCSS('background-color','rgb(45, 64, 87)');
 const before=await page.locator('#segments').innerHTML();
 for(const speed of ['0.5','2','1']){
  await page.getByRole('button',{name:speed+'倍速',exact:true}).click();
  await expect(page.locator('#speed')).toHaveValue(speed);
  await expect(page.locator('.speed-buttons [aria-pressed=true]')).toHaveCount(1);
  await expect(page.locator('.speed-buttons [aria-pressed=true]')).toHaveText(speed+'×');
 }
 await page.getByRole('button',{name:'0.5倍速',exact:true}).focus();await page.keyboard.press('Space');await expect(page.locator('#speed')).toHaveValue('0.5');
 await page.getByRole('button',{name:'1倍速',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('#speed')).toHaveValue('1');
 expect(await page.locator('#segments').innerHTML()).toBe(before);
 await page.setViewportSize({width:1000,height:600});
 for(const button of await buttons.all())await expect(button).toBeInViewport();
 await expect(page.locator('.speed-control select')).toHaveCount(0);
 await page.screenshot({path:'output/acceptance/motion-speed-buttons.png'});
});

test('模型紧凑菜单与视角分组浮层，实际点击、取消及键盘均沿原切换链路',async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});
 const model=page.locator('#replaceModel'),view=page.locator('#viewPreset');
 for(const select of [model,view]){await expect(select).toHaveCSS('appearance','base-select');await expect(select).toHaveCSS('display','flex');}
 await model.click();await expect(model.locator('option[value=mesh2motion]')).toBeVisible();
 expect(await model.evaluate(n=>getComputedStyle(n,'::picker(select)').borderRadius)).toBe('8px');
 await page.screenshot({path:'output/acceptance/motion-model-menu.png'});
 await page.keyboard.press('Escape');expect(await model.evaluate(n=>n.matches(':open'))).toBe(false);
 await model.click();await model.locator('option[value=quaternius]').click();await waitForModel(page,{actions:117});await expect(model).toHaveValue('quaternius');
 await model.selectOption('mesh2motion');await waitForModel(page,{actions:162});
 await view.click();await expect(view.locator('option[value=right]')).toBeVisible();
 await expect(view.locator('legend')).toHaveText(['自由视角','平视','斜俯视','等角']);
 const one=await view.locator('option[value=front]').boundingBox(),two=await view.locator('option[value=right]').boundingBox();
 expect(Math.abs(one.y-two.y)).toBeLessThan(1);expect(two.x-one.x).toBeGreaterThan(100);
 for(const viewport of [{width:1440,height:900},{width:1000,height:600}]){
  await page.setViewportSize(viewport);
  for(const group of await view.locator('optgroup').all()){
   const bounds=await group.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width);
  }
 }
 await page.screenshot({path:'output/acceptance/motion-view-menu.png'});
 await view.locator('option[value=right]').click();await expect(view).toHaveValue('right');
 await view.focus();await page.keyboard.press('Space');expect(await view.evaluate(n=>n.matches(':open'))).toBe(true);
 await page.keyboard.press('Escape');await expect(view).toHaveValue('right');
 await expect(page.locator('#error')).toBeHidden();
});
