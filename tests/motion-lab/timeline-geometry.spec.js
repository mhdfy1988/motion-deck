import {test,expect} from '@playwright/test';
import {placeAction} from './drag-source-helper.js';

test('比例稳定、缩放只改显示、适合全部显式执行',async({page})=>{
 await page.goto('/');await expect(page.locator('#status')).toContainText('162 动作');
 const source=page.locator('#clips [data-clip-index]').first();
 await placeAction(page,source);
 const first=page.locator('#segments .action').first(),width=(await first.boundingBox()).width;
 const duration=await first.getAttribute('data-duration');
 await placeAction(page,source);expect((await first.boundingBox()).width).toBeCloseTo(width,0);
 await page.setViewportSize({width:1280,height:600});expect((await first.boundingBox()).width).toBeCloseTo(width,0);
 await page.locator('#timelineZoomIn').click();expect((await first.boundingBox()).width).toBeCloseTo(width*1.25,0);
 await expect(first).toHaveAttribute('data-duration',duration);
 await page.locator('#timelineFit').click();const track=await page.locator('#timelineTrack').boundingBox(),scroll=await page.locator('#timelineScroll').boundingBox();expect(track.width).toBeCloseTo(scroll.width-12,0);
 const fitted=(await first.boundingBox()).width;await placeAction(page,source);expect((await first.boundingBox()).width).toBeCloseTo(fitted,0);
 const frames=await page.locator('#segments .action').evaluateAll(nodes=>nodes.map(node=>[node.dataset.duration,node.dataset.sourceIn,node.dataset.sourceOut]));
 await page.locator('#timelineZoomOut').click();expect(await page.locator('#segments .action').evaluateAll(nodes=>nodes.map(node=>[node.dataset.duration,node.dataset.sourceIn,node.dataset.sourceOut]))).toEqual(frames);
 await page.screenshot({path:'output/acceptance/motion-stable-timeline-scale.png'});
});

test('工具栏固定可见且禁用置灰，片段增删和历史恢复不改变页面高度',async({page})=>{
 await page.goto('/');await expect(page.locator('#status')).toContainText('162 动作');
 await page.setViewportSize({width:1920,height:900});
 await expect(page.locator('.timeline-head')).toBeVisible();
 const bounds=await page.locator('.timeline').boundingBox();
 const unchanged=async()=>{expect(await page.locator('.timeline').boundingBox()).toEqual(bounds);};
 for(const id of ['timelineUndo','timelineRedo','timelineAll','timelineNone','timelineRemove','newAction','saveAction','splitAction','trimLeft','trimRight']){await expect(page.locator('#'+id)).toBeVisible();await expect(page.locator('#'+id)).toBeDisabled();}
 await expect(page.locator('.timeline-duration-tools button').first()).toBeDisabled();
 const source=page.locator('#clips [data-clip-index]').first();
 await placeAction(page,source,undefined,async()=>{
  await expect(page.locator('#timelineScroll.drop-ready')).toHaveCSS('outline-style','none');
  await expect(page.locator('.timeline-drop.adding')).toBeVisible();
  expect(await page.locator('.timeline-drop.adding').evaluate(node=>getComputedStyle(node,'::before').content)).toBe('""');
  await expect(page.locator('#segments .empty')).toBeHidden();
  await page.screenshot({path:'output/acceptance/motion-compact-empty-drag.png'});
  await page.keyboard.press('Escape');
 });
 await expect(page.locator('#segments .action')).toHaveCount(0);await expect(page.locator('#segments .empty')).toBeVisible();
 await placeAction(page,source);await expect(page.locator('.timeline-head')).toBeVisible();await unchanged();
 await page.locator('#timelineUndo').click();await expect(page.locator('#segments .action')).toHaveCount(0);
 await expect(page.locator('#timelineRedo')).toBeVisible();await expect(page.locator('#timelineRedo')).toBeEnabled();await expect(page.locator('#saveAction')).toBeVisible();await expect(page.locator('#saveAction')).toBeDisabled();await unchanged();
 await page.locator('#timelineRedo').click();await expect(page.locator('#segments .action')).toHaveCount(1);
 await expect(page.locator('#saveAction')).toBeVisible();await unchanged();
});

test('工具栏与时间轴独立分层，宽屏及短窗口片段完整可见',async({page})=>{
 await page.goto('/');await expect(page.locator('#status')).toContainText('162 动作');
 await placeAction(page,page.locator('#clips [data-clip-index]').first());
 await expect(page.locator('.timeline-head')).toHaveCSS('background-color','rgb(32, 35, 40)');
 await expect(page.locator('.timeline')).toHaveCSS('background-color','rgb(21, 24, 28)');
 await expect(page.locator('.timeline-head')).toHaveCSS('border-bottom-width','1px');
 for(const viewport of [{width:1920,height:900},{width:1280,height:720},{width:1280,height:600}]){
  await page.setViewportSize(viewport);
  const library=await page.locator('.library').boundingBox(),preview=await page.locator('.viewport').boundingBox(),timeline=await page.locator('.timeline').boundingBox();
  expect(preview.x-library.x-library.width).toBeGreaterThanOrEqual(8);
  expect(timeline.y-preview.y-preview.height).toBeGreaterThanOrEqual(8);
  expect(library.y).toBe(preview.y);
  await expect(page.locator('.viewport')).toHaveCSS('border-radius','8px');
  const head=await page.locator('.timeline-head').boundingBox(),track=await page.locator('#timelineTrack').boundingBox(),axis=await page.locator('.timeline').boundingBox(),clip=await page.locator('#segments .action').boundingBox();
  expect(track.y-head.y-head.height).toBeGreaterThanOrEqual(11);
  expect(clip.y+clip.height).toBeLessThanOrEqual(axis.y+axis.height);
  expect(clip.x+clip.width).toBeLessThanOrEqual(axis.x+axis.width-24);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollHeight-innerHeight)).toBeLessThanOrEqual(1);
  await page.screenshot({path:`output/acceptance/motion-timeline-separation-${viewport.width}-${viewport.height}.png`});
 }
});
test('进度条、播放线与片段共享时间比例',async({page})=>{
 await page.goto('/labs/motion/index.html?tools=1');await page.locator('#humanDemo').click();await expect(page.locator('#status')).toContainText('117 动作');await page.locator('#quickSequence').click();await page.locator('#play').click();
 for(const viewport of [{width:1920,height:900},{width:1280,height:720}]){
  await page.setViewportSize(viewport);await page.locator('#timelineFit').click();const track=await page.locator('#timelineTrack').boundingBox(),segments=await page.locator('#segments button').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,width:n.getBoundingClientRect().width,start:Number(n.dataset.start),duration:Number(n.dataset.duration)}))),total=Number(await page.locator('#seek').getAttribute('max'));
  for(const s of segments){expect(Math.abs(s.width-track.width*s.duration/total)).toBeLessThan(1);expect(Math.abs(s.x-track.x-track.width*s.start/total)).toBeLessThan(1);}
  for(const s of segments){const t=s.start+s.duration*.5;await page.locator('#seek').evaluate((n,t)=>{n.value=t;n.dispatchEvent(new Event('input',{bubbles:true}));},t);const line=await page.locator('#playhead').boundingBox(),current=await page.locator('#segments .playing').boundingBox();expect(line.x).toBeGreaterThan(current.x);expect(line.x).toBeLessThan(current.x+current.width);const seek=await page.locator('#seek').boundingBox(),actual=Number(await page.locator('#seek').inputValue());expect(Math.abs(line.x-(seek.x+6+(seek.width-12)*actual/total))).toBeLessThan(1);}
  const target=segments[4],t=target.start+target.duration*.5,seekBox=await page.locator('#seek').boundingBox();await page.mouse.click(track.x+track.width*t/total,seekBox.y+seekBox.height/2);expect(Math.abs(Number(await page.locator('#seek').inputValue())-t)).toBeLessThan(.03);await expect(page.locator('#segments .playing')).toHaveAttribute('data-start',String(target.start));
 }
 await page.screenshot({path:'output/acceptance/motion-timeline-aligned.png'});
 // 长编排只在共用滚动容器内扩展，不再让卡片单独滚动。
 await page.locator('#quickSequence').click();await page.locator('#play').click();const end=Number(await page.locator('#seek').getAttribute('max'));await page.locator('#seek').evaluate((n,t)=>{n.value=t;n.dispatchEvent(new Event('input',{bubbles:true}));},end);await page.locator('#timelineScroll').evaluate(n=>n.scrollLeft=n.scrollWidth);const last=await page.locator('#segments .action').last().boundingBox(),line=await page.locator('#playhead').boundingBox();expect(Math.abs(line.x-(last.x+last.width))).toBeLessThan(1);
});
