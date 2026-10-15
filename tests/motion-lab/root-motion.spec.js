import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationMixer,LoopOnce,Vector3} from 'three';
import {waitForModel} from './model-ready-helper.js';

test('界面位移开关与导出继承/覆盖：真实下载无升降，原编排与预览设置保留',async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});
 const base=await page.evaluate(async()=>{
  const {workbench:w}=await import('/labs/motion/motion.bundle.js'),s=w.inspect(),clip=w.libraryList({limit:100}).entries.find(e=>e.name==='Idle_A');w.fromClip({clipId:clip.id,time:0,modelKey:s.modelKey,revision:s.revision});const base=w.modelInspect().rootTransform,a=await w.saveDraft({name:'界面基准',confirmed:true});w.fromLibrary({poseId:a.id});w.setRootTransform({position:[base.position[0]+1,base.position[1]+.7,base.position[2]],quaternion:base.quaternion});const b=await w.saveDraft({name:'界面高点',confirmed:true});w.timeline.append({assetId:a.id,duration:.2});w.timeline.append({assetId:b.id,duration:.2,transition:.4});await w.timeline.save({name:'位移界面示意',confirmed:true});w.preview({time:.6,playing:false});return {...base,name:w.rigList({limit:100}).entries.find(e=>e.id===base.id).name};
 });
 await page.locator('#previewVerticalMotion').uncheck();await expect(page.locator('#previewHorizontalMotion')).toBeChecked();
 const current=await page.evaluate(async()=>{const {workbench:w}=await import('/labs/motion/motion.bundle.js');return {s:w.inspect(),root:w.modelInspect().rootTransform};});expect(current.s.rootMotion).toEqual({horizontal:true,vertical:false});expect(current.root.position[1]).toBeCloseTo(base.position[1],5);
 await page.locator('#exportMotion').click();await expect(page.locator('#exportVerticalMotion')).not.toBeChecked();await expect(page.locator('#exportHorizontalMotion')).toBeChecked();await page.locator('#exportSearch').fill('位移界面示意');await page.locator('#exportEntries input').check();
 const pending=page.waitForEvent('download');await page.locator('#confirmMotionExport').click();const download=await pending,data=await readFile(await download.path()),gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');const mixer=new AnimationMixer(gltf.scene),action=mixer.clipAction(gltf.animations[0]).setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(.6);gltf.scene.updateMatrixWorld(true);const point=gltf.scene.getObjectByName(base.name).getWorldPosition(new Vector3());expect(point.y).toBeCloseTo(base.position[1],4);expect(point.x).toBeCloseTo(base.position[0]+1,4);mixer.stopAllAction();
 await page.locator('#exportMotion').click();await page.locator('#exportSearch').fill('位移界面示意');await page.locator('#exportEntries input').check();await page.locator('#exportVerticalMotion').check();await page.locator('#cancelMotionExport').click();await expect(page.locator('#previewVerticalMotion')).not.toBeChecked();await page.locator('#previewVerticalMotion').check();const restored=await page.evaluate(async()=>{const {workbench:w}=await import('/labs/motion/motion.bundle.js');return w.modelInspect().rootTransform;});expect(restored.position[1]).toBeCloseTo(base.position[1]+.7,5);
});
