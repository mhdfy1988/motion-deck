import {test,expect} from '@playwright/test';
import {waitForModel} from './model-ready-helper.js';

test('真实模型加载超过5秒仍等待完整就绪，不删除原数量断言',async({page})=>{
 await page.route('**/fixtures/candidates/m2m-human-base-animations.glb',async route=>{
  // 可控网络延迟只用于证明旧5秒断言会误判，模型解析及存储仍走真实链路。
  await new Promise(resolve=>setTimeout(resolve,6500));await route.continue();
 });
 const start=performance.now();await page.goto('/');
 const ready=await waitForModel(page,{actions:162});
 expect(performance.now()-start).toBeGreaterThan(6500);expect(ready.bones).toBe(66);
 await expect(page.locator('#status')).toContainText('162 动作');await expect(page.locator('#capturePose')).toBeEnabled();
});

test('真实资源失败立即返回加载错误，不等满预算或静默切换模型',async({page})=>{
 await page.route('**/fixtures/candidates/m2m-human-base-animations.glb',route=>route.fulfill({status:503,body:'model unavailable'}));
 await page.goto('/');await expect(waitForModel(page,{actions:162})).rejects.toThrow(/模型加载失败.*模型资源未准备/);
 await expect(page.locator('#error')).toBeVisible();await expect(page.locator('#capturePose')).toBeDisabled();
});

test('永不就绪有明确上限，旧模型或错误动作数不能冒充加载成功',async({page})=>{
 await page.setContent('<div id="error" hidden></div><div id="placeholder" hidden></div><span id="bones">66</span><button id="capturePose"></button><select id="replaceModel"></select><select id="source"><option>旧动作</option></select>');
 await expect(waitForModel(page,{actions:162,timeout:250})).rejects.toThrow(/模型未就绪.*预期162动作/);
});
