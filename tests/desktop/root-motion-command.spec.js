import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {AnimationMixer,LoopOnce,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {waitForModel} from '../motion-lab/model-ready-helper.js';
import {desktopPackage} from '../helpers/desktop-package.js';
const require=createRequire(import.meta.url),{sendQuery}=require('../../desktop/control/client.cjs');
test('位移开关：真实四模式GLB与预览/轨迹一致，截图录像可用，原姿势与动作保留',async()=>{
 const root=resolve('.'),exe=await desktopPackage('acceptance');await mkdir(join(root,'output/root-motion-acceptance'),{recursive:true});const personal=await mkdtemp(join(root,'output/root-motion-acceptance/personal-'));
 const env={...process.env,MOTIONDECK_DATA_DIR:personal,MOTIONDECK_DEV_AUTO_CONTROL:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const client=await electron.launch({executablePath:exe,args:['--smoke-hidden'],env,timeout:30000});
 const query=async(operation,args={})=>{const s=await sendQuery(personal,{operation:'session.inspect'});const r=await sendQuery(personal,{operation,args,modelKey:s.result.modelKey,expectedRevision:s.revision});expect(r.ok,JSON.stringify(r)).toBe(true);return r.result;};
 try{
  const page=await client.firstWindow();await waitForModel(page,{actions:162});
  const library=await query('library.list',{limit:100}),clip=library.entries.find(e=>e.name==='Idle_A');
  await query('pose.fromClip',{clipId:clip.id,time:0});const base=(await query('model.inspect')).rootTransform,rig=(await query('rig.list',{limit:100})).entries,rootName=rig.find(b=>b.id===base.id).name;
  const a=await query('pose.save',{name:'基准',confirmed:true});await query('pose.fromLibrary',{poseId:a.id});await query('pose.setRootTransform',{position:[base.position[0]+1,base.position[1]+.7,base.position[2]+.4],quaternion:base.quaternion});const b=await query('pose.save',{name:'高点位移',confirmed:true});
  await query('timeline.append',{assetId:a.id,duration:.2,interpolation:'continuous'});await query('timeline.append',{assetId:b.id,duration:0,transition:.4,interpolation:'continuous'});await query('timeline.append',{assetId:a.id,duration:.2,transition:.4,interpolation:'continuous'});
  const recipe=await query('timeline.inspect'),proof=[];
  for(const horizontal of [true,false])for(const vertical of [true,false]){
   const policy={horizontal,vertical};await query('preview.setRootMotion',policy);await query('preview.sequence',{time:.6,playing:false});
   expect(await page.locator('#previewHorizontalMotion').isChecked()).toBe(horizontal);expect(await page.locator('#previewVerticalMotion').isChecked()).toBe(vertical);
   const actual=(await query('model.inspect')).rootTransform.position,expected=[base.position[0]+(horizontal?1:0),base.position[1]+(vertical?.7:0),base.position[2]+(horizontal?.4:0)];expected.forEach((v,i)=>expect(actual[i]).toBeCloseTo(v,5));
   const samples=await query('sequence.sample',{times:[0,.6,1.2],boneIds:[base.id]});expected.forEach((v,i)=>expect(samples.samples[1].bones[0].position[i]).toBeCloseTo(v,5));
   const exported=await query('export.glb',{name:`位移-${horizontal}-${vertical}`,confirmed:true}),data=await readFile(exported.file.path),gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
   const mixer=new AnimationMixer(gltf.scene),action=mixer.clipAction(gltf.animations[0]).setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(.6);gltf.scene.updateMatrixWorld(true);const bone=gltf.scene.getObjectByName(rootName),world=bone.getWorldPosition(new Vector3()).toArray();expected.forEach((v,i)=>expect(world[i]).toBeCloseTo(v,4));mixer.stopAllAction();
   // 关闭输出位移也不抹掉制作源，取帧草稿仍然含完整高度与水平位移。
   await query('pose.fromSequence',{time:.6});const raw=(await query('model.inspect')).rootTransform.position;expect(raw[1]).toBeCloseTo(base.position[1]+.7,5);expect(raw[0]).toBeCloseTo(base.position[0]+1,5);await query('pose.discard');
   proof.push({policy,actual,exported,samples});
  }
  const before=await query('session.inspect'),capture=await query('view.captureSequence',{times:[0,.6,1.2],views:['right'],options:{width:640,height:480,framing:'motion',ground:true}}),video=await query('export.video',{name:'去整体位移示意',confirmed:true,start:0,end:1.2,options:{width:640,height:480,framing:'motion',ground:true}});expect(await query('session.inspect')).toEqual(before);expect((await query('timeline.inspect')).items).toEqual(recipe.items);
  // 本次导出覆盖不反写当前预览设置。
  await query('export.glb',{name:'临时保留全部',confirmed:true,rootMotion:{horizontal:true,vertical:true}});expect((await query('session.inspect')).rootMotion).toEqual({horizontal:false,vertical:false});
  await writeFile(join(root,'output/root-motion-acceptance/proof.json'),JSON.stringify({testedAt:new Date().toISOString(),exe,personal,proof,capture,video},null,2),'utf8');
 }finally{await client.close();}
});
