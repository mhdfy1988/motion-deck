import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {waitForModel} from '../motion-lab/model-ready-helper.js';
import {desktopPackage} from '../helpers/desktop-package.js';
const require=createRequire(import.meta.url),{sendQuery}=require('../../desktop/control/client.cjs');

for(const model of ['mesh2motion','quaternius'])test(`真实命令检查闭环：${model} 过渡取帧/插入/批量轨迹/截图索引/视频回读与恢复`,async()=>{
 const root=resolve('.'),exe=await desktopPackage('acceptance');await mkdir(join(root,'output/review-acceptance'),{recursive:true});const dataDir=await mkdtemp(join(root,'output/review-acceptance/profile-'));
 const env={...process.env,MOTIONDECK_DATA_DIR:dataDir,MOTIONDECK_DEV_AUTO_CONTROL:'1'};delete env.ELECTRON_RUN_AS_NODE;
 // 命令媒体验收不需要用户窗口，避免共享桌面输入改动当前编排；视频仍须真实解码。
 const client=await electron.launch({executablePath:exe,args:['--smoke-hidden'],env,timeout:30000});
 const query=async(operation,args={},bound=false)=>{const state=bound?await sendQuery(dataDir,{operation:'session.inspect'}):null;return sendQuery(dataDir,{operation,args,...(bound?{modelKey:state.result.modelKey,expectedRevision:state.revision}:{})});};
 const ok=async(...args)=>{const result=await query(...args);expect(result.ok,JSON.stringify(result)).toBe(true);return result.result;};
 try{
  const page=await client.firstWindow();
  await page.evaluate(()=>{window.__reviewInput=[];for(const type of ['pointerdown','click','keydown','input','change'])document.addEventListener(type,event=>{window.__reviewInput.push({type,id:event.target.id,key:event.key,value:event.target.value,trusted:event.isTrusted});if(window.__reviewInput.length>40)window.__reviewInput.shift();},true);});
  await waitForModel(page,{actions:162});
  if(model==='quaternius'){await page.locator('#replaceModel').selectOption(model);await waitForModel(page,{actions:117});}
  const library=await ok('library.list',{limit:100}),clip=library.entries.find(x=>x.kind==='action'&&/Idle/i.test(x.name));
  await ok('pose.fromClip',{clipId:clip.id,time:0},true);const base=(await ok('model.inspect')).rootTransform,standing=await ok('pose.save',{name:'检查站立',confirmed:true},true);
  await ok('pose.fromLibrary',{poseId:standing.id},true);await ok('pose.setRootTransform',{position:[base.position[0],base.position[1]+.7,base.position[2]],quaternion:base.quaternion},true);const high=await ok('pose.save',{name:'检查腾空',confirmed:true},true);
  await ok('timeline.append',{assetId:standing.id,duration:.2,interpolation:'continuous'},true);await ok('timeline.append',{assetId:high.id,duration:0,transition:.4,interpolation:'continuous'},true);await ok('timeline.append',{assetId:standing.id,duration:.2,transition:.4,interpolation:'continuous'},true);
  await ok('preview.sequence',{time:.3,playing:false},true);const initial=await ok('session.inspect'),visible=(await ok('model.inspect')).rootTransform;
  const sample=await ok('sequence.sample',{times:[.2,.4,.6,.8,1],boneIds:[base.id]},true),sampleAfter=await ok('session.inspect'),samplePose=(await ok('model.inspect')).rootTransform;
  const diagnostic=JSON.stringify({initial,after:sampleAfter,input:await page.evaluate(()=>window.__reviewInput)});
  expect(sample.samples[2].bones[0].position[1]).toBeCloseTo(base.position[1]+.7,5);expect(sampleAfter.time,diagnostic).toBe(initial.time);expect(samplePose,diagnostic).toEqual(visible);
  await ok('pose.fromSequence',{time:.4},true);expect((await ok('model.inspect')).rootTransform.position[1]).toBeCloseTo(sample.samples[1].bones[0].position[1],5);const middle=await ok('pose.save',{name:'过渡取帧',confirmed:true},true);
  const inserted=await ok('timeline.insertPoseAt',{time:.4,poseId:middle.id},true);expect((await ok('timeline.inspect')).items).toHaveLength(4);expect((await ok('timeline.inspect')).duration).toBeCloseTo(1.2,6);
  await ok('timeline.undo',{},true);expect((await ok('timeline.inspect')).items).toHaveLength(3);await ok('timeline.redo',{},true);expect((await ok('timeline.inspect')).items.some(i=>i.id===inserted.id)).toBe(true);
  await ok('preview.sequence',{time:.31,playing:false},true);const before=await ok('session.inspect'),beforeRig=(await ok('rig.list',{limit:100})).entries;
  const batch=await ok('view.captureSequence',{times:[.2,.6,1],views:['right','front-right'],options:{width:640,height:480,framing:'motion',ground:true,skeleton:true}},true);expect(batch.files).toHaveLength(6);
  const manifest=JSON.parse(await readFile(batch.manifest.path,'utf8'));expect(manifest.frames.map(f=>f.time)).toEqual([.2,.2,.6,.6,1,1]);expect(manifest.modelKey).toBe(before.modelKey);expect(manifest.revision).toBe(before.revision);
  for(const file of batch.files){const png=await readFile(file.path);expect(createHash('sha256').update(png).digest('hex')).toBe(file.sha256);const metadata=await sharp(png).metadata();expect([metadata.width,metadata.height]).toEqual([640,480]);const {data,info}=await sharp(png).raw().toBuffer({resolveWithObject:true});let count=0,minY=info.height,maxY=0;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*info.channels;if(data[i]+data[i+1]+data[i+2]>320&&y>50){count++;minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}expect(count).toBeGreaterThan(200);expect(minY).toBeGreaterThan(51);expect(maxY).toBeLessThan(info.height-3);}
  const after=await ok('session.inspect');expect(after).toEqual(before);expect((await ok('rig.list',{limit:100})).entries).toEqual(beforeRig);
  const single=await ok('view.capture',{views:['right'],options:{width:640,height:480,framing:'pose',ground:false,skeleton:false}},true);expect(single.files).toHaveLength(1);
  const excessive=await query('view.captureSequence',{start:0,end:1,step:.01,views:['right']},true);expect(excessive.ok).toBe(false);expect((await ok('session.inspect')).status).toBe('ready');
  const throttling=await client.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.minimize();return w.webContents.getBackgroundThrottling();});
  const video=await ok('export.video',{name:'命令检查录像',confirmed:true,start:0,end:1.2,view:'front-right',options:{width:640,height:480,framing:'motion',ground:true}},true);
  expect(await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getBackgroundThrottling())).toBe(throttling);
  const bytes=await readFile(video.file.path);expect(createHash('sha256').update(bytes).digest('hex')).toBe(video.file.sha256);
  const bin=process.env.FFMPEG_BIN?process.env.FFMPEG_BIN+'/':'';
  const metadata=JSON.parse(execFileSync(bin+'ffprobe.exe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',video.file.path],{encoding:'utf8'}));const stream=metadata.streams.find(s=>s.codec_type==='video');expect([stream.width,stream.height]).toEqual([640,480]);expect(Number(stream.nb_read_frames)).toBeGreaterThan(8);expect(Number(metadata.format.duration)).toBeGreaterThan(.8);expect(Number(metadata.format.duration)).toBeLessThan(2.2);
  const frames=execFileSync(bin+'ffmpeg.exe',['-v','error','-i',video.file.path,'-f','framemd5','-'],{encoding:'utf8'}).split('\n').filter(l=>l&&!l.startsWith('#'));expect(new Set(frames.map(l=>l.split(',').at(-1).trim())).size).toBeGreaterThan(3);
  expect(await ok('session.inspect')).toEqual(before);expect((await ok('rig.list',{limit:100})).entries).toEqual(beforeRig);
  // 授权撤销后的新写命令不能绕过既有权限；只读轨迹仍可查询。
  await page.evaluate(async()=>{await window.motionDeckDesktop.setControlWrite(false);await window.motionDeckDesktop.setControlTimeline(false);});
  expect((await query('pose.fromSequence',{time:.4},true)).error.code).toBe('WRITE_DISABLED');expect((await query('timeline.insertPoseAt',{time:.5,poseId:middle.id},true)).error.code).toBe('WRITE_DISABLED');expect((await query('view.captureSequence',{times:[.2],views:['right']},true)).error.code).toBe('WRITE_DISABLED');expect((await query('export.video',{name:'拒绝',confirmed:true,start:0,end:1},true)).error.code).toBe('WRITE_DISABLED');expect((await query('sequence.sample',{times:[.2],boneIds:[base.id]},true)).ok).toBe(true);
  await writeFile(join(root,`output/review-acceptance/proof-${model}.json`),JSON.stringify({testedAt:new Date().toISOString(),exe,dataDir,batch,video,metadata,before,after},null,2),'utf8');
 }finally{await client.close();}
});
