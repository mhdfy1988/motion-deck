import {test,expect} from '@playwright/test';
import {handleConfirmation} from './confirm-helper.js';
import {placeAction} from './drag-source-helper.js';
test('两项内置来源：白模动作与姿势独立保存，切换取消保护及刷新恢复',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');const menu=page.locator('#replaceModel');
 await expect(menu.locator('optgroup[label="内置模型"] option')).toHaveText(['Quaternius','Mesh2Motion']);
 await menu.selectOption('mesh2motion');await expect(page.locator('#status')).toContainText('66 骨骼 · 162 动作');await expect(menu).toHaveValue('mesh2motion');await expect(page.locator('#modelName')).toHaveText('Mesh2Motion');await expect(page.locator('#renameModel')).toBeHidden();
 await placeAction(page,page.locator('#clips [data-clip-index]').first());
 await handleConfirmation(page,false);await menu.selectOption('quaternius');await expect(menu).toHaveValue('mesh2motion');await expect(page.locator('#segments .action')).toHaveCount(1);
 await page.locator('#capturePose').click();await page.locator('#poseName').fill('白模姿势');await page.locator('#confirmPoseSave').click();await expect(page.locator('#status')).toContainText('姿势已保存');await expect(page.locator('#clips [data-pose-id]')).toHaveCount(17);
 await page.locator('#saveAction').click();await page.locator('#actionName').fill('白模动作');await page.locator('#confirmSave').click();await expect(page.locator('#status')).toContainText('动作已保存');
 await handleConfirmation(page);await menu.selectOption('quaternius');await expect(page.locator('#status')).toContainText('53 骨骼 · 117 动作 · 99 姿势');await expect(menu).toHaveValue('quaternius');await page.locator('#library-pose').click();await expect(page.locator('#clips [data-pose-id]')).toHaveCount(99);await expect(page.locator('#clips')).not.toContainText('白模姿势');await page.locator('#library-actions').click();await page.locator('#library-custom').click();await expect(page.locator('#clips [data-custom-id]')).toHaveCount(0);
 await menu.selectOption('mesh2motion');await expect(page.locator('#status')).toContainText('162 动作');await page.locator('#library-pose').click();await expect(page.locator('#clips [data-pose-id]').filter({hasText:'白模姿势'})).toHaveText('白模姿势姿势');await page.locator('#library-actions').click();await page.locator('#library-custom').click();await expect(page.locator('#clips [data-custom-id]')).toHaveCount(1);await placeAction(page,page.locator('#clips [data-custom-id]'));await expect(page.locator('#segments .action')).toHaveCount(1);
 await page.reload();await expect(page.locator('#status')).toContainText('已恢复');await expect(menu).toHaveValue('mesh2motion');await expect(page.locator('#actionTitle')).toHaveText('未命名动作');await expect(page.locator('#segments button')).toHaveCount(0);await expect(menu.locator('optgroup[label="已导入模型"]')).toHaveCount(0);
 await page.locator('#play').click();await expect.poll(()=>page.locator('#clock').textContent()).not.toBe('0.00 s');await page.locator('#play').click();await menu.focus();await page.screenshot({path:'output/acceptance/motion-two-builtins.png'});expect(errors).toEqual([]);
});
