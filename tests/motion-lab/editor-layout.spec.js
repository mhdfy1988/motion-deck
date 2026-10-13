import {test,expect} from '@playwright/test';
test('图标工具栏与独立姿势编辑入口，裁剪默认收起',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/labs/motion/index.html?tools=1');
 for(const [id,label] of [['timelineUndo','撤销'],['timelineRedo','重做'],['timelineAll','全选'],['timelineNone','全不选'],['timelineRemove','删除选中']]){const button=page.locator('#'+id);await expect(button).toHaveAttribute('aria-label',label);await expect(button).toHaveAttribute('title',new RegExp(label));if(id==='timelineAll'||id==='timelineNone'){await expect(button).toHaveText(label);await expect(button.locator('svg')).toHaveCount(0);}else{await expect(button.locator('svg').first()).toBeVisible();await expect(button).toHaveText('');}}
 await expect(page.locator('.segment-settings')).toHaveCount(0);await expect(page.locator('#sourceTrim')).not.toHaveAttribute('open','');await expect(page.locator('#trimIn')).toBeHidden();
 await page.locator('#humanDemo').click();await expect(page.locator('#status')).toContainText('已载入');await page.locator('#sourceTrim > summary').click();await expect(page.locator('#trimIn')).toBeVisible();await page.locator('#sourceTrim > summary').click();
 await page.locator('#clips [data-clip-name="Idle_Loop"]').click();await page.locator('#posePanel > summary').click();await expect(page.locator('#sourcePanel')).toBeHidden();await expect(page.locator('.body-handles')).toBeVisible();await expect(page.locator('#posePanel .mode-label')).toHaveText('退出编辑');
 await page.setViewportSize({width:1280,height:720});await page.screenshot({path:'output/acceptance/motion-pose-mode-layout.png'});
 await page.locator('#posePanel > summary').click();await expect(page.locator('#sourcePanel')).toBeVisible();await expect(page.locator('.body-handles')).toBeHidden();await page.screenshot({path:'output/acceptance/motion-clean-editor.png'});expect(errors).toEqual([]);
});
