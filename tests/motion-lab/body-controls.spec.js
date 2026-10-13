import {test,expect} from '@playwright/test';
test('全身关节选择与移动工具真实拖动',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/labs/motion/index.html?tools=1');await page.locator('#humanDemo').click();await expect(page.locator('#status')).toContainText('已载入');
 await page.locator('#posePanel > summary').click();await page.locator('#resetPose').click();
 await expect(page.locator('.body-handle')).toHaveCount(15);
 await page.getByRole('button',{name:'调整头',exact:true}).click();await expect(page.locator('#body-rotate')).toHaveClass(/active/);await expect(page.locator('#body-translate')).toBeDisabled();
 await page.screenshot({path:'output/acceptance/motion-body-rotation.png'});
 const head=await page.getByRole('button',{name:'调整头',exact:true}).boundingBox(),cx=head.x+head.width/2,cy=head.y+head.height/2;
 const angles=()=>page.locator('#rx,#ry,#rz').evaluateAll(nodes=>nodes.map(n=>n.value));const initial=await angles();
 await page.mouse.move(cx+68,cy-20);await page.mouse.down();await page.mouse.move(cx+60,cy+35,{steps:12});expect(await angles()).not.toEqual(initial);
 await page.keyboard.press('Escape');await page.mouse.up();expect(await angles()).toEqual(initial);
 await page.locator('#bodyPart').selectOption({label:'整个人偶'});await expect(page.locator('#body-translate')).toBeEnabled();
 await page.screenshot({path:'output/acceptance/motion-body-translation.png'});
 const hand=page.getByRole('button',{name:'拖动右手',exact:true}),before=await hand.boundingBox();
 await page.mouse.move(737,534);await page.mouse.down();await page.mouse.move(785,550,{steps:12});expect((await hand.boundingBox()).x).toBeGreaterThan(before.x+15);await page.mouse.up();
 await page.locator('#undoDrag').click();await expect.poll(async()=>(await hand.boundingBox()).x).toBeCloseTo(before.x,0);
 expect(errors).toEqual([]);
});
