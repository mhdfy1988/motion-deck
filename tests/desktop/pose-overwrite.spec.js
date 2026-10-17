import {test,expect,_electron as electron} from '@playwright/test';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {desktopPackage} from '../helpers/desktop-package.js';
import {waitForModel} from '../motion-lab/model-ready-helper.js';
import {rotateJoint} from '../helpers/rotate-joint.js';

test('真实客户端自定义与AI姿势确认覆盖，取消保留并重启回读同一ID',async()=>{
 const executablePath=await desktopPackage('public'),root=resolve('output/desktop-tests');await mkdir(root,{recursive:true});const dataDir=await mkdtemp(join(root,'pose-overwrite-')),env={...process.env,MOTIONDECK_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;let client;
 const launch=async()=>{client=await electron.launch({executablePath,args:['--smoke-hidden'],env});const page=await client.firstWindow();await waitForModel(page,{actions:162});return page;};
 const inspect=(page,id)=>page.evaluate(async id=>{const {bodyControls:c,workbench:w}=await import('./motion.bundle.js'),s=c.getState();return {count:s.poses.length,entry:structuredClone(s.poses.find(p=>p.id===id)),workspace:structuredClone(s.aiWorkspace),draft:w.inspect().draft};},id);
 try{
  let page=await launch();const saved=[];
  for(const ai of [false,true]){
   const source=await page.evaluate(async ai=>{const {workbench:w}=await import('./motion.bundle.js');w.fromLibrary({poseId:w.libraryList({kind:'pose',limit:1}).entries[0].id});return w.saveDraft({name:ai?'AI覆盖验证':'普通覆盖验证',confirmed:true,assistant:ai,role:'key'});},ai);
   await page.locator(ai?'#library-ai':'#library-pose').click();await page.locator(`#clips [data-pose-id="${source.id}"]`).click();const before=await inspect(page,source.id);await page.locator('#editPose').click();await rotateJoint(page);const edited=await inspect(page,source.id);
   await page.locator('#capturePose').click();await expect(page.locator('#savePoseDialog')).toBeHidden();await page.getByRole('button',{name:'取消',exact:true}).click();expect(await inspect(page,source.id)).toEqual(edited);
   await page.locator('#capturePose').click();await page.getByRole('button',{name:'覆盖',exact:true}).click();await expect(page.locator('#editPose')).toHaveText('编辑姿势');const after=await inspect(page,source.id);expect(after.count).toBe(before.count);expect(after.entry.id).toBe(source.id);expect(after.entry.name).toBe(source.name);expect(after.entry.pose).not.toEqual(before.entry.pose);expect(after.draft).toBeNull();
   if(ai){expect(after.workspace.tasks).toHaveLength(1);expect(after.workspace.tasks[0].entries).toHaveLength(1);expect(after.workspace.tasks[0].entries[0].protected).toBe(true);}saved.push(after.entry);
  }
  await client.close();client=null;page=await launch();for(const entry of saved)expect((await inspect(page,entry.id)).entry).toEqual(entry);
 }finally{if(client){const page=await client.firstWindow();await page.evaluate(async()=>{const {workbench}=await import('./motion.bundle.js');if(workbench.inspect().draft)workbench.discardDraft();}).catch(()=>{});await client.close();}}
});
