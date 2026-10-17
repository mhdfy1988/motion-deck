import {test,expect} from '@playwright/test';
import {waitForModel} from './model-ready-helper.js';
import {rotateJoint} from '../helpers/rotate-joint.js';

test('编辑事件组件真实捕获隔离、离开保护及销毁后不残留',async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});
 const result=await page.evaluate(async()=>{
  const {bindEditSessionView}=await import('/labs/motion/ui/edit-session-view.js');
  const host=document.createElement('section');host.innerHTML='<details><span class="mode-label"></span></details><div data-source></div><button data-edit>编辑</button><button data-undo>撤销</button><button data-reset>重置</button><div class="timeline"><button data-conflict>冲突操作</button></div>';document.body.append(host);
  const $=selector=>host.querySelector(selector),calls=[];let context={hasDraft:false},protect=false;
  const view=bindEditSessionView({documentTarget:host,windowTarget:window,body:host,panel:$('details'),sourcePanel:$('[data-source]'),editButton:$('[data-edit]'),undoButton:$('[data-undo]'),resetButton:$('[data-reset]'),timeline:$('.timeline'),poseLayout:{sync:value=>calls.push(['editing',value])},advancedTools:false,icons:{'redo-2':'R'},stopMotion:()=>{},onToggle:()=>calls.push('toggle'),onPanelChanged:()=>calls.push('panel'),onHistory:direction=>calls.push(direction),getInputState:()=>context,preventUnload:()=>protect,onBlocked:()=>calls.push('blocked'),onTimelineHistory:direction=>calls.push('timeline:'+direction),onTimelineAll:()=>calls.push('all')});
  const click=target=>target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
  click($('[data-edit]'));click($('[data-undo]'));click($('#redoRotation'));
  context={hasDraft:true,origin:'user'};const conflict=$('[data-conflict]');let activated=0;conflict.addEventListener('click',()=>activated++);
  const blocked=!click(conflict);conflict.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));
  protect=true;const before=new Event('beforeunload',{cancelable:true});window.dispatchEvent(before);
  view.renderEditing(true);view.renderHistory({undoDisabled:false,redoDisabled:true});const rendered=host.classList.contains('pose-editing')&&$('[data-source]').hidden&&$('#redoRotation').disabled;
  const expectedCalls=['toggle','undo','redo','blocked','undo',['editing',true]],beforeDispose=JSON.stringify(calls);
  view.dispose();const allowed=click(conflict),after=new Event('beforeunload',{cancelable:true});window.dispatchEvent(after);
  const result={blocked,rendered,guardedExit:before.defaultPrevented,allowedAfterDispose:allowed&&!after.defaultPrevented,activated,calls,expectedCalls,unchanged:beforeDispose===JSON.stringify(calls),removed:!$('#redoRotation')};host.remove();return result;
 });
 expect(result.calls).toEqual(result.expectedCalls);expect(result).toMatchObject({blocked:true,rendered:true,guardedExit:true,allowedAfterDispose:true,activated:1,unchanged:true,removed:true});
});

for(const model of ['Mesh2Motion','Quaternius'])for(const scenario of ['空白点击','退出重进'])test(`${model}旋转环选择清理：${scenario}`,async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});if(model==='Quaternius'){await page.locator('#replaceModel').selectOption({label:model});await waitForModel(page,{actions:117});}await page.locator('#editPose').click();
 const selection=()=>page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js'),state=c.getState(),pose=[];c.root.traverse(n=>pose.push([n.position.toArray(),n.quaternion.toArray(),n.scale.toArray()]));return {selected:c.selected?.node.name??null,attached:!!c.gizmo.object,visible:c.gizmo.getHelper().visible,history:state.poseDraft?.undo.length??0,pose};});
 const initial=await selection();await page.locator('.body-handle[data-part="右手腕"]').dblclick();await expect.poll(async()=>(await selection()).visible).toBe(true);const chosen=await selection();expect(chosen.selected).toBeTruthy();
 if(scenario==='空白点击'){const box=await page.locator('#stage canvas').boundingBox();await page.mouse.click(box.x+70,box.y+140);await expect.poll(async()=>(await selection()).attached).toBe(false);const cleared=await selection();expect(cleared.selected).toBe(null);expect(cleared.visible).toBe(false);expect(cleared.history).toBe(0);expect(cleared.pose).toEqual(initial.pose);await page.locator('.body-handle[data-part="右手腕"]').dblclick();await expect.poll(async()=>(await selection()).visible).toBe(true);}
 else{await page.locator('#editPose').click();await expect(page.locator('#motionConfirmDialog')).toBeVisible();await page.getByRole('button',{name:'取消',exact:true}).click();expect((await selection()).selected).toBe(chosen.selected);await page.locator('#editPose').click();await page.getByRole('button',{name:'放弃',exact:true}).click();await expect(page.locator('#editPose')).toHaveAttribute('aria-pressed','false');await page.locator('#editPose').click();await expect.poll(async()=>(await selection()).attached).toBe(false);const reopened=await selection();expect(reopened.selected).toBe(null);expect(reopened.visible).toBe(false);expect(reopened.history).toBe(0);expect(reopened.pose).toEqual(initial.pose);}
});
import {placeAction} from './drag-source-helper.js';

for(const ai of [false,true])test(`编辑${ai?'AI工作区':'自定义'}姿势确认覆盖，取消保留且刷新不增条目`,async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});
 const original=await page.evaluate(async ai=>{const {workbench:w}=await import('/labs/motion/motion.bundle.js');const source=w.libraryList({kind:'pose',limit:1}).entries[0];w.fromLibrary({poseId:source.id});return w.saveDraft({name:'覆盖目标',confirmed:true,assistant:ai,role:'key'});},ai);
 await page.locator(ai?'#library-ai':'#library-pose').click();const row=page.locator(`#clips [data-pose-id="${original.id}"]`);await row.click();await page.locator('#editPose').click();
 const inspect=()=>page.evaluate(async id=>{const {bodyControls:c,workbench:w}=await import('/labs/motion/motion.bundle.js'),s=c.getState();return {draft:w.inspect().draft,pose:structuredClone(s.poses.find(p=>p.id===id)),count:s.poses.length,workspace:structuredClone(s.aiWorkspace),rig:w.rigList({limit:100}).entries};},original.id),before=await inspect();
 await rotateJoint(page);const edited=await inspect();await page.locator('#capturePose').click();
 await expect(page.locator('#savePoseDialog')).toBeHidden();await expect(page.locator('#motionConfirmDialog')).toContainText('覆盖目标');await page.getByRole('button',{name:'取消',exact:true}).click();expect(await inspect()).toEqual(edited);await expect(page.locator('#editPose')).toHaveAttribute('aria-pressed','true');
 await page.locator('#capturePose').click();await page.getByRole('button',{name:'覆盖',exact:true}).click();await expect(page.locator('#editPose')).toHaveAttribute('aria-pressed','false');const after=await inspect();expect(after.count).toBe(before.count);expect(after.pose.id).toBe(before.pose.id);expect(after.pose.name).toBe(before.pose.name);expect(after.pose.pose).not.toEqual(before.pose.pose);expect(after.rig).toEqual(edited.rig);expect(after.draft).toBeNull();
 if(ai){expect(after.workspace.tasks).toHaveLength(1);expect(after.workspace.tasks[0].entries).toHaveLength(1);expect(after.workspace.tasks[0].entries[0].protected).toBe(true);expect(after.workspace.tasks[0].entries[0].assetId).toBe(original.id);}
 await page.reload();await waitForModel(page,{actions:162});expect((await inspect()).pose).toEqual(after.pose);expect((await inspect()).count).toBe(after.count);
});

for(const from of ['动作','默认姿势'])test(`编辑${from}保存仍新建，不覆盖旧姿势`,async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});
 if(from==='默认姿势'){await page.locator('#library-pose').click();await page.locator('#clips [data-pose-id^="builtin:"]').first().click();}
 const before=await page.evaluate(async()=>{const {bodyControls}=await import('/labs/motion/motion.bundle.js');return structuredClone(bodyControls.getState().poses);});await page.locator('#editPose').click();
 await rotateJoint(page);await page.locator('#capturePose').click();await expect(page.locator('#savePoseDialog')).toBeVisible();await expect(page.locator('#motionConfirmDialog')).toBeHidden();
 await page.locator('#poseName').fill(`${from}新姿势`);await page.locator('#confirmPoseSave').click();await expect(page.locator('#savePoseDialog')).toBeHidden();
 const after=await page.evaluate(async()=>{const {bodyControls}=await import('/labs/motion/motion.bundle.js');return structuredClone(bodyControls.getState().poses);});expect(after).toHaveLength(before.length+1);for(const pose of before)expect(after.find(p=>p.id===pose.id)).toEqual(pose);
});

for(const kind of ['动作','姿势','自定义动作'])test(`编辑草稿拒绝拖入${kind}，退出后恢复放置`,async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});await placeAction(page,page.locator('#clips [data-clip-index]').first());await placeAction(page,page.locator('#clips [data-clip-index]').nth(1));
 if(kind==='自定义动作'){await page.locator('#saveAction').click();await page.locator('#actionName').fill('拖放隔离验证');await page.locator('#confirmSave').click();await expect(page.locator('#saveActionDialog')).toBeHidden();}
 if(kind==='姿势')await page.locator('#library-pose').click();
 const source=page.locator(kind==='姿势'?'#clips [data-pose-id]':kind==='自定义动作'?'#clips [data-custom-id]':'#clips [data-clip-index]').first();await source.scrollIntoViewIfNeeded();await page.locator('#editPose').click();
 const inspect=()=>page.evaluate(async()=>{const {workbench,bodyControls}=await import('/labs/motion/motion.bundle.js');return {workbench:workbench.inspect(),rig:workbench.rigList({limit:100}).entries,items:bodyControls.getState().items.map(i=>({id:i.id,kind:i.kind,name:i.name,duration:i.duration,transition:i.transition}))};}),before=await inspect();
 await placeAction(page,source,undefined,async()=>{await expect(page.locator('.timeline-drag-ghost')).toHaveCount(0);await expect(page.locator('.timeline-drop')).toBeHidden();});
 expect(await inspect()).toEqual(before);await expect(page.locator('#segments button.action,#segments button.pose')).toHaveCount(2);
 await page.locator('#editPose').click();await page.getByRole('button',{name:'放弃',exact:true}).click();await placeAction(page,source);await expect(page.locator('#segments button.action,#segments button.pose')).toHaveCount(3);
});

for(const moveAfter of [false,true])test(`拖放途中进入编辑${moveAfter?'再移动':'直接松手'}不提交`,async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});
 await placeAction(page,page.locator('#clips [data-clip-index]').first(),undefined,async()=>{
  await expect(page.locator('.timeline-drop')).toBeVisible();await page.evaluate(async()=>{const {workbench}=await import('/labs/motion/motion.bundle.js');workbench.beginUserDraft();});
  if(moveAfter){const box=await page.locator('#segments').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await expect(page.locator('.timeline-drag-ghost')).toHaveCount(0);}
 });
 await expect(page.locator('#segments button')).toHaveCount(0);await expect(page.locator('.timeline-drag-ghost')).toHaveCount(0);await expect(page.locator('.timeline-drop')).toBeHidden();
});

for(const [from,to,count] of [['Mesh2Motion','Quaternius',117],['Quaternius','Mesh2Motion',162]])test(`${from}编辑中切换${to}完整清理，取消切换保留草稿`,async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});
 if(from==='Quaternius'){await page.locator('#replaceModel').selectOption({label:from});await waitForModel(page,{actions:117});}
 await page.locator('#editPose').click();await rotateJoint(page);
 const inspect=()=>page.evaluate(async()=>{const {workbench,bodyControls}=await import('/labs/motion/motion.bundle.js');return {draft:workbench.inspect().draft,rig:workbench.rigList({limit:100}).entries,selected:bodyControls.selected?.node.name??null,gizmo:!!bodyControls.gizmo.object};});
 const before=await inspect();await page.locator('#replaceModel').selectOption({label:to});await page.getByRole('button',{name:'取消',exact:true}).click();
 await expect(page.locator('#editPose')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#viewportPoseTools')).toBeVisible();expect((await inspect()).rig).toEqual(before.rig);expect((await inspect()).draft).toEqual(before.draft);
 await page.locator('#replaceModel').selectOption({label:to});await page.getByRole('button',{name:'放弃',exact:true}).click();await waitForModel(page,{actions:count});
  await expect(page.locator('#editPose')).toHaveAttribute('aria-pressed','false');await expect(page.locator('#viewportPoseTools')).toBeHidden();await expect(page.locator('#bone')).toBeHidden();await expect(page.locator('.body-handles:not(.hand-handles)')).toBeHidden();await expect(page.locator('.hand-handles')).toBeHidden();
 await expect(page.locator('body')).not.toHaveClass(/pose-editing/);await expect(page.locator('#poseFineTune')).toHaveCount(0);
 await expect.poll(inspect).toMatchObject({draft:null,selected:null,gizmo:false});
 await page.locator('#editPose').click();await expect(page.locator('#undoDrag')).toBeDisabled();await expect(page.locator('#redoRotation')).toBeDisabled();await expect(page.locator('.body-handle.draggable')).toHaveCount(4);await expect(page.locator('.joint-draggable')).toHaveCount(4);
});

test('手动姿势：旋转、手脚入口、撤销、保存及离开保护',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await waitForModel(page,{actions:162});
 const inspect=()=>page.evaluate(async()=>{const {workbench}=await import('/labs/motion/motion.bundle.js');return {state:workbench.inspect(),rig:workbench.rigList({limit:100}).entries};});
 const before=await inspect();
 await expect(page.locator('.view-head #editPose')).toBeVisible();await expect(page.locator('#viewportPoseTools')).toBeHidden();
 await page.locator('#editPose').click();
 const editBox=await page.locator('#editPose').boundingBox(),saveBox=await page.locator('#capturePose').boundingBox();
 expect(saveBox.x+saveBox.width).toBeLessThan(editBox.x);expect(Math.abs(editBox.y+editBox.height/2-saveBox.y-saveBox.height/2)).toBeLessThan(2);
 await expect(page.locator('#editPose')).toHaveText('退出编辑');await expect(page.locator('#editPose')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#viewportPoseTools #editPose')).toHaveCount(0);await expect(page.locator('#viewportPoseTools')).toBeVisible();
 await page.screenshot({path:'output/acceptance/pose-editor-button-placement.png'});
 await expect(page.locator('#bone')).toBeHidden();await expect(page.locator('#poseFineTune')).toHaveCount(0);await expect(page.locator('.limb-handle')).not.toBeVisible();
 await expect(page.locator('.body-handle.draggable')).toHaveCount(4);
 await expect(page.locator('#body-translate')).toBeHidden();await expect(page.locator('#body-rotate')).toBeHidden();
 await expect(page.locator('#resetPose')).toBeHidden();
 await rotateJoint(page);
 const changed=await inspect();expect(changed.state.draft.canUndo).toBe(true);
 expect(changed.rig.map(b=>b.position)).toEqual(before.rig.map(b=>b.position));
 expect(changed.rig.find(b=>b.name==='head').quaternion).not.toEqual(before.rig.find(b=>b.name==='head').quaternion);
 await page.locator('#undoDrag').click();const undo=await inspect();expect(undo.rig.map(b=>b.quaternion)).toEqual(before.rig.map(b=>b.quaternion));
 await page.locator('#redoRotation').click();expect((await inspect()).rig.find(b=>b.name==='head').quaternion).toEqual(changed.rig.find(b=>b.name==='head').quaternion);
 await rotateJoint(page,{dx:15,dy:10});
 await page.locator('#capturePose').click();await page.locator('#poseName').fill('手动旋转保存');await page.locator('#confirmPoseSave').click();
 await expect(page.locator('#savePoseDialog')).toBeHidden();await expect(page.locator('#editPose')).toHaveAttribute('aria-pressed','false');
 const saved=await page.evaluate(async()=>{const {workbench}=await import('/labs/motion/motion.bundle.js');return workbench.libraryList({scope:'custom',kind:'pose',query:'手动旋转保存'});});
 expect(saved.entries).toHaveLength(1);expect(saved.entries[0].taskId).toBeUndefined();
 await page.locator('#editPose').click();await page.locator('#editPose').click();
 await page.getByRole('button',{name:'放弃',exact:true}).click();expect((await inspect()).state.draft).toBeNull();
 expect(errors).toEqual([]);
});

test('旋转环真实鼠标拖动只提交一次，Esc恢复本次拖动',async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});await page.locator('#editPose').click();
 await page.locator('.body-handle[data-part="右手腕"]').dblclick();
 const points=await page.evaluate(async()=>{
  const {bodyControls}=await import('/labs/motion/motion.bundle.js');const gizmo=bodyControls.gizmo;
  gizmo.getHelper().updateMatrixWorld(true);
  const ring=gizmo._gizmo.picker.rotate.children.find(c=>c.name==='Z');
  const box=bodyControls.canvas.getBoundingClientRect();
  // 取官方旋转环拾取几何上的点，再用真实鼠标命中，不直接改骨骼。
  const p=ring.geometry.attributes.position,candidates=[];
  for(let i=0;i<p.count;i+=10){const v=ring.position.clone().set(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(ring.matrixWorld).project(bodyControls.camera);candidates.push({x:box.x+(v.x+1)*box.width/2,y:box.y+(1-v.y)*box.height/2});}
  return candidates;
 });
 let start;
 for(const point of points){await page.mouse.move(point.x,point.y);if(await page.evaluate(async()=>{const {bodyControls}=await import('/labs/motion/motion.bundle.js');return ['X','Y','Z','E'].includes(bodyControls.gizmo.axis);})){start=point;break;}}
 expect(start).toBeTruthy();
 const snapshot=()=>page.evaluate(async()=>{const {workbench}=await import('/labs/motion/motion.bundle.js');return workbench.rigList({limit:100}).entries;});
 const before=await snapshot();await page.mouse.down();await page.mouse.move(start.x+30,start.y+25,{steps:8});await page.mouse.up();
 const after=await snapshot();expect(after.map(b=>b.position)).toEqual(before.map(b=>b.position));expect(after.map(b=>b.quaternion)).not.toEqual(before.map(b=>b.quaternion));
 await page.locator('#undoDrag').click();expect((await snapshot()).map(b=>b.quaternion)).toEqual(before.map(b=>b.quaternion));
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+20,start.y+15,{steps:5});await page.keyboard.press('Escape');await page.mouse.up();
 expect((await snapshot()).map(b=>b.quaternion)).toEqual(before.map(b=>b.quaternion));
});
