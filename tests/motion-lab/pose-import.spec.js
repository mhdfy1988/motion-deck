import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {placeAction} from './drag-source-helper.js';
const pack=resolve('fixtures/poses/MakeHumanPoses.glb');
test('真实99姿势GLB：同骨架批量入库、预览拖放、保存恢复',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('#modelFiles').setInputFiles(pack);await expect(page.locator('#status')).toContainText('65 骨骼');
 await page.locator('#library-pose').click();await expect(page.locator('#appendClips')).toHaveText('导入姿势');const chooser=page.waitForEvent('filechooser');await page.locator('#appendClips').click();await (await chooser).setFiles(pack);
 await expect(page.locator('#status')).toContainText('已导入 99');await expect(page.locator('#clips [data-pose-id]')).toHaveCount(99);await page.locator('#clips [data-pose-id]').filter({hasText:/Fight 01姿势$/}).first().click();await expect(page.locator('#currentClip')).toContainText('Fight 01');
 await placeAction(page,page.locator('#clips [data-pose-id]').filter({hasText:/Fight 01姿势$/}).first());await expect(page.locator('#segments .pose')).toHaveCount(1);
 await page.locator('#saveAction').click();await page.locator('#actionName').fill('战斗姿势');await page.locator('#confirmSave').click();await expect(page.locator('#saveActionDialog')).not.toBeVisible();await page.reload();await expect(page.locator('#status')).toContainText('已恢复');await page.locator('#library-pose').click();await expect(page.locator('#clips [data-pose-id]')).toHaveCount(99);await expect(page.locator('#segments button')).toHaveCount(0);
 await page.locator('#clips [data-pose-id]').filter({hasText:/Fight 01姿势$/}).first().click();await page.screenshot({path:'output/acceptance/motion-external-poses.png'});expect(errors).toEqual([]);
});
test('姿势入口拒绝连续动作及不兼容骨架，不修改已有库',async({page})=>{
 await page.goto('/');await page.locator('#replaceModel').selectOption('quaternius');await expect(page.locator('#status')).toContainText('117 动作');await page.locator('#library-pose').click();
 await page.locator('#poseFiles').setInputFiles(pack);await expect(page.locator('#error')).toContainText('骨骼数量不同');await expect(page.locator('#clips [data-pose-id]')).toHaveCount(99);
 await page.locator('#poseFiles').setInputFiles(['AnimationLibrary_Godot_Standard.gltf','AnimationLibrary_Godot_Standard.bin'].map(n=>resolve('fixtures/quaternius',n)));await expect(page.locator('#error')).toContainText('连续动作');await expect(page.locator('#clips [data-pose-id]')).toHaveCount(99);await expect(page.locator('#modelName')).toContainText('Quaternius');
});
