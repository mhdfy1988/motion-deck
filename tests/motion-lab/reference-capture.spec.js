import {waitForModel} from './model-ready-helper.js';
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {placeAction} from './drag-source-helper.js';
import {build} from 'esbuild';
const bin=process.env.FFMPEG_BIN?process.env.FFMPEG_BIN+'/':'';

test('共享拍摄工厂保留显式尺寸/相机，渲染失败恢复辅助物且资源只释放一次',async({page})=>{
 const fixture=await build({stdin:{contents:"export {THREE} from './web/labs/motion/platform/three-adapter.js';export {createReferenceCaptureFactory} from './web/labs/motion/platform/reference-scene.js';",resolveDir:process.cwd()},bundle:true,format:'esm',write:false});
 await page.route('**/media-factory-fixture.js',route=>route.fulfill({contentType:'application/javascript',body:fixture.outputFiles[0].text}));
 await page.goto('/');await waitForModel(page,{actions:162});
 const result=await page.evaluate(async()=>{
  const {THREE,createReferenceCaptureFactory}=await import('/media-factory-fixture.js');
  const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial({color:0xffffff}),root=new THREE.Mesh(geometry,material),grid=new THREE.Object3D(),helper=new THREE.Object3D();
  scene.add(root,grid,helper);const camera=new THREE.PerspectiveCamera(38,1,.01,100),other=camera.clone();other.position.z=3;
  const renderer=new THREE.WebGLRenderer();let releases=0,hiddenAtDraw=false;
  const create=createReferenceCaptureFactory({scene,renderer,grid,getCamera:()=>camera,getRoot:()=>root,getHelper:()=>helper,onStatus:()=>{},onRelease:()=>releases++});
  const before=camera.position.toArray(),flags=scene.children.map(node=>node.visible),capture=create({camera:other,width:96,height:64});
  try{
   root.onBeforeRender=()=>{hiddenAtDraw=!grid.visible&&!helper.visible;throw Error('模拟渲染失败');};
   let failure='';try{await capture.photo();}catch(error){failure=error.message;}
   const restored=JSON.stringify(scene.children.map(node=>node.visible))===JSON.stringify(flags);
   root.onBeforeRender=()=>{};const bitmap=await createImageBitmap(await capture.photo());const dimensions=[bitmap.width,bitmap.height];bitmap.close();
   capture.dispose();capture.dispose();return {failure,hiddenAtDraw,restored,dimensions,releases,cameraUnchanged:JSON.stringify(camera.position.toArray())===JSON.stringify(before)};
  }finally{capture.dispose();renderer.dispose();renderer.forceContextLoss();geometry.dispose();material.dispose();}
 });
 expect(result).toEqual({failure:'模拟渲染失败',hiddenAtDraw:true,restored:true,dimensions:[96,64],releases:1,cameraUnchanged:true});
});

test('自动取景保持源/姿势/编排上下文、可见姿势和编辑版本',async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});
 const snapshot=()=>page.evaluate(async()=>{const {workbench}=await import('/labs/motion/motion.bundle.js');return {state:workbench.inspect(),rig:workbench.rigList({limit:100}).entries};});
 const fit=async()=>{const before=await snapshot();await page.locator('#fit').click();await expect(page.locator('#status')).toHaveText('取景已适配 · 镜头保持固定');expect(await snapshot()).toEqual(before);await expect(page.locator('#replaceModel')).toBeEnabled();};
 await fit();await page.locator('#library-pose').click();await page.locator('#clips [data-pose-id]').first().click();await fit();
 await page.locator('#library-actions').click();await placeAction(page,page.locator('#clips [data-clip-index]').first());await page.locator('#segments .action').first().click();await fit();
 await page.screenshot({path:'output/acceptance/media-fit-preserved.png'});
});
test('真实PNG与视频下载：无界面/网格/骨架、完整编排与恢复，提前停止及错误保护',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('#replaceModel').selectOption('mesh2motion');await waitForModel(page,{actions:162});await expect(page.locator('#status')).toContainText('162 动作');
 await page.locator('#green').check();await page.locator('#skeleton').check();
 const photo=page.waitForEvent('download');await page.locator('#takePhoto').click();const image=await photo;expect(image.suggestedFilename()).toMatch(/\.png$/);const path='output/acceptance/reference-photo.png';await image.saveAs(path);const png=await readFile(path);expect(png.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');expect(png.readUInt32BE(16)).toBe(1920);
 const colors=await page.evaluate(async data=>{const bitmap=await createImageBitmap(await (await fetch('data:image/png;base64,'+data)).blob()),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,bitmap.width,bitmap.height).data;let foreground=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>100&&pixels[i+2]>100)foreground++;return {corner:[...pixels.slice(0,4)],foreground};},png.toString('base64'));expect(colors.corner).toEqual([0,255,0,255]);expect(colors.foreground).toBeGreaterThan(1000);
 await placeAction(page,page.locator('#clips [data-clip-index]').first());await placeAction(page,page.locator('#clips [data-clip-index]').nth(1));const segment=await page.locator('#segments .action').last().boundingBox();await placeAction(page,page.locator('#transitionSource'),{x:segment.x+8,y:segment.y+20});await expect(page.locator('#segments .transition')).toHaveCount(1);
 const before=await page.locator('#segments button').evaluateAll(rows=>rows.map(r=>[r.dataset.key,r.dataset.duration]));await page.getByRole('button',{name:'2倍速',exact:true}).click();const duration=Number(await page.locator('#seek').getAttribute('max'))/2;
 const video=page.waitForEvent('download');await page.locator('#recordVideo').click();await expect(page.locator('#recordVideo')).toHaveAttribute('aria-label','停止录像');await expect(page.locator('#replaceModel')).toBeDisabled();await expect(page.locator('.timeline')).toHaveAttribute('inert','');await expect(page.locator('#status')).toContainText('参考视频已下载',{timeout:15000});const file=await video;const extension=file.suggestedFilename().split('.').pop();expect(['mp4','webm']).toContain(extension);const videoPath='output/acceptance/reference-video.'+extension;await file.saveAs(videoPath);await expect(page.locator('#recordVideo')).toHaveAttribute('aria-label','录像');await expect(page.locator('.timeline')).not.toHaveAttribute('inert','');expect(await page.locator('#segments button').evaluateAll(rows=>rows.map(r=>[r.dataset.key,r.dataset.duration]))).toEqual(before);await expect(page.locator('#skeleton')).toBeChecked();
 const metadata=JSON.parse(execFileSync(bin+'ffprobe.exe',['-v','error','-count_frames','-show_packets','-show_streams','-show_format','-of','json',videoPath],{encoding:'utf8'}));const stream=metadata.streams.find(s=>s.codec_type==='video');expect(stream.width).toBe(1920);expect(Number(stream.nb_read_frames)).toBeGreaterThan(5);const packets=metadata.packets.filter(p=>p.codec_type==='video'),measured=Number(packets.at(-1).pts_time)-Number(packets[0].pts_time)+Number(packets.at(-1).duration_time??0);expect(measured).toBeGreaterThan(duration-.4);expect(measured).toBeLessThan(duration+1);
 const frames=execFileSync(bin+'ffmpeg.exe',['-v','error','-i',videoPath,'-f','framemd5','-'],{encoding:'utf8'}).split('\n').filter(line=>line&&!line.startsWith('#'));expect(new Set(frames.map(line=>line.split(',').at(-1).trim())).size).toBeGreaterThan(3);
 await page.evaluate(()=>{const supported=MediaRecorder.isTypeSupported.bind(MediaRecorder);window.referenceSupported=supported;MediaRecorder.isTypeSupported=type=>type.startsWith('video/mp4')&&supported(type);});
 const mp4Download=page.waitForEvent('download');await page.locator('#recordVideo').click();await expect(page.locator('#status')).toContainText('参考视频已下载',{timeout:15000});const mp4=await mp4Download;expect(mp4.suggestedFilename()).toMatch(/\.mp4$/);await mp4.saveAs('output/acceptance/reference-h264.mp4');const mp4Meta=JSON.parse(execFileSync(bin+'ffprobe.exe',['-v','error','-count_frames','-show_streams','-of','json','output/acceptance/reference-h264.mp4'],{encoding:'utf8'}));expect(mp4Meta.streams[0].codec_name).toBe('h264');expect(Number(mp4Meta.streams[0].nb_read_frames)).toBeGreaterThan(5);
 await page.evaluate(()=>{MediaRecorder.isTypeSupported=type=>type.startsWith('video/webm')&&window.referenceSupported(type);});
 const early=page.waitForEvent('download');await page.locator('#recordVideo').click();await expect(page.locator('#status')).toContainText('录像 ');await expect(page.locator('#recordingIndicator')).toBeVisible();await expect(page.locator('#recordingIndicator')).toHaveText(/\d+\.\d s/);await page.screenshot({path:'output/acceptance/motion-recording-icon.png'});await page.waitForTimeout(300);await page.locator('#recordVideo').click();const stopped=await early;expect(stopped.suggestedFilename()).toMatch(/\.webm$/);await stopped.saveAs('output/acceptance/reference-stopped.webm');await expect(page.locator('#recordVideo')).toHaveAttribute('aria-label','录像');
 await page.evaluate(()=>{window.MediaRecorder.isTypeSupported=()=>false;});await page.locator('#recordVideo').click();await expect(page.locator('#error')).toContainText('没有可用的视频编码器');await expect(page.locator('#replaceModel')).toBeEnabled();await expect(page.locator('.timeline')).not.toHaveAttribute('inert','');await expect(page.locator('#recordingIndicator')).toBeHidden();await expect(page.locator('#recordVideo svg')).toHaveCount(1);expect(errors).toEqual([]);
 await page.setViewportSize({width:1280,height:600});await expect(page.locator('#takePhoto')).toBeInViewport();await expect(page.locator('#recordVideo')).toBeInViewport();
});
