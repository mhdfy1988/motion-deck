import {test,expect} from '@playwright/test';
test('进度条、播放线与片段共享时间比例',async({page})=>{
 await page.goto('/labs/motion/index.html?tools=1');await page.locator('#humanDemo').click();await expect(page.locator('#status')).toContainText('已载入');await page.locator('#quickSequence').click();await page.locator('#play').click();
 for(const viewport of [{width:1920,height:900},{width:1280,height:720}]){
  await page.setViewportSize(viewport);const track=await page.locator('#timelineTrack').boundingBox(),segments=await page.locator('#segments button').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,width:n.getBoundingClientRect().width,start:Number(n.dataset.start),duration:Number(n.dataset.duration)}))),total=Number(await page.locator('#seek').getAttribute('max'));
  for(const s of segments){expect(Math.abs(s.width-track.width*s.duration/total)).toBeLessThan(1);expect(Math.abs(s.x-track.x-track.width*s.start/total)).toBeLessThan(1);}
  for(const s of segments){const t=s.start+s.duration*.5;await page.locator('#seek').evaluate((n,t)=>{n.value=t;n.dispatchEvent(new Event('input',{bubbles:true}));},t);const line=await page.locator('#playhead').boundingBox(),current=await page.locator('#segments .playing').boundingBox();expect(line.x).toBeGreaterThan(current.x);expect(line.x).toBeLessThan(current.x+current.width);const seek=await page.locator('#seek').boundingBox(),actual=Number(await page.locator('#seek').inputValue());expect(Math.abs(line.x-(seek.x+6+(seek.width-12)*actual/total))).toBeLessThan(1);}
  const target=segments[4],t=target.start+target.duration*.5,seekBox=await page.locator('#seek').boundingBox();await page.mouse.click(track.x+track.width*t/total,seekBox.y+seekBox.height/2);expect(Math.abs(Number(await page.locator('#seek').inputValue())-t)).toBeLessThan(.03);await expect(page.locator('#segments .playing')).toHaveAttribute('data-start',String(target.start));
 }
 await page.screenshot({path:'output/acceptance/motion-timeline-aligned.png'});
 // 长编排只在共用滚动容器内扩展，不再让卡片单独滚动。
 await page.locator('#quickSequence').click();await page.locator('#play').click();const end=Number(await page.locator('#seek').getAttribute('max'));await page.locator('#seek').evaluate((n,t)=>{n.value=t;n.dispatchEvent(new Event('input',{bubbles:true}));},end);await page.locator('#timelineScroll').evaluate(n=>n.scrollLeft=n.scrollWidth);const last=await page.locator('#segments .action').last().boundingBox(),line=await page.locator('#playhead').boundingBox();expect(Math.abs(line.x-(last.x+last.width))).toBeLessThan(1);
});
