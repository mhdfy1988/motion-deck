import {test,expect} from '@playwright/test';
import {placeAction} from './drag-source-helper.js';

for(const advanced of [false,true])test(`姿势编辑暂时隐藏，保存和编排保留${advanced?'（高级）':''}`,async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(advanced?'/labs/motion/index.html?tools=1':'/');
 await page.locator('#replaceModel').selectOption('quaternius');await expect(page.locator('#status')).toContainText('99 姿势');
 await expect(page.locator('#editPose')).toBeHidden();await expect(page.locator('#posePanel')).toBeHidden();await expect(page.locator('#capturePose')).toBeVisible();
 await page.locator('#library-pose').click();const pose=page.locator('#clips [data-pose-id]').first();await pose.dblclick();
 await expect(page.locator('body')).not.toHaveClass(/(?:^|\s)pose-editing(?:\s|$)/);await expect(page.locator('#posePanel')).toBeHidden();
 await page.locator('#capturePose').click();await page.locator('#poseName').fill('保留姿势');await page.locator('#confirmPoseSave').click();await expect(page.locator('#savePoseDialog')).not.toBeVisible();
 const saved=page.locator('#clips [data-pose-id]').filter({hasText:'保留姿势'});await expect(saved).toHaveCount(1);await placeAction(page,saved);await expect(page.locator('#segments .pose')).toHaveCount(1);
 expect(errors).toEqual([]);
});
