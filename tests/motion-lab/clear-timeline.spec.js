import {test,expect} from '@playwright/test';
import {handleConfirmation} from './confirm-helper.js';
import {placeAction} from './drag-source-helper.js';
test('清空位于右侧编辑区，取消保护、清空和撤销均不删除保存动作',async({page})=>{
 await page.goto('/');await page.locator('#welcomeDemo').click();await expect(page.locator('#status')).toContainText('已载入');await expect(page.locator('#actionTitle')).toHaveText('未命名动作');const clear=page.locator('#newAction');await expect(clear).toHaveText('清空');await expect(clear).toBeDisabled();
 expect(await clear.evaluate(el=>el.previousElementSibling.id)).toBe('timelineRemove');await placeAction(page,page.locator('#clips [data-clip-name="Idle_Loop"]'));await page.locator('#saveAction').click();await page.locator('#actionName').fill('保留动作');await page.locator('#confirmSave').click();await expect(page.locator('#saveActionDialog')).not.toBeVisible();
 await handleConfirmation(page,false);await clear.click();await expect(page.locator('#segments .action')).toHaveCount(1);await expect(page.locator('#actionTitle')).toHaveText('保留动作');await handleConfirmation(page);await clear.click();await expect(page.locator('#segments .action')).toHaveCount(0);await expect(page.locator('#actionTitle')).toHaveText('未命名动作');await expect(page.locator('#clips [data-custom-id]')).toHaveCount(1);await expect(clear).toBeDisabled();
 await page.locator('#timelineUndo').click();await expect(page.locator('#segments .action')).toHaveCount(1);await expect(page.locator('#actionTitle')).toHaveText('保留动作');await page.locator('#timelineRedo').click();await expect(page.locator('#segments .action')).toHaveCount(0);
 for(const size of [{width:1920,height:900},{width:1280,height:600}]){await page.setViewportSize(size);await expect(clear).toBeHidden();await page.screenshot({path:`output/acceptance/motion-clear-${size.width}.png`});}
});
