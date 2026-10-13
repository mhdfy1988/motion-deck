import {test,expect} from '@playwright/test';
import {handleConfirmation} from './confirm-helper.js';
import {resolve} from 'node:path';
import {placeAction} from './drag-source-helper.js';

test('按来源精确删除旧测试人偶，默认库与外部素材不受影响',async({page})=>{
 await page.goto('/');await page.locator('#replaceModel').selectOption('quaternius');await expect(page.locator('#status')).toContainText('117 动作');
 const oldKey='a'.repeat(64);await page.evaluate(async oldKey=>{const {getImage,putImages}=await import('/motion-store.js'),catalog=await getImage('motion-model-catalog-v1');catalog.data.models.push({key:oldKey,name:'旧姿势人偶',builtinId:'makehuman'});await putImages([catalog,{id:'motion-library-v1:'+oldKey,kind:'motion-library',data:{test:true}},{id:'test-unrelated',blob:new Blob(['保留'])},{id:'motion-library-last-v1',kind:'motion-library-pointer',modelKey:oldKey}]);},oldKey);
 await page.reload();await expect(page.locator('main')).toBeVisible();await expect(page.locator('#status')).toContainText('162 动作');await expect(page.locator('#replaceModel optgroup[label="历史模型"]')).toHaveCount(0);
 const result=await page.evaluate(async oldKey=>{const {getImage}=await import('/motion-store.js');return {old:await getImage('motion-library-v1:'+oldKey),pointer:await getImage('motion-library-last-v1'),catalog:(await getImage('motion-model-catalog-v1')).data,other:await (await getImage('test-unrelated')).blob.text()};},oldKey);expect(result.old).toBeUndefined();expect(result.catalog.models.map(model=>model.builtinId).sort()).toEqual(['mesh2motion','quaternius']);expect(result.pointer.modelKey).toBe(result.catalog.models.find(model=>model.builtinId==='mesh2motion').key);expect(result.other).toBe('保留');
 await page.locator('#replaceModel').selectOption('quaternius');await expect(page.locator('#status')).toContainText('99 姿势');
});

test('默认人偶合并89动作99姿势，混排过渡与保存恢复',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 const menu=page.locator('#replaceModel');await expect(menu.locator('optgroup[label="内置模型"] option')).toHaveCount(2);await expect(menu.locator('option[value=""]')).toHaveCount(0);
 await menu.selectOption('quaternius');await expect(page.locator('#status')).toContainText('53 骨骼 · 117 动作 · 99 姿势');
 await placeAction(page,page.locator('#clips [data-clip-name="Idle_Loop"]'));
 await page.locator('#library-pose').click();const poses=page.locator('#clips [data-pose-id]');await expect(poses).toHaveCount(99);await poses.nth(1).click();await expect(page.locator('#currentClip')).toHaveText('Fight 01');await placeAction(page,poses.nth(1));
 const second=await page.locator('#segments .pose').boundingBox();await placeAction(page,page.locator('#transitionSource'),{x:second.x+8,y:second.y+30});await expect(page.locator('#segments .transition')).toHaveCount(1);
 await page.locator('#saveAction').click();await page.locator('#actionName').fill('待机接战斗姿势');await page.locator('#confirmSave').click();await expect(page.locator('#saveActionDialog')).not.toBeVisible();
 const chooser=page.waitForEvent('filechooser');await menu.selectOption('import');await handleConfirmation(page,false);await (await chooser).setFiles(resolve('fixtures/RobotExpressive.glb'));await expect(menu).toHaveValue('quaternius');await expect(page.locator('#segments .pose')).toHaveCount(1);
 await page.reload();await expect(page.locator('#status')).toContainText('已恢复');await expect(page.locator('#segments button')).toHaveCount(0);await placeAction(page,page.locator('#clips [data-custom-id]'));await expect(page.locator('#segments .action')).toHaveCount(1);await expect(page.locator('#segments .pose')).toHaveCount(0);await page.locator('#library-pose').click();await expect(poses).toHaveCount(99);
 await page.locator('#play').click();await expect.poll(()=>page.locator('#clock').textContent()).not.toBe('0.00 s');await page.locator('#play').click();
 for(const width of [1920,1280]){await page.setViewportSize({width,height:600});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollHeight-innerHeight)).toBeLessThanOrEqual(1);await page.screenshot({path:`output/acceptance/motion-model-catalog-${width}.png`});}expect(errors).toEqual([]);
});

test('菜单导入外部模型、重命名取消和保存、切换不必重复选文件',async({page})=>{
 await page.goto('/');const menu=page.locator('#replaceModel'),chooser=page.waitForEvent('filechooser');await menu.selectOption('import');await (await chooser).setFiles(resolve('fixtures/RobotExpressive.glb'));await expect(page.locator('#status')).toContainText('已载入');
 const key=await menu.inputValue();await expect(menu.locator('optgroup[label="已导入模型"] option')).toHaveCount(1);await expect(page.locator('#renameModel')).toBeVisible();
 for(const close of ['cancelModelRename','closeModelRename']){await page.locator('#renameModel').click();await page.locator('#modelDisplayName').fill('');await page.locator('#'+close).click();await expect(page.locator('#renameModelDialog')).not.toBeVisible();await expect(page.locator('#modelName')).toHaveText('RobotExpressive.glb');}
 await page.locator('#renameModel').click();await page.locator('#modelDisplayName').fill('我的机器人');await page.locator('#renameModelForm button[type="submit"]').click();await expect(page.locator('#renameModelDialog')).not.toBeVisible();
 await menu.selectOption('quaternius');await expect(page.locator('#modelName')).toHaveText('Quaternius');await expect(page.locator('#renameModel')).toBeHidden();await menu.selectOption(key);await expect(page.locator('#modelName')).toHaveText('我的机器人');await page.reload();await expect(page.locator('#status')).toContainText('已载入');await expect(page.locator('#modelName')).toHaveText('我的机器人');await expect(menu).toHaveValue(key);
});

test('资源缺失或模型目录写入失败时，原模型、编排和持久库均保留',async({page})=>{
 await page.goto('/labs/motion/index.html?tools=1');await page.locator('#humanDemo').click();await expect(page.locator('#status')).toContainText('117 动作');await placeAction(page,page.locator('#clips [data-clip-name="Idle_Loop"]'));
 const before=await page.evaluate(async()=>{const {getImage}=await import('/motion-store.js');return {catalog:(await getImage('motion-model-catalog-v1')).data,pointer:await getImage('motion-library-last-v1')};});
 await page.route('**/fixtures/poses/MakeHumanPoses.glb',route=>route.fulfill({status:404,body:'missing'}));await handleConfirmation(page);await page.locator('#humanDemo').click();await expect(page.locator('#error')).toContainText('姿势未准备');await expect(page.locator('#replaceModel')).toHaveValue('quaternius');await expect(page.locator('#segments .action')).toHaveCount(1);await page.unroute('**/fixtures/poses/MakeHumanPoses.glb');
 await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(record,...args){if(record.kind==='motion-model-catalog'){IDBObjectStore.prototype.put=put;throw new DOMException('测试目录失败','QuotaExceededError');}return put.call(this,record,...args);};});
 await handleConfirmation(page);await page.locator('#humanDemo').click();await expect(page.locator('#error')).toContainText('原模型保留');await expect(page.locator('#replaceModel')).toHaveValue('quaternius');await expect(page.locator('#segments .action')).toHaveCount(1);
 const records=await page.evaluate(async()=>{const {getImage}=await import('/motion-store.js');return {catalog:(await getImage('motion-model-catalog-v1')).data,pointer:await getImage('motion-library-last-v1')};});expect(records).toEqual(before);expect(records.pointer.modelKey).toBe(records.catalog.models.find(model=>model.builtinId==='quaternius').key);
});
