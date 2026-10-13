import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
test('Mesh2Motion动画文件自带蒙皮，可作独立模型；两包不能直接混合',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await page.locator('#modelFiles').setInputFiles(resolve('fixtures/candidates/m2m-human-base-animations.glb'));await expect(page.locator('#status')).toContainText('66 骨骼 · 162 动作');await expect(page.locator('#clips [data-clip-index]')).toHaveCount(162);
 await page.locator('#clips [data-clip-name="Walk"]').click();await page.locator('#play').click();await expect.poll(()=>page.locator('#clock').textContent()).not.toBe('0.00 s');await page.locator('#play').click();await page.screenshot({path:'output/acceptance/motion-mesh2motion-base.png'});
 await page.locator('#animationFiles').setInputFiles(resolve('fixtures/candidates/m2m-human-addon-animations.glb'));await expect(page.locator('#error')).toContainText('初始骨骼变换不同');await expect(page.locator('#clips [data-clip-index]')).toHaveCount(162);
 await page.locator('#modelFiles').setInputFiles(resolve('fixtures/candidates/m2m-human-addon-animations.glb'));await expect(page.locator('#status')).toContainText('66 骨骼 · 75 动作');await page.locator('#clips [data-clip-index]').first().click();await page.locator('#play').click();await expect.poll(()=>page.locator('#clock').textContent()).not.toBe('0.00 s');await page.locator('#play').click();await page.screenshot({path:'output/acceptance/motion-mesh2motion-addon.png'});expect(errors).toEqual([]);
});
