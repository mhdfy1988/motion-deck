import {test,expect} from '@playwright/test';
import {placeAction} from './drag-source-helper.js';

test('标题栏品牌清晰且精简，模型与状态不挤压溢出',async({page})=>{
 await page.goto('/');await expect(page.locator('#status')).toContainText('162 动作');
 await expect(page.locator('.brand')).toHaveText('MotionDeck');await expect(page.locator('.brand-mark svg')).toHaveClass(/lucide-film/);
 await expect(page.locator('.top strong,.top .divider,.top .badge')).toHaveCount(0);
 for(const size of [{width:1920,height:900},{width:1280,height:600},{width:800,height:600},{width:390,height:844}]){
  await page.setViewportSize(size);const header=await page.locator('.top').boundingBox(),menu=await page.locator('#replaceModel').boundingBox(),brand=await page.locator('.brand').boundingBox(),status=await page.locator('#status').boundingBox();
  expect(menu.x).toBeGreaterThan(brand.x+brand.width);expect(menu.x+menu.width).toBeLessThanOrEqual(status.x);expect(status.x+status.width).toBeLessThanOrEqual(header.width);
  if(size.width===1920)await page.screenshot({path:'output/acceptance/motion-titlebar.png'});
 }
});
test('MotionDeck 独立入口和存储，不碰旧动作工坊数据库',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/');await expect(page).toHaveTitle('MotionDeck · 3D 动作编排');await expect(page.locator('.brand')).toHaveText('MotionDeck');
 await page.evaluate(async()=>{await new Promise((resolve,reject)=>{const req=indexedDB.open('action-forge.workflow-media.v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('images',{keyPath:'id'});req.onerror=reject;req.onsuccess=()=>{const db=req.result,tx=db.transaction('images','readwrite');tx.objectStore('images').put({id:'old-workflow-sentinel',value:'保留'});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=reject;};});});
 await page.locator('#replaceModel').selectOption('quaternius');await expect(page.locator('#status')).toContainText('117 动作');await placeAction(page,page.locator('#clips [data-clip-index]').first());await page.locator('#saveAction').click();await page.locator('#actionName').fill('独立库动作');await page.locator('#confirmSave').click();await expect(page.locator('#status')).toContainText('动作已保存');
 const result=await page.evaluate(async()=>{const databases=await indexedDB.databases();const old=await new Promise((resolve,reject)=>{const req=indexedDB.open('action-forge.workflow-media.v1');req.onerror=reject;req.onsuccess=()=>{const db=req.result,tx=db.transaction('images'),get=tx.objectStore('images').getAll();tx.oncomplete=()=>{db.close();resolve(get.result);};tx.onerror=reject;};});const {getImage}=await import('/motion-store.js');return {names:databases.map(db=>db.name),old,pointer:await getImage('motion-library-last-v1')};});
 expect(result.names).toContain('motion-deck.library.v1');expect(result.old).toEqual([{id:'old-workflow-sentinel',value:'保留'}]);expect(result.pointer.modelKey).toMatch(/^[a-f0-9]{64}$/);await page.screenshot({path:'output/acceptance/motion-deck-standalone.png'});expect(errors).toEqual([]);
});
