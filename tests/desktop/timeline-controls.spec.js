import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {placeAction} from '../motion-lab/drag-source-helper.js';

test('实际客户端：未选/边界置灰，选中动作内部后分割与两侧裁剪可用',async()=>{
 const root=resolve('.');await mkdir(join(root,'output/desktop-tests'),{recursive:true});
 const data=await mkdtemp(join(root,'output/desktop-tests/timeline-controls-'));
 const env={...process.env,MOTIONDECK_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
 const startedAt=new Date().toISOString(),proof=[],client=await electron.launch({executablePath:process.env.MOTIONDECK_PACKAGED_EXE,args:['--smoke-hidden'],env});
 console.log('实际启动客户端',JSON.stringify({startedAt,pid:client.process().pid,exe:process.env.MOTIONDECK_PACKAGED_EXE,data}));
 try{
  const page=await client.firstWindow();await expect(page.locator('#capturePose')).toBeEnabled();
  await client.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.setTitle('MotionDeck · 现场验证窗口');window.showInactive();});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  async function record(step){const time=new Date().toISOString(),file=`output/acceptance/timeline-live-${step}.png`;await page.screenshot({path:file});proof.push({step,time,file,durations:await page.locator('#segments .action').evaluateAll(rows=>rows.map(row=>Number(row.dataset.duration)))});console.log('现场结果',JSON.stringify(proof.at(-1)));}
  const rows=page.locator('#segments .action'),cuts=['splitAction','trimLeft','trimRight'];
  await placeAction(page,page.locator('#clips [data-clip-index]').first());await expect(rows).toHaveCount(1);
  await placeAction(page,page.locator('#clips [data-clip-index]').nth(1));await expect(rows).toHaveCount(2);
  await page.locator('#timelineNone').click();await expect(page.locator('#selectionCount')).toHaveText('已选 0');
  for(const id of cuts)await expect(page.locator('#'+id)).toBeDisabled();
  const modes=page.getByRole('group',{name:'边缘拖动模式'});
  await expect(modes.getByRole('button',{name:'裁剪',exact:true})).toBeDisabled();
  await rows.first().click();await expect(page.locator('#selectionCount')).toHaveText('已选 1');
  await expect(modes.getByRole('button',{name:'裁剪',exact:true})).toBeEnabled();
  await modes.getByRole('button',{name:'变速',exact:true}).click();await expect(modes.getByRole('button',{name:'变速',exact:true})).toHaveAttribute('aria-pressed','true');
  for(const id of cuts)await expect(page.locator('#'+id)).toBeDisabled();
  const original=Number(await rows.first().getAttribute('data-duration'));
  async function seekInside(){const seek=page.locator('#seek'),bounds=await seek.boundingBox(),max=Number(await seek.getAttribute('max'));await page.mouse.click(bounds.x+5+(bounds.width-10)*.3/max,bounds.y+bounds.height/2);for(const id of cuts)await expect(page.locator('#'+id)).toBeEnabled();}
  await seekInside();await record('enabled');
  await page.locator('#splitAction').click();await expect(rows).toHaveCount(3);await record('split');await page.locator('#timelineUndo').click();await expect(rows).toHaveCount(2);
  await rows.first().click();await seekInside();await page.locator('#trimLeft').click();expect(Number(await rows.first().getAttribute('data-duration'))).toBeCloseTo(original-.3,1);await record('trim-left');await page.locator('#timelineUndo').click();
  await rows.first().click();await seekInside();await page.locator('#trimRight').click();expect(Number(await rows.first().getAttribute('data-duration'))).toBeCloseTo(.3,1);await record('trim-right');await page.locator('#timelineUndo').click();
  await writeFile('output/acceptance/timeline-live-proof.json',JSON.stringify({startedAt,finishedAt:new Date().toISOString(),exe:process.env.MOTIONDECK_PACKAGED_EXE,pid:client.process().pid,proof},null,2));
 }finally{await client.close();}
});
