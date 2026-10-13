import {test,expect} from '@playwright/test';
import {handleConfirmation} from './confirm-helper.js';
import {placeAction} from './drag-source-helper.js';
import {resolve} from 'node:path';
async function seek(page,time){await page.locator('#seek').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},time);}
async function save(page,name){await expect(page.locator('#actionTitle')).toBeHidden();await expect(page.locator('#total')).toBeHidden();await expect(page.locator('#timeRuler')).toBeVisible();await page.locator('#saveAction').click();await page.locator('#actionName').fill(name);await page.locator('#confirmSave').click();await expect(page.locator('#saveActionDialog')).not.toBeVisible();await expect(page.locator('#status')).toContainText('动作已保存');await expect(page.locator('#actionTitle')).toBeHidden();await expect(page.locator('#total')).toBeHidden();}
test('裁剪分割、保存、查看、整体拖入、刷新恢复与模型隔离',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await handleConfirmation(page,true,false);
 await page.goto('/');await page.locator('#replaceModel').selectOption('quaternius');await expect(page.locator('#status')).toContainText('117 动作');
 await placeAction(page,page.locator('#clips [data-clip-name="Idle_Loop"]'));const actions=page.locator('#segments .action');
 await actions.first().click();await seek(page,1);await expect(page.locator('#trimRight')).toBeEnabled();await page.locator('#trimRight').click();await expect(actions.first()).toHaveAttribute('data-source-out','1');await expect(actions.first()).toHaveAttribute('data-duration','1');
 await page.locator('#timelineUndo').click();await expect(actions.first()).toHaveAttribute('data-source-out','2.5');await page.locator('#timelineRedo').click();
 await seek(page,.4);await page.locator('#splitAction').click();await expect(actions).toHaveCount(2);await expect(actions.first()).toHaveAttribute('data-source-out','0.4');await expect(actions.last()).toHaveAttribute('data-source-in','0.4');
 await placeAction(page,page.locator('#clips [data-clip-name="Sword_Attack"]').first());const last=await actions.last().boundingBox();await placeAction(page,page.locator('#transitionSource'),{x:last.x+8,y:last.y+25});await expect(page.locator('#segments .transition')).toHaveCount(1);
 await save(page,'待机接挥剑');await expect(page.locator('#clips [data-custom-id]')).toHaveCount(1);await expect(page.locator('#actionTitle')).toHaveText('待机接挥剑');
 const original=await actions.evaluateAll(nodes=>nodes.map(n=>[n.dataset.key,n.dataset.sourceIn,n.dataset.sourceOut]));await page.locator('#clips [data-custom-id]').click();expect(await actions.evaluateAll(nodes=>nodes.map(n=>[n.dataset.key,n.dataset.sourceIn,n.dataset.sourceOut]))).toEqual(original);
 await page.locator('#play').click();await expect.poll(()=>page.locator('#clock').textContent()).not.toBe('0.00 s');await page.locator('#play').click();
 await placeAction(page,page.locator('#clips [data-custom-id]'));await expect(actions).toHaveCount(4);await expect(actions.last()).toContainText('待机接挥剑');await page.locator('#timelineUndo').click();await expect(actions).toHaveCount(3);
 await page.locator('#newAction').click();await expect(actions).toHaveCount(0);await page.locator('#clips [data-custom-id]').dblclick();await expect(actions).toHaveCount(0);await placeAction(page,page.locator('#clips [data-custom-id]'));await expect(actions).toHaveCount(1);await expect(page.locator('#segments .transition')).toHaveCount(0);
 await save(page,'待机接挥剑');await expect(page.locator('#clips [data-custom-id]')).toHaveCount(1);
 await page.reload();await expect(page.locator('#status')).toContainText('已恢复');await expect(actions).toHaveCount(0);await expect(page.locator('#actionTitle')).toHaveText('未命名动作');await expect(page.locator('#timelineUndo')).toBeDisabled();await expect(page.locator('#saveAction')).toBeDisabled();await expect(page.locator('#clips [data-custom-id]')).toHaveCount(1);await placeAction(page,page.locator('#clips [data-custom-id]'));await expect(actions).toHaveCount(1);await expect(actions.first()).toContainText('待机接挥剑');await page.screenshot({path:'output/acceptance/motion-single-model-custom.png'});
 await page.locator('#modelFiles').setInputFiles(resolve('fixtures/RobotExpressive.glb'));await expect(page.locator('#status')).toContainText('已载入');await page.locator('#library-custom').click();await expect(page.locator('#clips')).toContainText('暂无自定义动作');
 await page.locator('#modelFiles').setInputFiles(['AnimationLibrary_Godot_Standard.gltf','AnimationLibrary_Godot_Standard.bin'].map(n=>resolve('fixtures/quaternius',n)));await expect(page.locator('#status')).toContainText('已载入');await page.locator('#library-custom').click();await expect(page.locator('#clips [data-custom-id]')).toHaveCount(1);expect(errors).toEqual([]);
});
test('两端直接裁剪，取消和撤销恢复真实源范围',async({page})=>{
 await page.goto('/');await page.locator('#replaceModel').selectOption('quaternius');await expect(page.locator('#status')).toContainText('117 动作');await placeAction(page,page.locator('#clips [data-clip-name="Idle_Loop"]'));const action=page.locator('#segments .action');
 async function edge(side,delta,cancel=false){const box=await action.locator(side==='left'?'.resize-left':'.resize-handle:not(.resize-left)').boundingBox(),pps=await page.evaluate(()=>document.getElementById('timelineTrack').clientWidth/Number(document.getElementById('seek').max));await page.mouse.move(box.x+5,box.y+25);await page.mouse.down();await page.mouse.move(box.x+5+delta*pps,box.y+25,{steps:10});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}
 await edge('right',-1);await expect(action).toHaveAttribute('data-source-out','1.5');await expect(action).toHaveAttribute('data-duration','1.5');await edge('left',.5);await expect(action).toHaveAttribute('data-source-in','0.5');await expect(action).toHaveAttribute('data-duration','1');
 await edge('right',-.3,true);await expect(action).toHaveAttribute('data-source-out','1.5');await page.locator('#timelineUndo').click();await expect(action).toHaveAttribute('data-source-in','0');await page.locator('#timelineUndo').click();await expect(action).toHaveAttribute('data-duration','2.5');
});

test('保存失败保留编排和弹窗，不发布空成功；损坏快照显式报错',async({page})=>{
 await page.goto('/');await page.locator('#replaceModel').selectOption('quaternius');await expect(page.locator('#status')).toContainText('117 动作');await placeAction(page,page.locator('#clips [data-clip-name="Idle_Loop"]'));
 await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){IDBObjectStore.prototype.put=put;throw new DOMException('测试存储已满','QuotaExceededError');};});
 await page.locator('#saveAction').click();await page.locator('#actionName').fill('失败不能发布');await page.locator('#confirmSave').click();await expect(page.locator('#error')).toContainText('保存失败');await expect(page.locator('#saveActionDialog')).toBeVisible();await expect(page.locator('#segments .action')).toHaveCount(1);await page.locator('#cancelSave').click();await page.locator('#library-custom').click();await expect(page.locator('#clips')).toContainText('暂无自定义动作');
 await save(page,'可靠保存');await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('motion-deck.library.v1',1);request.onsuccess=()=>resolve(request.result);request.onerror=reject;});await new Promise((resolve,reject)=>{const tx=db.transaction('images','readwrite'),store=tx.objectStore('images'),pointer=store.get('motion-library-last-v1');pointer.onsuccess=()=>{const request=store.get('motion-library-v1:'+pointer.result.modelKey);request.onsuccess=()=>{request.result.data.version=99;store.put(request.result);};};tx.oncomplete=resolve;tx.onerror=reject;});db.close();});
 await page.reload();await expect(page.locator('#error')).toContainText('恢复失败');await expect(page.locator('main')).toBeVisible();await expect(page.locator('#status')).not.toContainText('已恢复');
});

test('保存关联指针失败时，模型与动作记录一并回滚',async({page})=>{
 await page.goto('/');await page.locator('#replaceModel').selectOption('quaternius');await expect(page.locator('#status')).toContainText('117 动作');await placeAction(page,page.locator('#clips [data-clip-name="Idle_Loop"]'));await save(page,'原动作');
 await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(record,...args){if(record.kind==='motion-library-pointer'){IDBObjectStore.prototype.put=put;throw new DOMException('测试关联保存失败','QuotaExceededError');}return put.call(this,record,...args);};});
 await page.locator('#saveAction').click();await page.locator('#actionName').fill('不应保存的新动作');await page.locator('#confirmSave').click();await expect(page.locator('#error')).toContainText('保存失败');await page.locator('#cancelSave').click();await expect(page.locator('#clips [data-custom-id]')).toHaveCount(1);
 await page.reload();await expect(page.locator('#status')).toContainText('已恢复');await expect(page.locator('#clips [data-custom-id]')).toHaveCount(1);await expect(page.locator('#actionTitle')).toHaveText('未命名动作');await expect(page.locator('#segments .action')).toHaveCount(0);
});

test('复用的单素材存取接口仍保持原文件内容与修订语义',async({page})=>{
 await page.goto('/');const result=await page.evaluate(async()=>{const {putImage,getImage}=await import('/motion-store.js');const id='test-single-media';await putImage({id,revision:1,blob:new Blob(['原文件'])});const old=await getImage(id);await putImage({id,revision:2,blob:new Blob(['修改文件'])});const next=await getImage(id);return {old:await old.blob.text(),next:await next.blob.text(),revision:next.revision};});expect(result).toEqual({old:'原文件',next:'修改文件',revision:2});
});
