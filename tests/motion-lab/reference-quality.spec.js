import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {placeAction} from './drag-source-helper.js';
const bin=process.env.FFMPEG_BIN?process.env.FFMPEG_BIN+'/':'';
test('高清独立渲染与视频人物区域画质，不放大低分辨率预览',async({page})=>{
 await page.setViewportSize({width:1000,height:700});await page.goto('/');await page.locator('#replaceModel').selectOption('mesh2motion');await expect(page.locator('#status')).toContainText('162 动作');await page.locator('#viewPreset').selectOption('right');await page.locator('#green').check();
 await page.locator('#capturePose').click();await page.locator('#poseName').fill('静态画质验收');await page.locator('#confirmPoseSave').click();await expect(page.locator('#status')).toContainText('姿势已保存');await placeAction(page,page.locator('#clips [data-pose-id]').first());
 const preview=await page.locator('#stage canvas').evaluate(c=>({width:c.width,height:c.height}));expect(preview.width).toBeLessThan(1920);
 const photo=page.waitForEvent('download');await page.locator('#takePhoto').click();await (await photo).saveAs('output/acceptance/reference-hd-still.png');const png=await readFile('output/acceptance/reference-hd-still.png');expect(png.readUInt32BE(16)).toBe(1920);
 const box=await page.evaluate(async data=>{const image=await createImageBitmap(await (await fetch('data:image/png;base64,'+data)).blob()),canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const p=ctx.getImageData(0,0,image.width,image.height).data;let x0=image.width,y0=image.height,x1=0,y1=0;for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){const i=(y*image.width+x)*4;if(p[i]>100&&p[i+2]>100){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}return {x:x0-8,y:y0-8,w:x1-x0+17,h:y1-y0+17};},png.toString('base64'));
 expect(box.h/png.readUInt32BE(20)).toBeGreaterThan(.6);expect(box.h/png.readUInt32BE(20)).toBeLessThan(.8);
 const video=page.waitForEvent('download');await page.locator('#recordVideo').click();await expect(page.locator('#status')).toContainText('参考视频已下载',{timeout:15000});const file=await video,path='output/acceptance/reference-hd-still.'+file.suggestedFilename().split('.').pop();await file.saveAs(path);
 // 只比较人物包围区域，不能靠大面积纯绿背景骗过整体相似度。
 const crop=`crop=${box.w}:${box.h}:${box.x}:${box.y}`,result=spawnSync(bin+'ffmpeg.exe',['-hide_banner','-i',path,'-i','output/acceptance/reference-hd-still.png','-filter_complex',`[0:v]format=gbrp,${crop},settb=AVTB,setpts=PTS-STARTPTS[a];[1:v]format=gbrp,${crop},settb=AVTB,setpts=PTS-STARTPTS[b];[a][b]ssim`,'-frames:v','1','-f','null','-'],{encoding:'utf8',stdio:['ignore','ignore','pipe']});
 expect(result.status).toBe(0);console.log('人物区域RGB相似度',result.stderr.match(/All:([\d.]+)/)?.[1]);const score=Number(result.stderr.match(/All:([\d.]+)/)?.[1]);// 视频4:2:0色度采样会影响绿幕边缘；清晰度另以人物亮度结构严格核对。
 expect(score).toBeGreaterThan(.94);
 const luminance=spawnSync(bin+'ffmpeg.exe',['-hide_banner','-i',path,'-i','output/acceptance/reference-hd-still.png','-filter_complex',`[0:v]format=gray,${crop},settb=AVTB,setpts=PTS-STARTPTS[a];[1:v]format=gray,${crop},settb=AVTB,setpts=PTS-STARTPTS[b];[a][b]ssim`,'-frames:v','1','-f','null','-'],{encoding:'utf8',stdio:['ignore','ignore','pipe']});expect(luminance.status).toBe(0);const lumaScore=Number(luminance.stderr.match(/All:([\d.]+)/)?.[1]);console.log('人物亮度结构相似度',lumaScore);expect(lumaScore).toBeGreaterThan(.98);
 await writeFile('output/acceptance/reference-quality.json',JSON.stringify({preview,output:{width:png.readUInt32BE(16),height:png.readUInt32BE(20)},video:path,personRegion:box,rgbSSIM:score,luminanceSSIM:lumaScore},null,2));
 await page.locator('#play').click();await page.locator('#play').click();await expect(page.locator('#recordVideo')).toBeEnabled();
});
