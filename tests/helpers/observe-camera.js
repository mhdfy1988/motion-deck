import {expect} from '@playwright/test';

const snapshot=page=>page.evaluate(async()=>{
 const {bodyControls:c}=await import('/labs/motion/motion.bundle.js'),pose=[];
 c.root.traverse(n=>pose.push([n.position.toArray(),n.quaternion.toArray(),n.scale.toArray()]));
 return {p:c.camera.position.toArray(),q:c.camera.quaternion.toArray(),up:c.camera.up.toArray(),rightY:c.camera.matrixWorld.elements[1],target:c.controls.target.toArray(),distance:c.camera.position.distanceTo(c.controls.target),mode:c.controls.mode,pose};
});
async function drag(page,dx,dy,button='left'){
 const b=await page.locator('#stage canvas').boundingBox(),x=b.x+35,y=b.y+b.height*.65;
 await page.mouse.move(x,y);await page.mouse.down({button});await page.mouse.move(x+dx,y+dy,{steps:10});await page.mouse.up({button});
}
export async function checkObservationCamera(page){
 await expect(page.locator('#cameraMode')).toHaveCount(0);
 await expect(page.locator('.free-view-hint')).toHaveCount(0);
 const before=await snapshot(page);expect(before.mode).toBe('orbit');
 await drag(page,80,-30);const rotated=await snapshot(page);
 expect(rotated.p).not.toEqual(before.p);expect(rotated.target).toEqual(before.target);expect(rotated.distance).toBeCloseTo(before.distance,9);expect(rotated.up).toEqual([0,1,0]);expect(rotated.pose).toEqual(before.pose);
 // 从可见窗口拖距核对偏航角，而非仅检查相机有变化。
 const height=await page.locator('#stage canvas').evaluate(e=>e.clientHeight),yaw=s=>Math.atan2(s.p[0]-s.target[0],s.p[2]-s.target[2]),error=yaw(rotated)-yaw(before)+80*2*Math.PI/height;
 expect(Math.atan2(Math.sin(error),Math.cos(error))).toBeCloseTo(0,7);
 await page.waitForTimeout(100);expect((await snapshot(page)).p).toEqual(rotated.p);
 for(const dy of [-120,120]){for(let i=0;i<8;i++)await drag(page,0,dy);const limited=await snapshot(page),cos=(limited.p[1]-limited.target[1])/limited.distance;expect(Math.abs(cos)).toBeLessThanOrEqual(Math.cos(.05)+1e-9);expect(Math.abs(limited.rightY)).toBeLessThan(1e-9);expect(limited.target).toEqual(before.target);}
 await page.locator('#viewPreset').selectOption('front');await page.locator('#viewPreset').selectOption('perspective');const idle=await snapshot(page);
 await page.locator('#stage canvas').focus();await page.keyboard.down('KeyW');await page.waitForTimeout(100);await page.keyboard.up('KeyW');(await snapshot(page)).p.forEach((value,index)=>expect(value).toBeCloseTo(idle.p[index],12));
 await drag(page,40,-20,'right');(await snapshot(page)).p.forEach((value,index)=>expect(value).toBeCloseTo(idle.p[index],12));expect(await page.evaluate(()=>!!document.pointerLockElement)).toBe(false);
 await drag(page,40,-20,'middle');const panned=await snapshot(page);expect(panned.target).not.toEqual(idle.target);for(let i=0;i<3;i++)expect(panned.p[i]-idle.p[i]).toBeCloseTo(panned.target[i]-idle.target[i],8);
 await page.mouse.wheel(0,-120);await expect.poll(async()=>(await snapshot(page)).distance).toBeLessThan(panned.distance);expect((await snapshot(page)).target).toEqual(panned.target);
 await page.locator('#viewPreset').selectOption('front');const fixed=await snapshot(page);await drag(page,60,-30);expect((await snapshot(page)).q).toEqual(fixed.q);
 await page.locator('#viewPreset').selectOption('perspective');await page.locator('#editPose').click();
 await expect(page.locator('#stage #viewportPoseTools')).toHaveCount(0);
 const dock=await page.locator('.pose-workspace > #viewportPoseTools').boundingBox(),stage=await page.locator('#stage').boundingBox(),player=await page.locator('.player').boundingBox();
 expect(dock).not.toBeNull();expect(dock.x).toBeGreaterThanOrEqual(stage.x+stage.width-1);expect(dock.y).toBeLessThanOrEqual(stage.y+1);expect(dock.y+dock.height).toBeLessThanOrEqual(player.y+1);expect(Math.abs(dock.y+dock.height-stage.y-stage.height)).toBeLessThan(1);expect(player.width).toBeGreaterThan(stage.width+dock.width-2);
 const wrist=await page.locator('.body-handle[data-part="右手腕"]').boundingBox(),edit=await snapshot(page);
 await page.mouse.move(wrist.x+wrist.width/2,wrist.y+wrist.height/2);await page.mouse.down();await page.mouse.move(wrist.x+wrist.width/2+20,wrist.y+wrist.height/2-20,{steps:6});await page.mouse.up();expect((await snapshot(page)).p).toEqual(edit.p);expect((await snapshot(page)).q).toEqual(edit.q);await page.locator('#undoDrag').click();
 // 先把手摆成已标定姿势，只用于获得可见掌面，随后走真实表面点击入口。
 await page.evaluate(async()=>{const {workbench:w}=await import('/labs/motion/motion.bundle.js');w.setBones(w.rigList({limit:100}).entries.filter(e=>e.jointLimit.status==='calibrated').map(e=>({id:e.id,quaternion:e.jointLimit.reference})));});
 await page.locator('#viewPreset').selectOption('front');
 const full=await snapshot(page),point=await page.evaluate(async()=>{
  const {bodyControls:c}=await import('/labs/motion/motion.bundle.js'),wrist=c.limbs.find(l=>l.chain.name==='右手').chain.end,child=wrist.children.find(n=>n.isBone&&/middle/.test(n.name)),v=wrist.position.clone().set(0,child?.position.y*.65||.035,0);wrist.localToWorld(v);v.project(c.camera);const box=c.canvas.getBoundingClientRect(),x=box.x+(v.x+1)*box.width/2,y=box.y+(1-v.y)*box.height/2,allowed=new Set();wrist.traverse(n=>allowed.add(n));
  for(const ox of [0,-3,3,-6,6,-9,9])for(const oy of [0,-3,3,-6,6,-9,9]){const hit=c.personHit({clientX:x+ox,clientY:y+oy});if(!hit?.face||document.elementFromPoint(x+ox,y+oy)!==c.canvas)continue;let weight=0;for(const vertex of [hit.face.a,hit.face.b,hit.face.c])for(let k=0;k<4;k++)if(allowed.has(hit.object.skeleton.bones[hit.object.geometry.attributes.skinIndex.getComponent(vertex,k)]))weight+=hit.object.geometry.attributes.skinWeight.getComponent(vertex,k);if(weight/3>.55)return {x:x+ox,y:y+oy};}return null;
 });expect(point).not.toBeNull();await page.mouse.click(point.x,point.y);await expect(page.getByRole('button',{name:'返回全身',exact:true})).toBeVisible();const hand=await snapshot(page);expect(hand.target).not.toEqual(full.target);expect(hand.up).toEqual([0,1,0]);
 // 官方update对target做clampLength归一往返，允许1e-9以内浮点误差，不允许中心实际漂移。
 await drag(page,60,-25);const handRotated=await snapshot(page);expect(handRotated.p).not.toEqual(hand.p);for(let i=0;i<3;i++)expect(handRotated.target[i]).toBeCloseTo(hand.target[i],9);expect(handRotated.distance).toBeCloseTo(hand.distance,8);expect(handRotated.up).toEqual([0,1,0]);
 await page.getByRole('button',{name:'返回全身',exact:true}).click();const restored=await snapshot(page);for(let i=0;i<3;i++)expect(restored.p[i]).toBeCloseTo(full.p[i],9);expect(restored.target).toEqual(full.target);expect(restored.pose).toEqual(full.pose);
 // 定向测试只放弃自身隔离上下文草稿，不影响用户资料。
 await page.evaluate(async()=>{const {workbench:w}=await import('/labs/motion/motion.bundle.js');w.discardDraft();});
}
