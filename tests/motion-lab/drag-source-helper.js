export async function placeAction(page,source=page.locator('#addAction'),point,beforeDrop){
 await source.scrollIntoViewIfNeeded();if(!point)await page.locator('#timelineScroll').evaluate(el=>{el.scrollLeft=el.scrollWidth;});
 const [origin,bounds,area]=await Promise.all([source.boundingBox(),page.locator('#timelineScroll').boundingBox(),page.locator('#segments').boundingBox()]);
 const target=point??{x:bounds.x+bounds.width-8,y:area.y+area.height/2};
 // 外部拖放按位移阈值启动并按最终落点提交；保留中间移动，不人为串行发16轮协议请求。
 await page.mouse.move(origin.x+origin.width/2,origin.y+origin.height/2);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:4});if(beforeDrop)await beforeDrop();await page.mouse.up();
}
