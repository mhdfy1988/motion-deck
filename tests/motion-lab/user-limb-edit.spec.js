import {test,expect} from '@playwright/test';
import {waitForModel} from './model-ready-helper.js';

const snapshot=page=>page.evaluate(async()=>{
 const {workbench,bodyControls}=await import('/labs/motion/motion.bundle.js');const root=bodyControls.root,pose=[];root.traverse(n=>pose.push({p:n.position.toArray(),q:n.quaternion.toArray(),s:n.scale.toArray()}));
 return {pose,undo:bodyControls.getState().poseDraft.undo.length,busy:bodyControls.getState().busy,camera:bodyControls.camera.matrixWorld.toArray(),limbs:bodyControls.limbs.map(({chain:c})=>({name:c.name,upper:c.upper.getWorldPosition(c.upper.position.clone()).toArray(),middleLocal:c.middle.quaternion.toArray(),endLocal:c.end.quaternion.toArray(),middle:c.middle.getWorldPosition(c.middle.position.clone()).toArray(),end:c.end.getWorldPosition(c.end.position.clone()).toArray(),orientation:c.end.getWorldQuaternion(c.end.quaternion.clone()).toArray()}))};
});
async function drag(page,name,dx,dy,finish=true){
 const handle=page.getByRole('button',{name:`拖动${name}`,exact:true});await expect(handle).toBeVisible();
 await expect.poll(()=>handle.evaluate(async el=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js'),part=c.parts.find(p=>p.button===el),v=part.node.getWorldPosition(part.node.position.clone()).project(c.camera),box=c.stage.getBoundingClientRect();return Math.hypot(parseFloat(el.style.left)-(v.x+1)*box.width/2,parseFloat(el.style.top)-(1-v.y)*box.height/2);})).toBeLessThan(.1);
 const box=await handle.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
 await page.mouse.move(x,y);await page.mouse.down();
 expect(await page.evaluate(async()=>{const {bodyControls}=await import('/labs/motion/motion.bundle.js');return bodyControls.pointerDrag?.part.button.getAttribute('aria-label');}),`实际命中${name}`).toBe(`拖动${name}`);
 await page.mouse.move(x+dx,y+dy,{steps:12});if(finish)await page.mouse.up();
}
const personPoint=page=>page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js'),node=c.torso.chain.links[2],v=node.getWorldPosition(node.position.clone()).project(c.camera),box=c.canvas.getBoundingClientRect(),x=box.x+(v.x+1)*box.width/2,y=box.y+(1-v.y)*box.height/2;for(const ox of [0,-5,5,-10,10])for(const oy of [0,-5,5,-10,10])if(c.personHit({clientX:x+ox,clientY:y+oy})&&!c.hitGizmo({clientX:x+ox,clientY:y+oy,button:0}))return {x:x+ox,y:y+oy};return null;});
for(const model of ['Mesh2Motion','Quaternius'])test(`${model}快速拖动时3D关节点与骨骼线同帧重合，DOM不画点`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await waitForModel(page,{actions:162});if(model==='Quaternius'){await page.locator('#replaceModel').selectOption({label:model});await waitForModel(page,{actions:117});}await page.locator('#skeleton').check();await page.locator('#editPose').click();
 await page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js');window.markerSamples=[];for(const {part,sprite} of c.markers.items)sprite.onAfterRender=()=>{if(!c.pointerDrag?.active)return;const state=c.getState(),a=sprite.position.clone().setFromMatrixPosition(sprite.matrixWorld),b=part.node.position.clone().setFromMatrixPosition(part.node.matrixWorld),helper=state.helper;let j=0,error=0;for(const bone of helper.bones){if(!bone.parent?.isBone)continue;if(bone===part.node){const p=helper.geometry.attributes.position,v=a.clone().set(p.getX(j),p.getY(j),p.getZ(j)).applyMatrix4(helper.matrixWorld);error=v.distanceTo(b);break;}j+=2;}window.markerSamples.push({point:a.distanceTo(b),line:error});};});
 const before=await snapshot(page),handle=page.getByRole('button',{name:'拖动右肘',exact:true});expect(await handle.evaluate(el=>getComputedStyle(el,'::before').content)).toBe('none');const box=await handle.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;await page.mouse.move(x,y);await page.mouse.down();for(let i=0;i<24;i++)await page.mouse.move(x+Math.sin(i*.9)*125,y+Math.cos(i*.8)*85,{steps:1});await expect.poll(()=>page.evaluate(()=>window.markerSamples.length)).toBeGreaterThan(10);await page.screenshot({path:`output/acceptance/3d-markers-fast-${model}.png`});await page.mouse.up();const samples=await page.evaluate(()=>window.markerSamples);expect(Math.max(...samples.map(s=>s.point))).toBeLessThan(1e-9);expect(Math.max(...samples.map(s=>s.line))).toBeLessThan(.00001);await page.locator('#undoDrag').click();expect((await snapshot(page)).pose).toEqual(before.pose);
 expect(await page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js');return !c.root.getObjectById(c.markers.group.id)&&c.markers.items.every(i=>i.sprite.isSprite);})).toBe(true);expect(errors).toEqual([]);
});
async function movePerson(page,dx,dy,finish=true){
 const point=await personPoint(page);expect(point).toBeTruthy();
 await page.mouse.move(point.x,point.y);await page.mouse.down();expect(await page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js');return c.pointerDrag?.part.whole;})).toBe(true);await page.mouse.move(point.x+dx,point.y+dy,{steps:8});if(finish)await page.mouse.up();
}
for(const model of ['Mesh2Motion','Quaternius'])test(`${model}人体悬停手型蓝色高亮，拖动增强且不污染原材质`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error'&&/Shader Error|WebGLProgram/.test(msg.text()))errors.push(msg.text());});await page.goto('/');await waitForModel(page,{actions:162});if(model==='Quaternius'){await page.locator('#replaceModel').selectOption({label:model});await waitForModel(page,{actions:117});}
 await page.locator('#editPose').click();await page.getByRole('button',{name:'整体调整',exact:true}).click();
 const info=()=>page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js');return {visible:c.highlight.group.visible,opacity:c.highlight.items[0].material.opacity,materials:c.highlight.items.filter(i=>!i.band).map(i=>({uuid:i.source.material.uuid,color:i.source.material.color?.getHex(),emissive:i.source.material.emissive?.getHex(),opacity:i.source.material.opacity})),outside:!c.root.getObjectById(c.highlight.group.id),cursor:getComputedStyle(c.canvas).cursor};});
 const before=await info(),pose=await snapshot(page),point=await personPoint(page);await page.mouse.move(20,20);const clear=await page.locator('#stage canvas').screenshot();await page.mouse.move(point.x,point.y);await expect.poll(async()=>(await info()).visible).toBe(true);expect((await info()).cursor).toBe('pointer');expect((await info()).materials).toEqual(before.materials);expect((await info()).outside).toBe(true);expect((await snapshot(page)).pose).toEqual(pose.pose);expect((await page.locator('#stage canvas').screenshot()).equals(clear)).toBe(false);await page.screenshot({path:`output/acceptance/body-hover-${model}.png`});
 const hover=(await info()).opacity;await page.mouse.down();await page.mouse.move(point.x+20,point.y-20,{steps:6});await expect.poll(async()=>(await info()).opacity).toBeGreaterThan(hover);expect((await info()).cursor).toBe('grabbing');await page.screenshot({path:`output/acceptance/body-grab-${model}.png`});await page.keyboard.press('Escape');await page.mouse.up();expect((await snapshot(page)).pose).toEqual(pose.pose);
 const blank=await page.locator('#stage canvas').boundingBox();await page.mouse.click(blank.x+65,blank.y+140);await page.mouse.move(20,20);await expect.poll(async()=>(await info()).visible).toBe(false);await page.mouse.move(point.x,point.y);await expect.poll(async()=>(await info()).visible).toBe(true);await page.getByRole('button',{name:'摆姿',exact:true}).click();await expect.poll(async()=>(await info()).visible).toBe(false);expect((await info()).materials).toEqual(before.materials);expect(errors).toEqual([]);
});
for(const model of ['Mesh2Motion','Quaternius'])test(`${model}直接拖人物整体移动，合并工具、姿态不变、一步历史取消和保存刷新`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await waitForModel(page,{actions:162});if(model==='Quaternius'){await page.locator('#replaceModel').selectOption({label:model});await waitForModel(page,{actions:117});}
 await page.locator('#editPose').click();await page.getByRole('button',{name:'整体调整',exact:true}).click();await expect(page.locator('.body-handles:not(.hand-handles)')).toBeHidden();await expect(page.locator('.hand-handles')).toBeHidden();await expect(page.getByRole('button',{name:'整体调整',exact:true})).toHaveAttribute('aria-pressed','true');
 const original=await snapshot(page);await movePerson(page,1,1);expect((await snapshot(page)).pose).toEqual(original.pose);expect((await snapshot(page)).undo).toBe(0);
 const canvasBox=await page.locator('#stage canvas').boundingBox();await page.mouse.move(canvasBox.x+80,canvasBox.y+120);await page.mouse.down();await page.mouse.move(canvasBox.x+160,canvasBox.y+140,{steps:6});await page.mouse.up();await expect.poll(async()=>JSON.stringify((await snapshot(page)).camera)).not.toBe(JSON.stringify(original.camera));expect((await snapshot(page)).pose).toEqual(original.pose);
 expect(await page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js');return c.gizmo.getHelper().visible;})).toBe(false);
 for(const [preset,dx,dy] of [['perspective',30,-40],['front',-25,15],['right',10,25]]){await page.locator('#viewPreset').selectOption(preset);const before=await snapshot(page);await movePerson(page,dx,dy,false);expect((await snapshot(page)).busy).toBe(true);await page.mouse.up();const after=await snapshot(page);expect(after.busy).toBe(false);expect(after.undo).toBe(before.undo+1);expect(after.pose.map(p=>[p.q,p.s])).toEqual(before.pose.map(p=>[p.q,p.s]));expect(after.pose.filter((p,i)=>JSON.stringify(p.p)!==JSON.stringify(before.pose[i].p))).toHaveLength(1);
  // OrbitControls逐帧重建矩阵会在固定侧视产生约6e-17噪声；逐元素1e-12检查仍拒绝实际镜头位移。
  after.camera.forEach((v,i)=>expect(v).toBeCloseTo(before.camera[i],12));
  const delta=after.limbs[0].end.map((v,i)=>v-before.limbs[0].end[i]);expect(Math.hypot(...delta)).toBeGreaterThan(.01);expect(delta.reduce((v,d,i)=>v+d*before.camera[8+i],0)).toBeCloseTo(0,5);after.limbs.forEach((limb,i)=>limb.end.forEach((v,k)=>expect(v-before.limbs[i].end[k]).toBeCloseTo(delta[k],5)));
  await page.locator('#undoDrag').click();expect((await snapshot(page)).pose).toEqual(before.pose);await page.locator('#redoRotation').click();expect((await snapshot(page)).pose).toEqual(after.pose);
 }
 const final=await snapshot(page);await movePerson(page,20,-30,false);await page.keyboard.press('Escape');await page.mouse.up();expect((await snapshot(page)).pose).toEqual(final.pose);await movePerson(page,-30,10,false);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();expect((await snapshot(page)).pose).toEqual(final.pose);
 await movePerson(page,20,-20,false);await page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js');c.canvas.dispatchEvent(new PointerEvent('pointercancel',{pointerId:c.pointerDrag.id,bubbles:true}));});await page.mouse.up();expect((await snapshot(page)).pose).toEqual(final.pose);
 await page.screenshot({path:`output/acceptance/whole-move-${model}.png`});await page.getByRole('button',{name:'摆姿',exact:true}).click();await expect(page.locator('.body-handles:not(.hand-handles)')).toBeVisible();expect((await snapshot(page)).pose).toEqual(final.pose);expect(final.pose).not.toEqual(original.pose);
 await page.locator('#capturePose').click();await page.locator('#poseName').fill(`${model}整体腾空`);await page.locator('#confirmPoseSave').click();await expect(page.locator('#savePoseDialog')).toBeHidden();await page.reload();await waitForModel(page,{actions:model==='Mesh2Motion'?162:117});await page.locator('#library-pose').click();await page.locator('#clips [data-pose-id]').filter({hasText:`${model}整体腾空`}).click();await page.locator('#editPose').click();expect((await snapshot(page)).pose).toEqual(final.pose);await expect(page.getByRole('button',{name:'摆姿',exact:true})).toHaveAttribute('aria-pressed','true');expect(errors).toEqual([]);
});
for(const model of ['Mesh2Motion','Quaternius'])test(`${model}真实躯干与骨盆拖动，保脚、撤销取消及保存`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await waitForModel(page,{actions:162});
 if(model==='Quaternius'){await page.locator('#replaceModel').selectOption({label:'Quaternius'});await waitForModel(page,{actions:117});}
 await page.locator('#editPose').click();await expect(page.locator('.body-draggable')).toHaveCount(6);
 // 此旧用例从既有侧折膝姿势测试不限位保脚；自然约束的合法起点和不可达拒绝另有专项。
 await page.getByRole('button',{name:'自由编辑',exact:true}).click();
 for(const name of ['头','胸','腰','脖子']){
  const before=await snapshot(page);await drag(page,name,24,-10);const after=await snapshot(page);expect(after.busy).toBe(false);expect(after.undo).toBe(before.undo+1);expect(after.pose).not.toEqual(before.pose);expect(after.pose.map(p=>[p.p,p.s])).toEqual(before.pose.map(p=>[p.p,p.s]));expect(after.camera).toEqual(before.camera);
  for(const i of [2,3])expect(after.limbs[i].end).toEqual(before.limbs[i].end);
  await page.locator('#undoDrag').click();expect((await snapshot(page)).pose).toEqual(before.pose);
 }
 const before=await snapshot(page);await drag(page,'骨盆',0,20);const after=await snapshot(page);expect(after.undo).toBe(before.undo+1);expect(after.pose).not.toEqual(before.pose);
 for(const i of [2,3])expect(Math.hypot(...after.limbs[i].end.map((v,k)=>v-before.limbs[i].end[k]))).toBeLessThan(.0001);
 expect(after.pose.map(p=>p.s)).toEqual(before.pose.map(p=>p.s));expect(after.pose.filter((p,i)=>JSON.stringify(p.p)!==JSON.stringify(before.pose[i].p))).toHaveLength(1);
 await drag(page,'骨盆',40,-50,false);await page.keyboard.press('Escape');await page.mouse.up();expect((await snapshot(page)).pose).toEqual(after.pose);
 await drag(page,'胸',-25,15,false);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();expect((await snapshot(page)).pose).toEqual(after.pose);
 await page.locator('#undoDrag').click();expect((await snapshot(page)).pose).toEqual(before.pose);await page.locator('#redoRotation').click();expect((await snapshot(page)).pose).toEqual(after.pose);
 await drag(page,'头',22,-8);const final=await snapshot(page);await page.screenshot({path:`output/acceptance/body-chain-${model}.png`});
 await page.locator('#capturePose').click();await page.locator('#poseName').fill(`${model}躯干骨盆`);await page.locator('#confirmPoseSave').click();await expect(page.locator('#savePoseDialog')).toBeHidden();
 await page.reload();await waitForModel(page,{actions:model==='Mesh2Motion'?162:117});await page.locator('#library-pose').click();await page.locator('#clips [data-pose-id]').filter({hasText:`${model}躯干骨盆`}).click();await page.locator('#editPose').click();expect((await snapshot(page)).pose).toEqual(final.pose);expect(errors).toEqual([]);
});
for(const model of ['Mesh2Motion','Quaternius'])test(`${model}真实手脚拖动、一步历史、取消和保存恢复`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await waitForModel(page,{actions:162});
 if(model==='Quaternius'){await page.locator('#replaceModel').selectOption({label:'Quaternius'});await waitForModel(page,{actions:117});}
 await page.locator('#editPose').click();await expect(page.locator('.body-handle.draggable')).toHaveCount(4);
 const before=await snapshot(page);await drag(page,'右手',-38,-65,false);const moving=await snapshot(page);
 expect(moving.busy).toBe(true);expect(moving.undo).toBe(0);expect(moving.pose.map(p=>[p.p,p.s])).toEqual(before.pose.map(p=>[p.p,p.s]));expect(moving.camera).toEqual(before.camera);
 expect(Math.hypot(...moving.limbs[1].end.map((v,i)=>v-before.limbs[1].end[i]))).toBeGreaterThan(.01);
 await page.mouse.up();const after=await snapshot(page);expect(after.busy).toBe(false);expect(after.undo).toBe(1);
 expect(after.limbs[1].upper).toEqual(before.limbs[1].upper);expect(after.limbs[1].middle).toEqual(before.limbs[1].middle);expect(after.limbs[1].endLocal).toEqual(before.limbs[1].endLocal);
 await page.locator('#undoDrag').click();expect((await snapshot(page)).pose).toEqual(before.pose);
 await page.locator('#redoRotation').click();expect((await snapshot(page)).pose).toEqual(after.pose);
 await drag(page,'左脚',20,-25,false);await page.keyboard.press('Escape');await page.mouse.up();expect((await snapshot(page)).pose).toEqual(after.pose);expect((await snapshot(page)).undo).toBe(1);
 // 失焦与丢失捕获必须回滚，不留BUSY或额外撤销项。
 await drag(page,'左手',20,-20,false);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();expect((await snapshot(page)).pose).toEqual(after.pose);
 await drag(page,'右脚',-20,-20,false);await page.locator('.body-handle[data-limb="右脚"]').evaluate(button=>button.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true})));await page.mouse.up();expect((await snapshot(page)).pose).toEqual(after.pose);
 await drag(page,'左脚',20,-30);const final=await snapshot(page);expect(final.undo).toBe(2);
 await page.locator('#capturePose').click();await page.locator('#poseName').fill(`${model}手脚编辑`);await page.locator('#confirmPoseSave').click();await expect(page.locator('#savePoseDialog')).toBeHidden();
 await page.locator('#library-pose').click();const saved=page.locator('#clips [data-pose-id]').filter({hasText:`${model}手脚编辑`});await expect(saved).toHaveCount(1);await saved.click();await page.locator('#editPose').click();expect((await snapshot(page)).pose).toEqual(final.pose);
 await page.screenshot({path:`output/acceptance/user-limb-${model}.png`});expect(errors).toEqual([]);
});

test('关节点远小近大，缩放不改变点击区或姿势',async({page})=>{
 await page.goto('/');await waitForModel(page,{actions:162});await page.locator('#editPose').click();
 const handle=page.getByRole('button',{name:'拖动右手',exact:true}),size=()=>handle.evaluate(async el=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js');return c.parts.find(p=>p.button===el).marker.userData.diameter;});
 const before=await snapshot(page),initial=await size(),hitbox=await handle.boundingBox(),stage=await page.locator('#stage').boundingBox();
 await page.mouse.move(stage.x+stage.width*.6,stage.y+stage.height*.45);await page.mouse.wheel(0,-450);
 await expect.poll(size).toBeGreaterThan(initial*1.15);const close=await size();await page.screenshot({path:'output/acceptance/pose-markers-near.png'});
 await page.mouse.wheel(0,900);await expect.poll(size).toBeLessThan(close*.8);await page.screenshot({path:'output/acceptance/pose-markers-far.png'});
 const box=await handle.boundingBox();expect(box.width).toBe(hitbox.width);expect(box.height).toBe(hitbox.height);expect((await snapshot(page)).pose).toEqual(before.pose);
});

for(const model of ['Mesh2Motion','Quaternius'])test(`${model}真实拖肘膝整肢跟随，直臂抬落、撤销取消及保存`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await waitForModel(page,{actions:162});
 if(model==='Quaternius'){await page.locator('#replaceModel').selectOption({label:'Quaternius'});await waitForModel(page,{actions:117});}
 await page.locator('#editPose').click();await expect(page.locator('.joint-draggable')).toHaveCount(4);
 // 设置近伸直起点；拖肘只转上臂，直臂也能抬起和放下，不再要求先弯曲。
 await page.evaluate(async()=>{const {bodyControls,workbench}=await import('/labs/motion/motion.bundle.js'),{chain,ik}=bodyControls.limbs[1];ik.begin();workbench.beginUserPoseGesture([chain.upper,chain.middle,chain.end]);ik.move(ik.start.a.clone().add(ik.start.c.clone().sub(ik.start.a).multiplyScalar(3)));workbench.finishUserPoseGesture(false);});
 const straight=await snapshot(page);await drag(page,'右肘',12,-45);const raised=await snapshot(page);expect(raised.limbs[1].middle[1]).toBeGreaterThan(straight.limbs[1].middle[1]);expect(raised.limbs[1].end[1]).toBeGreaterThan(straight.limbs[1].end[1]);expect(raised.limbs[1].middleLocal).toEqual(straight.limbs[1].middleLocal);expect(raised.limbs[1].endLocal).toEqual(straight.limbs[1].endLocal);await page.screenshot({path:`output/acceptance/direct-arm-raised-${model}.png`});
 await drag(page,'右肘',-12,65);const lowered=await snapshot(page);expect(lowered.limbs[1].end[1]).toBeLessThan(raised.limbs[1].end[1]);await page.screenshot({path:`output/acceptance/direct-arm-lowered-${model}.png`});await page.locator('.body-handle[data-part="右肘"]').dblclick();expect(await page.evaluate(async()=>{const {bodyControls:c}=await import('/labs/motion/motion.bundle.js');return c.gizmo.object===c.limbs[1].chain.middle;})).toBe(true);
 for(const [index,end,pole,dx,dy] of [[0,'左手','左肘',-30,-60],[1,'右手','右肘',30,-60],[2,'左脚','左膝',-20,-35],[3,'右脚','右膝',20,-35]]){
  await drag(page,end,dx,dy);const before=await snapshot(page);await drag(page,pole,28,-18,false);const moving=await snapshot(page);
  expect(moving.busy).toBe(true);expect(moving.undo).toBe(before.undo);expect(moving.camera).toEqual(before.camera);await page.mouse.up();const after=await snapshot(page);
  expect(after.undo).toBe(before.undo+1);expect(after.pose.map(p=>[p.p,p.s])).toEqual(before.pose.map(p=>[p.p,p.s]));
  for(let i=0;i<4;i++){const distance=Math.hypot(...after.limbs[i].end.map((v,k)=>v-before.limbs[i].end[k]));if(i===index){expect(distance).toBeGreaterThan(.001);expect(after.limbs[i].upper).toEqual(before.limbs[i].upper);expect(after.limbs[i].middleLocal).toEqual(before.limbs[i].middleLocal);expect(after.limbs[i].endLocal).toEqual(before.limbs[i].endLocal);}else expect(distance).toBeLessThan(.00001);}
  expect(Math.hypot(...after.limbs[index].middle.map((v,k)=>v-before.limbs[index].middle[k]))).toBeGreaterThan(.001);
  await page.locator('#undoDrag').click();expect((await snapshot(page)).pose).toEqual(before.pose);await page.locator('#redoRotation').click();expect((await snapshot(page)).pose).toEqual(after.pose);
  await drag(page,pole,-18,22,false);await page.keyboard.press('Escape');await page.mouse.up();expect((await snapshot(page)).pose).toEqual(after.pose);
  await drag(page,pole,-18,22,false);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();expect((await snapshot(page)).pose).toEqual(after.pose);
 }
 const final=await snapshot(page);await page.locator('#capturePose').click();await page.locator('#poseName').fill(`${model}肘膝方向`);await page.locator('#confirmPoseSave').click();await expect(page.locator('#savePoseDialog')).toBeHidden();
 await page.locator('#library-pose').click();await page.locator('#clips [data-pose-id]').filter({hasText:`${model}肘膝方向`}).click();await page.locator('#editPose').click();expect((await snapshot(page)).pose).toEqual(final.pose);
 await page.screenshot({path:`output/acceptance/pole-edit-${model}.png`});expect(errors).toEqual([]);
});
