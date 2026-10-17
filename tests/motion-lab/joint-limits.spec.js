import {test,expect} from '@playwright/test';
import {waitForModel} from './model-ready-helper.js';
import {rotateJoint} from '../helpers/rotate-joint.js';

async function snapshot(page){return page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js'),s=c.getState(),pose=[];c.root.traverse(n=>pose.push({p:n.position.toArray(),q:n.quaternion.toArray(),s:n.scale.toArray()}));return {pose,q:c.selected?.node.quaternion.toArray(),feedback:s.jointConstraintFeedback,residual:s.jointConstraintResidual,history:s.poseDraft?.undo.length,busy:s.busy,mode:s.jointConstraintMode};});}
async function reference(page){return page.evaluate(async()=>{const {workbench:w}=await import('/labs/motion/motion.bundle.js');const rig=w.rigList({limit:100});w.setBones(rig.entries.filter(e=>e.jointLimit.status==='calibrated').map(e=>({id:e.id,quaternion:e.jointLimit.reference})));return w.rigList({limit:100});});}
for(const model of ['Mesh2Motion','Quaternius']){
 test(`${model}旧超限姿势拖骨盆不隐式修正或滑脚`,async({page})=>{
  await page.goto('/');await waitForModel(page,{actions:162});if(model==='Quaternius'){await page.locator('#replaceModel').selectOption({label:model});await waitForModel(page,{actions:117});}await page.locator('#editPose').click();
  const inspect=()=>page.evaluate(async()=>{const {bodyControls:c,workbench:w}=await import('/labs/motion/motion.bundle.js');return {summary:w.jointConstraintSummary(),feet:c.pelvis.chain.legs.map(l=>l.end.getWorldPosition(l.end.position.clone()).toArray()),pose:c.getState().poseDraft.pose,history:c.getState().poseDraft.undo.length,feedback:c.pelvis.feedback,residual:c.pelvis.residual};});
  const before=await inspect(),handle=await page.locator('.body-handle[data-part="骨盆"]').boundingBox();await page.mouse.move(handle.x+8,handle.y+8);await page.mouse.down();await page.mouse.move(handle.x+8,handle.y+28,{steps:12});await page.mouse.up();const after=await inspect();
  expect(before.summary.violations.length).toBeGreaterThan(0);expect(after.pose).toEqual(before.pose);expect(after.history).toBe(0);expect(after.feedback.length).toBeGreaterThan(0);expect(after.residual).toBeGreaterThan(0);
  after.feet.forEach((p,i)=>expect(Math.hypot(...p.map((v,k)=>v-before.feet[i][k]))).toBeLessThan(.0001));
 });
 test(`${model}自然约束：真实旋转触边、立即反向、撤销取消与保存回读`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await waitForModel(page,{actions:162});if(model==='Quaternius'){await page.locator('#replaceModel').selectOption({label:model});await waitForModel(page,{actions:117});}
  await page.locator('#viewPreset').selectOption('front');await page.locator('#editPose').click();const rig=await reference(page);await expect(page.getByRole('button',{name:'自然约束',exact:true})).toHaveAttribute('aria-pressed','true');
  const original=await snapshot(page);let boundary,reversed;
  await rotateJoint(page,{joint:'右肘',axis:'X',dx:500,dy:-450,during:async({end})=>{
   boundary=await snapshot(page);expect(boundary.busy).toBe(true);expect(boundary.feedback.length).toBeGreaterThan(0);await expect(page.locator('.joint-limit-status')).toHaveText('已到关节边界');
   // 超调450像素之后只回退8像素，就必须离开边界；不能等拖回起点。
   await page.mouse.move(end.x-8,end.y+8);reversed=await snapshot(page);expect(reversed.q).not.toEqual(boundary.q);
  }});
  const after=await snapshot(page);expect(after.busy).toBe(false);expect(after.history).toBe(original.history+1);expect(after.pose.map(p=>[p.p,p.s])).toEqual(original.pose.map(p=>[p.p,p.s]));
  await page.locator('#undoDrag').click();expect((await snapshot(page)).pose).toEqual(original.pose);await page.locator('#redoRotation').click();expect((await snapshot(page)).pose).toEqual(after.pose);
  await rotateJoint(page,{joint:'右肘',axis:'X',dx:-260,dy:200,cancel:true});expect((await snapshot(page)).pose).toEqual(after.pose);expect((await snapshot(page)).history).toBe(after.history);
  await page.getByRole('button',{name:'自由编辑',exact:true}).click();expect((await snapshot(page)).pose).toEqual(after.pose);await page.getByRole('button',{name:'自然约束',exact:true}).click();expect((await snapshot(page)).pose).toEqual(after.pose);
  const result=await page.evaluate(async()=>{const {workbench:w}=await import('/labs/motion/motion.bundle.js');return w.saveDraft({name:'关节约束验收',confirmed:true});});await page.reload();await waitForModel(page,{actions:model==='Quaternius'?117:162});
  const saved=await page.evaluate(async id=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js');return c.getState().poses.find(p=>p.id===id).pose;},result.id);expect(saved.map(p=>({p:p.p,q:p.q,s:p.s}))).toEqual(after.pose);
  expect(rig.jointConstraints.calibrated).toBe(50);expect(errors).toEqual([]);
 });
 test(`${model}自然约束：拖手只动小臂、腕部随动，整个人不受关节范围限制`,async({page})=>{
  await page.goto('/');await waitForModel(page,{actions:162});if(model==='Quaternius'){await page.locator('#replaceModel').selectOption({label:model});await waitForModel(page,{actions:117});}
  await page.locator('#viewPreset').selectOption('perspective');await page.locator('#editPose').click();const rig=await reference(page);
  const joints=()=>page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js');const chain=c.limbs.find(l=>l.chain.name==='右手').chain;return {elbow:chain.middle.getWorldPosition(chain.middle.position.clone()).toArray(),q:chain.end.quaternion.toArray(),upper:chain.upper.quaternion.toArray()};});const before=await joints();
  const point=await page.evaluate(async rig=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js'),chain=c.limbs.find(l=>l.chain.name==='右手').chain,config=rig.entries.find(e=>e.name===chain.middle.name).jointLimit,Q=chain.middle.quaternion.constructor,V=chain.middle.position.constructor,axis=new V(1,0,0).applyQuaternion(new Q(...config.frame)).applyQuaternion(chain.middle.getWorldQuaternion(new Q())),pivot=chain.middle.getWorldPosition(new V()),start=chain.end.getWorldPosition(new V()),target=start.clone().sub(pivot).applyAxisAngle(axis,.6).add(pivot).project(c.camera),box=c.canvas.getBoundingClientRect();return {x:box.x+(target.x+1)*box.width/2,y:box.y+(1-target.y)*box.height/2};},rig);
  const handle=await page.locator('.body-handle[data-part="右手腕"]').boundingBox(),pose=(await snapshot(page)).pose;await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(point.x,point.y,{steps:12});await page.mouse.up();const after=await joints();expect((await snapshot(page)).pose).not.toEqual(pose);expect(after.elbow).toEqual(before.elbow);expect(after.upper).toEqual(before.upper);expect(after.q).toEqual(before.q);
  const report=await page.evaluate(async()=>{const {workbench:w}=await import('/labs/motion/motion.bundle.js');return w.jointConstraintSummary();});expect(report.violations).toEqual([]);
  await page.getByRole('button',{name:'整体调整',exact:true}).click();await expect(page.getByRole('group',{name:'关节约束',exact:true}).getByRole('button')).toHaveCount(2);await expect(page.getByRole('button',{name:'自然约束',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'自由编辑',exact:true})).toBeDisabled();const unchanged=await snapshot(page);await page.getByRole('button',{name:'摆姿',exact:true}).click();expect((await snapshot(page)).pose).toEqual(unchanged.pose);
  await page.screenshot({path:`output/acceptance/joint-constraints-${model}.png`});
 });
}

for(const model of ['Mesh2Motion','Quaternius'])test(`${model}约束分段按钮排版与键盘切换`,async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});if(model==='Quaternius'){await page.locator('#replaceModel').selectOption({label:model});await waitForModel(page,{actions:117});}await page.locator('#editPose').click();
 const group=page.getByRole('group',{name:'关节约束',exact:true}),natural=group.getByRole('button',{name:'自然约束'}),free=group.getByRole('button',{name:'自由编辑'}),before=await snapshot(page);
 await expect(page.locator('.view-head #editPose')).toHaveText('退出编辑');
 await expect(group.locator('select')).toHaveCount(0);await expect(natural).toHaveAttribute('aria-pressed','true');await free.click();await expect(free).toHaveAttribute('aria-pressed','true');await expect(natural).toHaveAttribute('aria-pressed','false');await expect(page.locator('.joint-limit-status')).toBeHidden();
 await natural.focus();await page.keyboard.press('Space');await expect(natural).toHaveAttribute('aria-pressed','true');expect((await snapshot(page)).pose).toEqual(before.pose);expect((await snapshot(page)).history).toBe(before.history);
 for(const [width,height] of [[1440,900],[1100,760],[1000,600]]){await page.setViewportSize({width,height});const bounds=await group.evaluate(el=>{const bar=el.closest('#viewportPoseTools').getBoundingClientRect(),stage=document.querySelector('#stage').getBoundingClientRect(),player=document.querySelector('.player').getBoundingClientRect(),library=document.querySelector('.library').getBoundingClientRect(),items=[...el.closest('.body-tool-switch').children,...document.querySelectorAll('#viewportPoseTools .icon-button')].filter(n=>!n.hidden).map(n=>n.getBoundingClientRect());return {besideCanvas:bar.left>=stage.right-1,fullPlayer:Math.abs(player.left-stage.left)<1&&player.right>=bar.right-1&&player.top>=bar.bottom-1,panelRight:bar.right<=innerWidth,libraryVisible:library.left>=0&&library.right<=stage.left,overflow:document.documentElement.scrollWidth>innerWidth,overlap:items.some((a,i)=>items.some((b,j)=>i<j&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1))};});expect(bounds).toEqual({besideCanvas:true,fullPlayer:true,panelRight:true,libraryVisible:true,overflow:false,overlap:false});await expect(page.locator('.view-head #capturePose')).toBeInViewport();await expect(page.locator('#exitPoseEditor,.pose-editor-actions,#viewportPoseTools #capturePose')).toHaveCount(0);await expect(natural).toBeInViewport();await page.locator('#undoDrag').scrollIntoViewIfNeeded();await expect(page.locator('#undoDrag')).toBeInViewport();await expect(page.locator('#redoRotation')).toBeInViewport();await expect(page.locator('.view-head #editPose')).toHaveAttribute('aria-pressed','true');await expect(page.locator('.player #editPose,.player #capturePose')).toHaveCount(0);await page.locator('#poseEditorContent').evaluate(el=>{el.scrollTop=0;});await page.locator('#editPose').focus();await page.screenshot({path:`output/acceptance/pose-sidebar-${model}-${width}.png`});}
 await page.locator('#editPose').click();await page.getByRole('button',{name:'放弃',exact:true}).click();await expect(page.locator('#viewportPoseTools')).toBeHidden();await expect(page.locator('.view-head #editPose')).toHaveAttribute('aria-pressed','false');await expect(page.locator('.view-head #capturePose')).toBeVisible();
});

test('两组切换滑块真实移动且遵循减少动态效果',async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});await page.locator('#editPose').click();
 const read=group=>group.evaluate(el=>({transform:getComputedStyle(el,'::before').transform,duration:getComputedStyle(el,'::before').transitionDuration}));
 for(const [label,next,back]of [['调整方式','整体调整','摆姿'],['关节约束','自由编辑','自然约束']]){
  const group=page.getByRole('group',{name:label,exact:true});await group.evaluate(el=>el.getAnimations({subtree:true}).forEach(a=>a.finish()));const first=await read(group);await group.getByRole('button',{name:next,exact:true}).click();
  const positions=await group.evaluate(async el=>{const samples=[];for(let i=0;i<16;i++){await new Promise(requestAnimationFrame);samples.push(getComputedStyle(el,'::before').transform);}return samples;});expect(new Set(positions).size).toBeGreaterThan(2);expect(positions.at(-1)).not.toBe(first.transform);await group.getByRole('button',{name:back,exact:true}).click();
 }
 await page.emulateMedia({reducedMotion:'reduce'});for(const group of await page.locator('.pose-mode-slider').all())expect((await read(group)).duration).toBe('0s');
 await page.locator('#editPose').focus();await page.locator('#viewportPoseTools').screenshot({path:'output/acceptance/pose-mode-sliders.png'});
});
