import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
test('动作与姿势双页签，动作内分三组，第三方导入持久化恢复',async({page})=>{
 await page.goto('/');await page.locator('#welcomeDemo').click();await expect(page.locator('#status')).toContainText('已载入');
 await expect(page.locator('.library-tabs button')).toHaveCount(2);await expect(page.locator('.library-group')).toHaveCount(3);await expect(page.locator('#clips button:visible')).toHaveCount(117);
 await expect(page.locator('.top #replaceModel')).toBeVisible();await expect(page.locator('.section-head #appendClips')).toBeVisible();await expect(page.locator('.view-head #replaceModel, .view-head #appendClips')).toHaveCount(0);
 const modelChooser=page.waitForEvent('filechooser');await page.locator('#replaceModel').selectOption('import');expect((await modelChooser).isMultiple()).toBe(true);
 const actionChooser=page.waitForEvent('filechooser');await page.locator('#appendClips').click();expect((await actionChooser).isMultiple()).toBe(true);
 await page.screenshot({path:'output/acceptance/motion-toolbar-placement.png'});
 await page.locator('#library-custom').click();await expect(page.locator('#clips')).toContainText('暂无自定义动作');
 await page.locator('#animationFiles').setInputFiles(['AnimationLibrary_Godot_Standard.gltf','AnimationLibrary_Godot_Standard.bin'].map(n=>resolve('fixtures/quaternius',n)));await expect(page.locator('#status')).toContainText('已追加 46');
 await expect(page.locator('#library-actions')).toHaveAttribute('aria-selected','true');await expect(page.locator('#clips button:visible')).toHaveCount(46);await expect(page.locator('#clipCount')).toHaveText('135');await expect(page.locator('#library-thirdparty')).toContainText('46');
 await page.reload();await expect(page.locator('#status')).toContainText('已恢复');await page.locator('#library-actions').click();await page.locator('#library-thirdparty').click();await expect(page.locator('#clips button:visible')).toHaveCount(46);
 await page.locator('#modelFiles').setInputFiles(resolve('fixtures/RobotExpressive.glb'));await expect(page.locator('#status')).toContainText('已载入');await page.locator('#library-custom').click();await expect(page.locator('#clips')).toContainText('暂无自定义动作');
});
