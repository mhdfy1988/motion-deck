import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationMixer,LoopOnce,Vector3} from 'three';
import {waitForModel} from '../motion-lab/model-ready-helper.js';
import {handleConfirmation} from '../motion-lab/confirm-helper.js';
const run=promisify(execFile);
const {sendQuery}=createRequire(import.meta.url)('../../desktop/control/client.cjs');

for(const targetModel of ['mesh2motion','quaternius'])test(`A4 实际内置运行时命令：${targetModel} 原地/位移与连续姿势、保存恢复和GLB回读`,async()=>{
 const root=resolve('.');await mkdir(join(root,'output/a4-acceptance'),{recursive:true});const dataDir=await mkdtemp(join(root,'output/a4-acceptance/profile-')),exe=process.env.MOTIONDECK_PACKAGED_EXE??createRequire(import.meta.url)('electron'),env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
 let client=await electron.launch({executablePath:exe,args:process.env.MOTIONDECK_PACKAGED_EXE?['--smoke-hidden']:[root,'--smoke-hidden'],env,timeout:30000});const proof=[];
 const entry=process.env.MOTIONDECK_PACKAGED_EXE?join(dirname(exe),'resources/app.asar/desktop/control/command.cjs'):join(root,'desktop/control/command.cjs');
 // 批量请求复用官方受控协议客户端；单独验收包内启动器，避免每条请求重复启动Electron运行时。
 const command=async request=>sendQuery(dataDir,request);
 const read=async operation=>{const r=await command({operation,args:operation==='library.list'?{limit:100}:{}});expect(r.ok).toBe(true);return r;};
 const write=async(operation,args)=>{const s=await read('session.inspect');return command({operation,args,modelKey:s.result.modelKey,expectedRevision:s.revision});};
 try{
  if(process.env.MOTIONDECK_PACKAGED_EXE){const help=await run(process.env.ComSpec??'cmd.exe',['/d','/c',join(dirname(exe),'MotionDeck-command.cmd'),'--help'],{env,windowsHide:true,timeout:15000});expect(help.stdout).toContain('MotionDeck-command.cmd');}
  const page=await client.firstWindow();await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await waitForModel(page,{actions:162});
  await handleConfirmation(page,true,false);
  await page.locator('#desktopSettings').click();await page.locator('#desktopControlToggle').click();await page.locator('#desktopControlWrite').click();await expect(page.locator('#desktopControlWrite')).toHaveAttribute('aria-checked','true');await page.locator('#closeDesktopSettings').click();
  expect((await write('timeline.append',{assetId:'invalid',duration:1})).error.code).toBe('WRITE_DISABLED');
  await page.locator('#desktopSettings').click();await page.locator('#desktopControlTimeline').click();await expect(page.locator('#desktopControlTimeline')).toHaveAttribute('aria-checked','true');await page.locator('#closeDesktopSettings').click();
  const builtinQuery=JSON.parse((await run(exe,[entry,'--data-dir',dataDir,'--operation','session.inspect'],{env:{...env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,timeout:15000})).stdout);expect(builtinQuery.ok).toBe(true);expect(builtinQuery.sessionId).toBe((await read('session.inspect')).sessionId);
  for(const [model,count,distance] of [['mesh2motion',162,0],['quaternius',117,2]].filter(([model])=>model===targetModel)){
   if(model==='quaternius'){await page.locator('#replaceModel').selectOption(model);await waitForModel(page,{actions:count});}
   const library=await read('library.list'),idle=library.result.entries.find(e=>e.kind==='action'&&/^Idle(_A|_Loop)?$/.test(e.name))??library.result.entries.find(e=>e.kind==='action'&&/Idle/i.test(e.name));expect(idle).toBeTruthy();
   expect((await write('pose.fromClip',{clipId:idle.id,time:0})).ok).toBe(true);const info=await read('model.inspect'),base=info.result.rootTransform;expect(base).toBeTruthy();
   const stand=await write('pose.save',{name:'A4站立-'+model,confirmed:true,role:'key',stage:'站立'});expect(stand.ok).toBe(true);
   expect((await write('pose.fromLibrary',{poseId:stand.result.id})).ok).toBe(true);expect((await write('pose.setRootTransform',{position:[base.position[0]+distance/2,base.position[1]+1,base.position[2]],quaternion:base.quaternion})).ok).toBe(true);const high=await write('pose.save',{name:'A4腾空-'+model,confirmed:true,role:'key',stage:'腾空'});expect(high.ok).toBe(true);
   expect((await write('pose.fromLibrary',{poseId:stand.result.id})).ok).toBe(true);expect((await write('pose.setRootTransform',{position:[base.position[0]+distance,base.position[1],base.position[2]],quaternion:base.quaternion})).ok).toBe(true);const land=await write('pose.save',{name:'A4落地-'+model,confirmed:true,role:'key',stage:'落地'});expect(land.ok).toBe(true);
   const a=await write('timeline.append',{assetId:stand.result.id,duration:.05}),b=await write('timeline.append',{assetId:high.result.id,duration:.05,transition:.4}),c=await write('timeline.append',{assetId:land.result.id,duration:.1,transition:.4});expect([a,b,c].every(r=>r.ok)).toBe(true);
   await expect(page.locator('#segments .pose')).toHaveCount(3);await expect(page.locator('#segments .transition')).toHaveCount(2);
   const invalid=await write('timeline.transition',{id:a.result.id,duration:.2});expect(invalid.ok).toBe(false);expect((await read('timeline.inspect')).result.items).toHaveLength(3);
   expect((await write('timeline.resize',{id:a.result.id,duration:.1})).ok).toBe(true);expect((await write('timeline.undo',{})).ok).toBe(true);expect((await read('timeline.inspect')).result.items[0].duration).toBe(.05);expect((await write('timeline.redo',{})).ok).toBe(true);expect((await write('timeline.undo',{})).ok).toBe(true);
   expect((await write('preview.sequence',{time:.25,playing:false})).ok).toBe(true);await expect(page.locator('#seek')).toHaveValue('0.25');await expect(page.locator('#currentClip')).toContainText('过渡');const middle=(await read('model.inspect')).result.rootTransform;expect(middle.position[1]).toBeCloseTo(base.position[1]+.5,4);expect(middle.position[0]).toBeCloseTo(base.position[0]+distance/4,4);
   const playing=await write('preview.sequence',{time:0,playing:true});expect(playing.ok).toBe(true);expect(playing.result.playing).toBe(true);expect((await write('preview.sequence',{time:.45,playing:false})).ok).toBe(true);
   const saved=await write('timeline.saveAction',{name:'A4跳跃-'+model,confirmed:true});expect(saved.ok).toBe(true);expect((await write('timeline.saveAction',{name:'A4跳跃-'+model,confirmed:true})).error.code).toBe('DUPLICATE_NAME');
   const exported=await write('export.glb',{name:'A4跳跃-'+model,confirmed:true});expect(exported.ok).toBe(true);const bytes=await readFile(exported.result.file.path);expect(createHash('sha256').update(bytes).digest('hex')).toBe(exported.result.file.sha256);
   const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');expect(gltf.animations).toHaveLength(1);expect(gltf.animations[0].duration).toBeCloseTo(1,4);const rig=await command({operation:'rig.list',args:{limit:100}}),carrierName=rig.result.entries.find(e=>e.id===base.id).name,carrier=gltf.scene.getObjectByName(carrierName);expect(carrier).toBeTruthy();
   const mixer=new AnimationMixer(gltf.scene),action=mixer.clipAction(gltf.animations[0]).setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(.45);gltf.scene.updateMatrixWorld(true);const point=carrier.getWorldPosition(new Vector3());expect(point.y).toBeCloseTo(base.position[1]+1,3);expect(point.x).toBeCloseTo(base.position[0]+distance/2,3);mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);
   const legacy=await read('timeline.inspect');expect((await write('timeline.remove',{ids:legacy.result.items.map(i=>i.id)})).ok).toBe(true);
   for(const [assetId,duration,transition]of [[stand.result.id,.2,0],[high.result.id,0,.4],[land.result.id,.2,.4]])expect((await write('timeline.append',{assetId,duration,transition,interpolation:'continuous'})).ok).toBe(true);
   const continuous=await read('timeline.inspect');expect(continuous.result.duration).toBeCloseTo(1.2,6);expect(continuous.result.items[1].duration).toBe(0);
   const around=[];for(const time of [.59,.6,.61]){expect((await write('preview.sequence',{time,playing:false})).ok).toBe(true);around.push((await read('model.inspect')).result.rootTransform.position);}
   expect(around[1][1]).toBeCloseTo(base.position[1]+1,4);expect(around[0][1]).toBeLessThan(around[1][1]);expect(around[2][1]).toBeLessThan(around[1][1]);
   const continuousSaved=await write('timeline.saveAction',{name:'连续跳跃-'+model,confirmed:true});expect(continuousSaved.ok).toBe(true);
   const continuousExport=await write('export.glb',{name:'连续跳跃-'+model,confirmed:true});expect(continuousExport.ok).toBe(true);
   const cb=await readFile(continuousExport.result.file.path),cg=await new GLTFLoader().parseAsync(cb.buffer.slice(cb.byteOffset,cb.byteOffset+cb.byteLength),'');expect(cg.animations[0].duration).toBeCloseTo(1.2,4);
   const cm=new AnimationMixer(cg.scene),ca=cm.clipAction(cg.animations[0]).setLoop(LoopOnce,1);ca.clampWhenFinished=true;ca.play();
   for(let i=0;i<3;i++){cm.setTime([.59,.6,.61][i]);cg.scene.updateMatrixWorld(true);expect(cg.scene.getObjectByName(carrierName).getWorldPosition(new Vector3()).distanceTo(new Vector3(...around[i]))).toBeLessThan(.002);}
   cm.stopAllAction();cm.uncacheRoot(cg.scene);
   proof.push({model,distance,base,land:land.result,saved:saved.result,exported:exported.result,point:point.toArray(),continuous:{around,saved:continuousSaved.result,exported:continuousExport.result}});
  }
  await client.close();client=await electron.launch({executablePath:exe,args:process.env.MOTIONDECK_PACKAGED_EXE?['--smoke-hidden']:[root,'--smoke-hidden'],env,timeout:30000});
  const restoredPage=await client.firstWindow();await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await waitForModel(restoredPage,{actions:targetModel==='mesh2motion'?162:117});
  expect((await restoredPage.evaluate(()=>window.motionDeckDesktop.controlState())).enabled).toBe(false);
  await restoredPage.locator('#desktopSettings').click();await restoredPage.locator('#desktopControlToggle').click();await restoredPage.locator('#closeDesktopSettings').click();
  const firstPage=await read('library.list'),restoredLibrary=await command({operation:'library.list',args:{offset:Math.max(0,firstPage.result.total-100),limit:100}});
  expect(restoredLibrary.ok).toBe(true);expect(restoredLibrary.result.entries.some(e=>e.id===proof.at(-1).saved.id)).toBe(true);expect(restoredLibrary.result.entries.some(e=>e.id===proof.at(-1).continuous.saved.id)).toBe(true);
  await restoredPage.locator('#library-ai').click();await restoredPage.locator('[data-custom-id="'+proof.at(-1).continuous.saved.id+'"]').click();expect((await read('session.inspect')).result.mode).toBe('custom');
  await restoredPage.locator('#clips [data-pose-id="'+proof.at(-1).land.id+'"]').click();
  const restoredTransform=(await read('model.inspect')).result.rootTransform;expect(restoredTransform.position[0]).toBeCloseTo(proof.at(-1).base.position[0]+(targetModel==='quaternius'?2:0),4);
  await writeFile(join(root,'output/a4-acceptance/timeline-command-proof-'+targetModel+'.json'),JSON.stringify({testedAt:new Date().toISOString(),exe,dataDir,proof,restoredTransform},null,2));
 }finally{await client.evaluate(({BrowserWindow,dialog})=>{dialog.showMessageBoxSync=()=>1;for(const w of BrowserWindow.getAllWindows())w.destroy();}).catch(()=>{});await client.close();}
});
