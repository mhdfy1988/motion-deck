import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {viewPresets} from '../../web/labs/motion/view-presets.js';
const bin=process.env.FFMPEG_BIN?process.env.FFMPEG_BIN+'/':'';

test('20个固定视图实际出图，切方向不改编排，短屏可达',async({page})=>{
 test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('#replaceModel').selectOption('mesh2motion');await expect(page.locator('#status')).toContainText('162 动作');await page.locator('#green').check();
 await expect(page.locator('#viewPreset option')).toHaveCount(21);await expect(page.locator('#viewPreset optgroup')).toHaveCount(5);
 for(const preset of viewPresets.filter(p=>p.id!=='perspective')){
  await page.locator('#viewPreset').selectOption(preset.id);const download=page.waitForEvent('download');await page.locator('#takePhoto').click();const file=await download;expect(file.suggestedFilename()).toContain(preset.label);const path=`output/acceptance/view-${preset.id}.png`;await file.saveAs(path);const png=await readFile(path);expect(png.readUInt32BE(16)).toBe(1920);
  const bounds=await page.evaluate(async data=>{const image=await createImageBitmap(await (await fetch('data:image/png;base64,'+data)).blob()),canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,image.width,image.height).data;let count=0,minX=image.width,maxX=0,minY=image.height,maxY=0;for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){const i=(y*image.width+x)*4;if(pixels[i]>100&&pixels[i+2]>100){count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}return {count,minX,maxX,minY,maxY,width:image.width,height:image.height};},png.toString('base64'));
  expect(bounds.count).toBeGreaterThan(2000);expect(bounds.minX).toBeGreaterThan(0);expect(bounds.maxX).toBeLessThan(bounds.width-1);expect(bounds.minY).toBeGreaterThan(0);expect(bounds.maxY).toBeLessThan(bounds.height-1);await expect(page.locator('#segments .action')).toHaveCount(0);
 }
 for(const preset of ['front','back','overhead-front-right','iso-front-right']){await page.locator('#viewPreset').selectOption(preset);await page.screenshot({path:`output/acceptance/view-ui-${preset}.png`});}
 await page.setViewportSize({width:1000,height:600});await expect(page.locator('#viewPreset')).toBeInViewport();await expect(page.locator('#recordVideo')).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);expect(errors).toEqual([]);
 // 自由旋转后切固定视图，固定镜头也不能继承未消退的旋转惯性。
 await page.locator('#viewPreset').selectOption('perspective');const stage=await page.locator('#stage').boundingBox();await page.mouse.move(stage.x+80,stage.y+80);await page.mouse.down();await page.mouse.move(stage.x+250,stage.y+110,{steps:3});await page.mouse.up();await page.locator('#viewPreset').selectOption('front');
 const first=await page.locator('#stage canvas').screenshot();await page.waitForTimeout(300);expect((await page.locator('#stage canvas').screenshot()).equals(first)).toBe(true);
});

test('斜俯视、等角真实录制并解码，镜头锁定且结束恢复',async({page})=>{
 await page.goto('/');await page.locator('#replaceModel').selectOption('mesh2motion');await expect(page.locator('#status')).toContainText('162 动作');
 for(const id of ['overhead-front-right','iso-back-left']){await page.locator('#viewPreset').selectOption(id);const download=page.waitForEvent('download');await page.locator('#recordVideo').click();await expect(page.locator('#viewPreset')).toBeDisabled();const file=await download;expect(file.suggestedFilename()).toContain(viewPresets.find(p=>p.id===id).label);const path=`output/acceptance/view-${id}.`+file.suggestedFilename().split('.').pop();await file.saveAs(path);
  const metadata=JSON.parse(execFileSync(bin+'ffprobe.exe',['-v','error','-count_frames','-show_streams','-of','json',path],{encoding:'utf8'}));expect(metadata.streams[0].width).toBe(1920);expect(Number(metadata.streams[0].nb_read_frames)).toBeGreaterThan(5);await expect(page.locator('#viewPreset')).toBeEnabled();await expect(page.locator('#viewPreset')).toHaveValue(id);await expect(page.locator('#recordingIndicator')).toBeHidden();
 }
});
