// 验收直接操作时间轴，不通过已移除的右栏数值字段。
export async function resizeSegment(page,segment,duration){
 await segment.scrollIntoViewIfNeeded();const old=Number(await segment.getAttribute('data-duration'));
 const handle=await segment.locator('.resize-handle:not(.resize-left)').boundingBox();
 const pps=await page.evaluate(()=>document.getElementById('timelineTrack').clientWidth/Number(document.getElementById('seek').max));
 await page.keyboard.down('Alt');await page.mouse.move(handle.x+handle.width/2,handle.y+25);await page.mouse.down();
 await page.mouse.move(handle.x+handle.width/2+(duration-old)*pps,handle.y+25,{steps:12});await page.mouse.up();await page.keyboard.up('Alt');
}
