import {test,expect,_electron as electron} from '@playwright/test';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';

test('自定义紧凑窗口按钮、安全区及关闭保护，更新入口仅在设置中',async()=>{
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
   // Electron共享真实桌面；系统pointerout可打断CDP悬浮。每次取证重建前提，不强制伪类或跳过颜色检查。
   await expect.poll(async()=>{await control.hover();return control.evaluate(n=>({hover:n.matches(':hover'),color:getComputedStyle(n).backgroundColor}));},{timeout:5000}).toEqual({hover:true,color:'rgb(52, 59, 70)'});
   expect(await control.evaluate(n=>getComputedStyle(n).backgroundColor)).not.toBe(normal);
   await page.mouse.move(100,200);
   await expect.poll(async()=>{await page.mouse.move(100,200);return control.evaluate(n=>({hover:n.matches(':hover'),color:getComputedStyle(n).backgroundColor}));},{timeout:5000}).toEqual({hover:false,color:normal});
  }
  await expect(page.locator('#replaceModel')).toHaveCSS('appearance','base-select');
  await page.locator('#replaceModel').click();await expect(page.locator('#replaceModel option[value=mesh2motion]')).toBeVisible();
  await page.screenshot({path:'output/acceptance/motion-model-menu-desktop.png'});await page.keyboard.press('Escape');
  await page.locator('#viewPreset').click();await expect(page.locator('#viewPreset legend')).toHaveText(['自由视角','平视','斜俯视','等角']);
  await page.locator('#viewPreset option[value=right]').click();await expect(page.locator('#viewPreset')).toHaveValue('right');
  expect(await page.locator('.top').evaluate(n=>getComputedStyle(n).getPropertyValue('app-region'))).toBe('drag');
  expect(await page.locator('#replaceModel').evaluate(n=>getComputedStyle(n).getPropertyValue('app-region'))).toBe('no-drag');
  const overlay=await page.evaluate(()=>({visible:navigator.windowControlsOverlay.visible,rect:navigator.windowControlsOverlay.getTitlebarAreaRect().toJSON()}));
  expect(overlay.visible).toBe(false);
  const settings=await page.locator('#desktopSettings').boundingBox(),controls=await page.locator('.window-controls').boundingBox();expect(settings.x+settings.width).toBeLessThan(controls.x);
  for(const id of ['windowMinimize','windowMaximize','windowClose']){
   const button=page.locator('#'+id);await expect(button).toHaveCSS('width','36px');await expect(button).toHaveCSS('height','30px');await expect(button).toHaveCSS('border-radius','6px');await expect(button).toHaveCSS('box-shadow','none');
   expect(await button.evaluate(el=>getComputedStyle(el).getPropertyValue('app-region'))).toBe('no-drag');
   const color=id==='windowClose'?'rgb(112, 52, 61)':'rgba(255, 255, 255, 0.07)';
   await expect.poll(async()=>{await button.hover();return button.evaluate(el=>getComputedStyle(el).backgroundColor);}).toBe(color);
  }
  // 原生最大化和恢复后，模型选择和设置仍留在窗口按钮安全区内。
  await page.locator('#windowMaximize').click();
  await expect.poll(()=>client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
  await expect(page.locator('#windowMaximize')).toHaveAttribute('aria-label','还原');
  await page.locator('#windowMaximize').click();
  await expect.poll(()=>client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized())).toBe(false);
  await expect(page.locator('#windowMaximize')).toHaveAttribute('aria-label','最大化');
  await page.locator('#windowMinimize').click();await expect.poll(()=>client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMinimized())).toBe(true);
  await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].restore());
  await page.evaluate(()=>motionDeckDesktop.controlDraftState(true));
  await client.evaluate(({dialog})=>{globalThis.closePrompts=[];dialog.showMessageBoxSync=(_win,options)=>{closePrompts.push(options.message);return 0;};});
  await page.locator('#windowClose').click();expect(await client.evaluate(()=>closePrompts)).toEqual(['助手姿势尚未保存，放弃并关闭？']);
  expect(await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length)).toBe(1);
  await page.evaluate(()=>motionDeckDesktop.controlDraftState(false));
  await page.locator('#desktopSettings').click();await expect(page.locator('#desktopSettingsDialog')).toBeVisible();
  const directoryRows=await page.locator('.directory-row').evaluateAll(rows=>rows.map(row=>{const path=row.querySelector('.directory-path'),button=row.querySelector('button');return {height:row.getBoundingClientRect().height,pathHeight:path.getBoundingClientRect().height,path:path.textContent,title:path.title,buttonHeight:button.getBoundingClientRect().height,buttonX:button.getBoundingClientRect().x};}));expect(directoryRows).toHaveLength(6);expect(directoryRows.every(row=>row.height<=64&&row.pathHeight===18&&row.path===row.title&&row.buttonHeight===30)).toBe(true);expect(new Set(directoryRows.map(row=>row.buttonX)).size).toBe(1);
  await expect(page.locator('#desktopSettingsDialog #desktopUpdateSection')).toBeVisible();await expect(page.locator('#desktopUpdateDialog')).toHaveCount(0);
  await expect(page.locator('#updateVersion')).toContainText('当前版本');
  await expect(page.locator('#desktopSettingsDialog #checkDesktopUpdate')).toBeVisible();
  await expect(page.locator('#desktopUpdateSection h3,#updateReleasePage,.update-security')).toHaveCount(0);expect((await page.locator('#desktopUpdateSection').boundingBox()).height).toBeLessThanOrEqual(40);await expect(page.locator('#desktopUpdateSection button:visible')).toHaveCount(1);
  await page.locator('#closeDesktopSettings').click();
  await page.screenshot({path:'output/acceptance/motion-merged-titlebar.png'});
  await page.locator('#windowClose').hover();await page.screenshot({path:'output/acceptance/motion-window-close-hover.png'});
  await page.locator('#windowClose').click();await expect.poll(()=>client.windows().length).toBe(0);
 }finally{await client.close();}
});
