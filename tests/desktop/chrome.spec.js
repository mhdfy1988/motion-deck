import {test,expect,_electron as electron} from '@playwright/test';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';

test('合并深色标题栏保留系统按钮安全区，更新入口仅在设置中',async()=>{
 const root=resolve('.');await mkdir(join(root,'output/desktop-tests'),{recursive:true});
 const dataDir=await mkdtemp(join(root,'output/desktop-tests/chrome-'));
 const executablePath=process.env.MOTIONDECK_PACKAGED_EXE??createRequire(import.meta.url)('electron');
 const env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
 const client=await electron.launch({executablePath,args:process.env.MOTIONDECK_PACKAGED_EXE?['--smoke-hidden']:[root,'--smoke-hidden'],env});
 try{
  const page=await client.firstWindow();await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
  await expect(page.locator('#capturePose')).toBeEnabled();
  await expect(page.locator('body')).toHaveClass(/desktop-client/);
  await expect(page.locator('body')).toHaveCSS('font-family','"Segoe UI", "Microsoft YaHei UI", sans-serif');
  await expect(page.locator('#librarySearch')).toHaveCSS('font-size','13px');
  await expect(page.locator('#viewPreset')).toHaveCSS('font-size','13px');
  await expect(page.locator('#replaceModel')).toHaveCSS('font-size','13px');
  await expect(page.locator('#replaceModel')).toHaveCSS('width','176px');
  await expect(page.locator('.model-control label')).toHaveText('模型');
  await expect(page.locator('.model-control label')).toHaveAttribute('for','replaceModel');
  const library=await page.locator('.library').boundingBox(),preview=await page.locator('.viewport').boundingBox(),divider=await page.locator('.titlebar-divider').boundingBox(),model=await page.locator('#replaceModel').boundingBox();
  expect(Math.abs(divider.x-(library.x+library.width+preview.x)/2)).toBeLessThan(1);expect(model.x).toBeGreaterThan(preview.x);
  await expect(page.locator('.top #desktopUpdates')).toHaveCount(0);
  await expect(page.locator('#desktopSettings')).toHaveAttribute('aria-label','设置');
  await expect(page.locator('#desktopSettings')).toHaveAttribute('title','设置');
  await expect(page.locator('#desktopSettings svg')).toHaveCount(1);
  expect(await client.evaluate(({nativeTheme})=>({source:nativeTheme.themeSource,dark:nativeTheme.shouldUseDarkColors}))).toEqual({source:'dark',dark:true});
  for(const id of ['replaceModel','desktopSettings']){
   const control=page.locator('#'+id),normal=await control.evaluate(n=>getComputedStyle(n).backgroundColor);
   await control.hover();await expect(control).toHaveCSS('background-color','rgb(52, 59, 70)');
   expect(await control.evaluate(n=>getComputedStyle(n).backgroundColor)).not.toBe(normal);
   await page.mouse.move(100,200);
  }
  await expect(page.locator('#replaceModel')).toHaveCSS('appearance','base-select');
  await page.locator('#replaceModel').click();await expect(page.locator('#replaceModel option[value=mesh2motion]')).toBeVisible();
  await page.screenshot({path:'output/acceptance/motion-model-menu-desktop.png'});await page.keyboard.press('Escape');
  await page.locator('#viewPreset').click();await expect(page.locator('#viewPreset legend')).toHaveText(['自由视角','平视','斜俯视','等角']);
  await page.locator('#viewPreset option[value=right]').click();await expect(page.locator('#viewPreset')).toHaveValue('right');
  expect(await page.locator('.top').evaluate(n=>getComputedStyle(n).getPropertyValue('app-region'))).toBe('drag');
  expect(await page.locator('#replaceModel').evaluate(n=>getComputedStyle(n).getPropertyValue('app-region'))).toBe('no-drag');
  const overlay=await page.evaluate(()=>({visible:navigator.windowControlsOverlay.visible,rect:navigator.windowControlsOverlay.getTitlebarAreaRect().toJSON()}));
  expect(overlay.visible).toBe(true);
  const settings=await page.locator('#desktopSettings').boundingBox();expect(settings.x+settings.width).toBeLessThanOrEqual(overlay.rect.x+overlay.rect.width);
  // 原生最大化和恢复后，模型选择和设置仍留在窗口按钮安全区内。
  await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].maximize());
  await expect.poll(()=>client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
  await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].unmaximize());
  await page.locator('#desktopSettings').click();await expect(page.locator('#desktopSettingsDialog')).toBeVisible();
  await page.locator('#desktopUpdates').click();await expect(page.locator('#desktopUpdateDialog')).toBeVisible();
  await expect(page.locator('#updateVersion')).toContainText('当前版本');
  await page.locator('#closeDesktopUpdate').click();await expect(page.locator('#desktopSettingsDialog')).toBeVisible();
  await page.locator('#closeDesktopSettings').click();
  await page.screenshot({path:'output/acceptance/motion-merged-titlebar.png'});
 }finally{await client.close();}
});
