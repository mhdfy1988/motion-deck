import {test,expect,_electron as electron} from '@playwright/test';
import {resolve,join} from 'node:path';
import {mkdir,mkdtemp,readFile,rename} from 'node:fs/promises';
import {createRequire} from 'node:module';
const root=resolve('.');
async function profile(){await mkdir(join(root,'output/desktop-tests'),{recursive:true});return mkdtemp(join(root,'output/desktop-tests/directories-'));}
function launch(dataDir,{legacy=false}={}){
 const env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
 const exe=legacy?process.env.MOTIONDECK_LEGACY_EXE:process.env.MOTIONDECK_PACKAGED_EXE;
 return electron.launch({executablePath:exe??createRequire(import.meta.url)('electron'),args:exe?['--smoke-hidden']:[root,'--smoke-hidden'],env,timeout:30000});
}
async function ready(client){const page=await client.firstWindow();await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await expect(page.locator('#status')).toHaveText(/162 动作|已恢复/);await expect(page.locator('#replaceModel')).toHaveValue('mesh2motion');await expect(page.locator('#capturePose')).toBeEnabled();return page;}
async function savePose(page,name){await page.locator('#capturePose').click();await page.locator('#poseName').fill(name);await page.locator('#confirmPoseSave').click();await expect(page.locator('#savePoseDialog')).not.toBeVisible();}
test('目录设置真实桥接：取消保护、搬迁、备份恢复、缓存不删素材与导出默认目录',async()=>{
 const dataDir=await profile();let client=await launch(dataDir);
 try{
  let page=await ready(client);await savePose(page,'目录验收姿势');
  const info=await page.evaluate(()=>motionDeckDesktop.settings());expect(info.personal).toBe(dataDir);expect(info.records).toBeGreaterThan(0);expect(info.migrationNeeded).toBe(false);
  expect(await readFile(join(info.library,'library.sqlite'))).toBeTruthy();
  await page.locator('#desktopSettings').click();await expect(page.locator('.directory-row')).toHaveCount(6);
  await page.screenshot({path:'output/acceptance/motion-desktop-settings.png'});
  await page.getByRole('button',{name:'迁移素材库目录',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();expect((await page.evaluate(()=>motionDeckDesktop.settings())).library).toBe(info.library);
  const destination=join(dataDir+'-assets','迁移目标'),exports=join(dataDir+'-assets','自选导出');await mkdir(destination,{recursive:true});await mkdir(exports,{recursive:true});
  await client.evaluate(({dialog},targets)=>{globalThis.directoryChoices=[...targets];dialog.showOpenDialog=async()=>({canceled:false,filePaths:[globalThis.directoryChoices.shift()]});},[destination,exports]);
  await page.getByRole('button',{name:'迁移素材库目录',exact:true}).click();await page.locator('#motionConfirmDialog .primary').click();await expect(page.locator('#desktopSettingsStatus')).toContainText('迁移完成');
  expect((await page.evaluate(()=>motionDeckDesktop.settings())).library).toBe(destination);expect(await readFile(join(info.library,'library.sqlite'))).toBeTruthy();
  await page.getByRole('button',{name:'更改导出目录',exact:true}).click();await expect(page.locator('#desktopSettingsStatus')).toHaveText('目录已更新');
  await page.locator('#backupLibrary').click();await expect(page.locator('#desktopSettingsStatus')).toContainText('备份完成');const backup=(await page.locator('#desktopSettingsStatus').textContent()).slice('备份完成：'.length);
  await page.locator('#clearDesktopCache').click();await expect(page.locator('#desktopSettingsStatus')).toContainText('素材与设置保留');
  await page.locator('#closeDesktopSettings').click();await savePose(page,'恢复后应消失');
  await page.locator('#desktopSettings').click();await client.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});},backup);
  await page.locator('#restoreLibrary').click();await page.locator('#motionConfirmDialog .primary').click();await expect(page.locator('#desktopSettingsDialog')).not.toBeVisible();await expect(page.locator('#status')).toContainText('已恢复');
  await page.locator('#library-pose').click();await expect(page.locator('#clips')).toContainText('目录验收姿势');await expect(page.locator('#clips')).not.toContainText('恢复后应消失');
  await client.evaluate(({session})=>{globalThis.exportDefault=null;session.defaultSession.once('will-download',(_event,item)=>{globalThis.exportDefault=item.getSaveDialogOptions().defaultPath;item.cancel();});});
  await page.locator('#takePhoto').click();await expect.poll(()=>client.evaluate(()=>globalThis.exportDefault)).toContain(exports);
  expect(await page.evaluate(async()=>{try{await motionDeckDesktop.openDirectory('arbitrary');return false;}catch{return true;}})).toBe(true);
  await client.close();client=await launch(dataDir);page=await ready(client);expect((await page.evaluate(()=>motionDeckDesktop.settings())).exports).toBe(exports);
 }finally{await client.close();}
});
test('真实旧客户端数据库自动迁移一次，原IndexedDB保留且原文件恢复',async()=>{
 test.skip(!process.env.MOTIONDECK_LEGACY_EXE,'必须显式提供保留的旧客户端，不能伪装旧版迁移验收');
 const dataDir=await profile();let client=await launch(dataDir,{legacy:true});
 try{
  let page=await ready(client);await savePose(page,'旧客户端迁移姿势');
  const old=await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('motion-deck.library.v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('images','readonly'),r=tx.objectStore('images').getAll();tx.oncomplete=()=>resolve(r.result.map(record=>record.id));tx.onerror=()=>reject(tx.error);});}finally{db.close();}});
  await client.close();client=await launch(dataDir);page=await ready(client);await page.locator('#library-pose').click();await expect(page.locator('#clips')).toContainText('旧客户端迁移姿势');
  const info=await page.evaluate(()=>motionDeckDesktop.settings());expect(info.migrationNeeded).toBe(false);expect(info.records).toBe(old.length);
  expect(await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('motion-deck.library.v1');r.onsuccess=()=>resolve(r.result);});try{return await new Promise(resolve=>{const tx=db.transaction('images','readonly'),r=tx.objectStore('images').getAll();tx.oncomplete=()=>resolve(r.result.map(record=>record.id));});}finally{db.close();}})).toEqual(old);
  await client.close();client=await launch(dataDir);page=await ready(client);expect((await page.evaluate(()=>motionDeckDesktop.settings())).library).toBe(info.library);
 }finally{await client.close();}
});
test('素材库索引丢失不换空库，设置仍可从完整备份恢复',async()=>{
 const dataDir=await profile();let client=await launch(dataDir);
 try{
  let page=await ready(client);await savePose(page,'损坏恢复姿势');const info=await page.evaluate(()=>motionDeckDesktop.settings()),backup=await page.evaluate(()=>motionDeckDesktop.backup());
  await client.close();await rename(join(info.library,'library.sqlite'),join(info.library,'library.sqlite.retained'));client=await launch(dataDir);page=await client.firstWindow();await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await expect(page.locator('#status')).toContainText('素材库不可用');
  await page.locator('#desktopSettings').click();await expect(page.locator('#desktopSettingsStatus')).toContainText('不新建空库');await expect(page.locator('#backupLibrary')).toBeDisabled();await expect(page.locator('#restoreLibrary')).toBeEnabled();
  await client.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});},backup.directory);await page.locator('#restoreLibrary').click();await page.locator('#motionConfirmDialog .primary').click();await expect(page.locator('#status')).toContainText('已恢复');await page.locator('#library-pose').click();await expect(page.locator('#clips')).toContainText('损坏恢复姿势');
  await expect(page.locator('#capturePose')).toBeEnabled();expect((await page.evaluate(()=>motionDeckDesktop.settings())).recoveryRequired).toBe(null);expect(await readFile(join(info.library,'library.sqlite.retained'))).toBeTruthy();await expect(readFile(join(info.library,'library.sqlite'))).rejects.toThrow();
 }finally{await client.close();}
});
