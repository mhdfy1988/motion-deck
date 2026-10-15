import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {waitForModel} from '../motion-lab/model-ready-helper.js';
import {desktopPackage} from '../helpers/desktop-package.js';
const exec=promisify(execFile);

test('正式包拒绝自动授权，隔离验收预览显式开启时三项权限可用',async()=>{
 const root=resolve('.'),executablePath=await desktopPackage('acceptance'),publicExe=await desktopPackage('public');
 await mkdir(join(root,'output/dev-control-tests'),{recursive:true});
 const publicData=await mkdtemp(join(root,'output/dev-control-tests/public-'));
 const publicEnv={...process.env,MOTIONDECK_DATA_DIR:publicData,MOTIONDECK_DEV_AUTO_CONTROL:'1'};delete publicEnv.ELECTRON_RUN_AS_NODE;
 const publicClient=await electron.launch({executablePath:publicExe,args:['--smoke-hidden'],env:publicEnv,timeout:30000});
 try{
  const page=await publicClient.firstWindow();await waitForModel(page,{actions:162});
  expect(await page.evaluate(()=>window.motionDeckDesktop.controlState())).toMatchObject({enabled:false,access:'read-only',timelineWrite:false});
 }finally{await publicClient.close();}
 const dataDir=await mkdtemp(join(root,'output/dev-control-tests/profile-'));
 const env={...process.env,MOTIONDECK_DATA_DIR:dataDir,MOTIONDECK_DEV_AUTO_CONTROL:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const client=await electron.launch({executablePath,args:['--smoke-hidden'],env,timeout:30000});
 const command=async(operation,args={},expected)=>{
  const file=join(dataDir,randomUUID()+'.json');await writeFile(file,JSON.stringify({operation,args,...expected}),'utf8');
  return JSON.parse((await exec(process.execPath,[join(root,'scripts/motion-command.mjs'),'--data-dir',dataDir,'--request',file],{windowsHide:true,timeout:35000})).stdout);
 };
 try{
  const page=await client.firstWindow();await waitForModel(page,{actions:162});
  await expect.poll(()=>page.evaluate(()=>window.motionDeckDesktop.controlState()),{timeout:15000}).toMatchObject({enabled:true,access:'pose-write',timelineWrite:true});
  const state=await command('session.inspect');expect(state.ok).toBe(true);
  const library=await command('library.list',{limit:1}),clip=library.result.entries[0];
  const write=async(operation,args={})=>{const info=await command('session.inspect');return command(operation,args,{modelKey:info.result.modelKey,expectedRevision:info.revision});};
  expect((await write('pose.fromClip',{clipId:clip.id,time:0})).ok).toBe(true);
  expect((await write('pose.discard')).ok).toBe(true);
  const added=await write('timeline.append',{assetId:clip.id,duration:1});expect(added.ok).toBe(true);
  expect((await write('timeline.remove',{ids:[added.result.id]})).ok).toBe(true);
 }finally{await client.close();}
});
