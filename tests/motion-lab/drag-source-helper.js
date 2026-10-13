export async function placeAction(page,source=page.locator('#addAction'),point,beforeDrop){
 await source.scrollIntoViewIfNeeded();if(!point)await page.locator('#timelineScroll').evaluate(el=>{el.scrollLeft=el.scrollWidth;});
 const origin=await source.boundingBox(),bounds=await page.locator('#timelineScroll').boundingBox(),area=await page.locator('#segments').boundingBox();
 const target=point??{x:bounds.x+bounds.width-8,y:area.y+area.height/2};
 await page.mouse.move(origin.x+origin.width/2,origin.y+origin.height/2);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:16});if(beforeDrop)await beforeDrop();await page.mouse.up();
}
