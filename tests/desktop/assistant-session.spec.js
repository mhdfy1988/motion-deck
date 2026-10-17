import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {desktopPackage} from '../helpers/desktop-package.js';
import {waitForModel} from '../motion-lab/model-ready-helper.js';
import {handleConfirmation} from '../motion-lab/confirm-helper.js';
import sharp from 'sharp';
const {sendQuery}=createRequire(import.meta.url)('../../desktop/control/client.cjs');
test('真实协作：开始等待、命令操作、失败回等待、关闭及结束清除且保留草稿',async()=>{
 await mkdir(resolve('output/assistant-session'),{recursive:true});const data=await mkdtemp(resolve('output/assistant-session/profile-'));
 const executablePath=await desktopPackage('public'),env={...process.env,MOTIONDECK_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
 const client=await electron.launch({executablePath,args:['--smoke-hidden'],env});
 const query=(operation,args={},extra={})=>sendQuery(data,{operation,args,...extra});
 try{
  const page=await client.firstWindow();await waitForModel(page,{actions:162});await handleConfirmation(page,true,false);
  const indicator=page.locator('#assistantActivity');await expect(indicator).toBeHidden();
  await page.locator('#desktopSettings').click();await page.locator('#desktopControlToggle').click();await expect(page.locator('#desktopControlToggle')).toHaveAttribute('aria-checked','true');
  expect((await query('assistant.begin')).error.code).toBe('WRITE_DISABLED');
  await page.locator('#desktopControlWrite').click();await expect(page.locator('#desktopControlWrite')).toHaveAttribute('aria-checked','true');await page.locator('#closeDesktopSettings').click();
  const begin=await query('assistant.begin');expect(begin.ok).toBe(true);const assistantSessionId=begin.result.id;
  await expect(indicator).toHaveText('等待 AI');await expect(indicator).toBeVisible();
  const geometry=await indicator.evaluate(el=>{const box=el.getBoundingClientRect(),top=el.closest('.top').getBoundingClientRect();return {inside:box.top>=top.top&&box.bottom<=top.bottom,color:getComputedStyle(el).color,center:Math.abs((box.left+box.width/2)-(top.left+top.width/2))};});expect(geometry.inside).toBe(true);expect(geometry.color).toBe('rgb(224, 243, 255)');expect(geometry.center).toBeLessThan(1);
  // 原生按钮不在page.screenshot的网页表面内，单独捕获此隔离窗口确认右上角。
  await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
  const native=await client.evaluate(async({BrowserWindow,desktopCapturer})=>{const win=BrowserWindow.getAllWindows()[0],id=String(win.getNativeWindowHandle().readUInt32LE());const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:1800,height:1200},fetchWindowIcons:false});const own=sources.find(source=>source.id.split(':')[1]===id);if(!own||own.thumbnail.isEmpty())throw Error('无法捕获自身隔离窗口');return own.thumbnail.toPNG().toString('base64');});
  await writeFile(resolve('output/assistant-session/native-blue-titlebar.png'),Buffer.from(native,'base64'));
  const pixels=await sharp(Buffer.from(native,'base64')).removeAlpha().raw().toBuffer({resolveWithObject:true});let blueColumns=0;
  for(let x=pixels.info.width-130;x<pixels.info.width-20;x++){let blue=false;for(let y=0;y<12;y++){const i=(y*pixels.info.width+x)*pixels.info.channels;if(pixels.data[i+2]>130&&pixels.data[i+2]>pixels.data[i]+35)blue=true;}if(blue)blueColumns++;}
  expect(blueColumns,'原生右上按钮区顶部必须延续蓝色光边').toBeGreaterThan(80);
  await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,760));
  const narrow=await indicator.evaluate(el=>{const a=el.getBoundingClientRect(),b=document.querySelector('#replaceModel').getBoundingClientRect(),top=el.closest('.top').getBoundingClientRect();return {noOverlap:a.left>b.right+8,inside:a.top>=top.top&&a.bottom<=top.bottom};});expect(narrow).toEqual({noOverlap:true,inside:true});
  await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
  expect((await query('model.inspect',{}, {assistantSessionId})).ok).toBe(true);
  expect((await query('assistant.inspect')).result.status).toBe('waiting');
  await expect(indicator).toHaveText('AI 助手正在操作');
  await expect(indicator).toHaveText('等待 AI');
  const session=await query('session.inspect'),library=await query('library.list',{limit:1});
  const bound={assistantSessionId,modelKey:session.result.modelKey,expectedRevision:session.revision};
  expect((await query('pose.fromClip',{clipId:library.result.entries[0].id,time:.2},bound)).ok).toBe(true);
  await expect(indicator).toHaveText('等待 AI');
  await page.evaluate(()=>{window.cooperationStates=[];window.cooperationObserver=new MutationObserver(()=>{const el=document.querySelector('#assistantActivity');cooperationStates.push({text:el.textContent,visible:!el.hidden,fixed:getComputedStyle(document.body,'::after').position});});cooperationObserver.observe(document.body,{attributes:true,childList:true,subtree:true,characterData:true});});
  const current=await query('session.inspect');expect((await query('view.capture',{views:['front','right']},{assistantSessionId,modelKey:current.result.modelKey,expectedRevision:current.revision})).ok).toBe(true);
  const states=await page.evaluate(()=>{cooperationObserver.disconnect();return cooperationStates;});expect(states.some(s=>s.text==='AI 助手正在操作'&&s.visible&&s.fixed==='fixed')).toBe(true);await expect(indicator).toHaveText('等待 AI');
  await page.screenshot({path:'output/assistant-session/waiting.png'});
  expect((await query('pose.undo',{}, {...bound,expectedRevision:0})).ok).toBe(false);await expect(indicator).toHaveText('等待 AI');
  await page.locator('#desktopSettings').click();await page.locator('#desktopControlToggle').click();await expect(indicator).toBeHidden();await expect(page.locator('body')).not.toHaveClass(/assistant-operating/);
  await page.locator('#desktopControlToggle').click();await expect(page.locator('#desktopControlToggle')).toHaveAttribute('aria-checked','true');await page.locator('#desktopControlWrite').click();await expect(page.locator('#desktopControlWrite')).toHaveAttribute('aria-checked','true');await page.locator('#closeDesktopSettings').click();
  expect((await query('session.inspect')).result.editingContext).toBe('pose-draft');expect((await query('model.inspect',{}, {assistantSessionId})).error.code).toBe('ASSISTANT_SESSION_EXPIRED');
  const next=await query('assistant.begin');expect(next.result.id).not.toBe(assistantSessionId);await expect(indicator).toHaveText('等待 AI');
  expect((await query('assistant.end',{id:next.result.id})).ok).toBe(true);await expect(indicator).toBeHidden();expect((await query('session.inspect')).result.editingContext).toBe('pose-draft');
 }finally{
  // 断言已确认草稿保留后，仅清理本用例mkdtemp资料中的试摆，不影响用户实例。
  try{const current=await query('session.inspect');if(current.result?.editingContext==='pose-draft')await query('pose.discard',{}, {modelKey:current.result.modelKey,expectedRevision:current.revision});}catch{}
  // 失败路径也不得把隔离测试的原生退出确认抛到用户桌面；只在所有断言结束后生效。
  await client.evaluate(({BrowserWindow,dialog})=>{dialog.showMessageBoxSync=()=>1;for(const window of BrowserWindow.getAllWindows())window.destroy();}).catch(()=>{});await client.close();
 }
});
