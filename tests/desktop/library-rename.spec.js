import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {waitForModel} from '../motion-lab/model-ready-helper.js';
import {placeAction} from '../motion-lab/drag-source-helper.js';
const require=createRequire(import.meta.url);
test('真实客户端重命名自定义姿势/动作，SQLite保存后重启保留ID与新名称',async()=>{
 const root=resolve('.');await mkdir(join(root,'output/library-rename-acceptance'),{recursive:true});const dataDir=await mkdtemp(join(root,'output/library-rename-acceptance/personal-')),exe=process.env.MOTIONDECK_PACKAGED_EXE??require('electron');
 const env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>electron.launch({executablePath:exe,args:process.env.MOTIONDECK_PACKAGED_EXE?['--smoke-hidden']:[root,'--smoke-hidden'],env});let client=await launch();
 try{
  let page=await client.firstWindow();await waitForModel(page,{actions:162});
  await page.locator('#capturePose').click();await page.locator('#poseName').fill('客户端旧姿势');await page.locator('#confirmPoseSave').click();await expect(page.locator('#savePoseDialog')).not.toBeVisible();const pose=page.locator('#clips [data-pose-id]').filter({hasText:'客户端旧姿势'}),poseId=await pose.getAttribute('data-pose-id');
  await pose.focus();await pose.press('F2');await page.locator('#libraryRenameName').fill('客户端新姿势');await page.locator('#confirmLibraryRename').click();await expect(page.locator('#libraryRenameDialog')).not.toBeVisible();await expect(page.locator('#clips [data-pose-id="'+poseId+'"]')).toContainText('客户端新姿势');
  await page.locator('#library-actions').click();await placeAction(page,page.locator('#clips [data-clip-index]').first());await page.locator('#saveAction').click();await page.locator('#actionName').fill('客户端旧动作');await page.locator('#confirmSave').click();await expect(page.locator('#saveActionDialog')).not.toBeVisible();const action=page.locator('#clips [data-custom-id]'),actionId=await action.getAttribute('data-custom-id');await action.focus();await action.press('F2');await page.locator('#libraryRenameName').fill('客户端新动作');await page.locator('#confirmLibraryRename').click();await expect(page.locator('#libraryRenameDialog')).not.toBeVisible();await expect(page.locator('#actionTitle')).toHaveText('客户端新动作');await expect(action.locator('..').locator('.library-rename svg')).toHaveCount(1);
  await page.screenshot({path:'output/library-rename-acceptance/client.png'});await client.close();client=await launch();page=await client.firstWindow();await waitForModel(page,{actions:162});await expect(page.locator('#clips [data-custom-id="'+actionId+'"]')).toContainText('客户端新动作');await page.locator('#library-pose').click();await expect(page.locator('#clips [data-pose-id="'+poseId+'"]')).toContainText('客户端新姿势');
 }finally{await client.close();}
});
