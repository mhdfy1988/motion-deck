import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {waitForModel} from '../motion-lab/model-ready-helper.js';
test('真实包动作和姿势复制粘贴，独立SQLite资料重开保留副本',async()=>{
 const root=resolve('.');await mkdir(join(root,'output/library-clipboard-acceptance'),{recursive:true});const data=await mkdtemp(join(root,'output/library-clipboard-acceptance/personal-'));
 const env={...process.env,MOTIONDECK_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
 if(!process.env.MOTIONDECK_PACKAGED_EXE)throw Error('此验收必须指定真实包');
 const launch=()=>electron.launch({executablePath:process.env.MOTIONDECK_PACKAGED_EXE,args:['--smoke-hidden'],env});let client=await launch();
 try{
  let page=await client.firstWindow();await waitForModel(page,{actions:162});const source=page.locator('#clips [data-clip-index]').first();await source.focus();await source.press('Control+c');await source.press('Control+v');const action=page.locator('#clips [data-custom-id]');await expect(action).toHaveCount(1);const actionId=await action.getAttribute('data-custom-id');await action.press('Control+c');await action.press('Control+v');await expect(action).toHaveCount(2);
  await page.locator('#library-pose').click();const builtin=page.locator('#clips [data-pose-id^="builtin:"]').first();await builtin.click();await expect(builtin).toBeFocused();await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');const pose=page.locator('#clips [data-pose-id]:not([data-pose-id^="builtin:"])');await expect(pose).toHaveCount(1);const poseId=await pose.getAttribute('data-pose-id');await pose.click();await expect(pose).toBeFocused();await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');await expect(pose).toHaveCount(2);await page.screenshot({path:'output/library-clipboard-acceptance/client.png'});
  await client.close();client=await launch();page=await client.firstWindow();await waitForModel(page,{actions:162});await expect(page.locator('#clips [data-custom-id]')).toHaveCount(2);await expect(page.locator('#clips [data-custom-id="'+actionId+'"]')).toHaveCount(1);await page.locator('#library-pose').click();await expect(page.locator('#clips [data-pose-id]:not([data-pose-id^="builtin:"])')).toHaveCount(2);await expect(page.locator('#clips [data-pose-id="'+poseId+'"]')).toHaveCount(1);
 }finally{await client.close();}
});
