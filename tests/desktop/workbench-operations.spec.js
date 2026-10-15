import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {waitForModel} from '../motion-lab/model-ready-helper.js';

test('A1 实际客户端：两个模型共享操作/视图、取帧草稿与回退',async()=>{
 const root=resolve('.');await mkdir(join(root,'output/a1-acceptance'),{recursive:true});
 const dataDir=await mkdtemp(join(root,'output/a1-acceptance/profile-'));
 const executablePath=process.env.MOTIONDECK_PACKAGED_EXE??createRequire(import.meta.url)('electron'),env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
 const client=await electron.launch({executablePath,args:process.env.MOTIONDECK_PACKAGED_EXE?['--smoke-hidden']:[root,'--smoke-hidden'],env,timeout:30000});
 try{
  const page=await client.firstWindow(),errors=[],proof=[];page.on('pageerror',error=>errors.push(error.message));
  await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await waitForModel(page,{actions:162});
  for(const [model,actions] of [['mesh2motion',162],['quaternius',117]]){
   if(model==='quaternius'){await page.locator('#replaceModel').selectOption(model);await waitForModel(page,{actions});}
   const result=await page.evaluate(async()=>{
    const {workbench}=await import('motiondeck://app/labs/motion/motion.bundle.js'),before=workbench.inspect(),clip=workbench.libraryList({limit:1}).entries[0];
    const frame=workbench.fromClip({clipId:clip.id,time:.05,modelKey:before.modelKey,revision:before.revision});
    const bones=workbench.rigList({limit:2});await new Promise(resolve=>{let frames=0;const next=()=>++frames===12?resolve():requestAnimationFrame(next);requestAnimationFrame(next);});
    const stable=JSON.stringify(workbench.rigList({limit:2}).entries)===JSON.stringify(bones.entries),state=workbench.inspect();
    return {before,frame,stable,state,model:workbench.modelInspect()};
   });
   expect(result.before.counts.actions).toBe(actions);expect(result.stable).toBe(true);expect(result.state.editingContext).toBe('pose-draft');expect(result.state.playing).toBe(false);
   await expect(page.locator('#currentClip')).toContainText('动作取帧');await page.screenshot({path:join(root,'output/a1-acceptance',model+'-draft.png')});
   await page.evaluate(async()=>{const {workbench}=await import('motiondeck://app/labs/motion/motion.bundle.js');workbench.discardDraft();});await expect(page.locator('#previewContext')).toHaveText('源动作');proof.push(result);
  }
  expect(errors).toEqual([]);await writeFile(join(root,'output/a1-acceptance/client-proof.json'),JSON.stringify({testedAt:new Date().toISOString(),executablePath,pid:client.process().pid,dataDir,url:page.url(),proof},null,2)+'\n','utf8');
 }finally{await client.close();}
});
