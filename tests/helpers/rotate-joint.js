import {expect} from '@playwright/test';

// 网页和桌面共用真实旋转手势，不再依赖已移除的微调浮层。
export async function rotateJoint(page,{joint='头',axis='Z',dx=25,dy=20,whole=false,cancel=false,during}={}){
 if(!whole)await page.locator(`.body-handle[data-part="${joint}"]`).dblclick();
 else if(!await page.evaluate(async()=>{const {bodyControls:c}=await import(new URL('/labs/motion/motion.bundle.js',location.href).href);return c.rotationOpen;})){
  const point=await page.evaluate(async()=>{const {bodyControls:c}=await import(new URL('/labs/motion/motion.bundle.js',location.href).href),node=c.pivotNode??c.onMoveRoot(),v=node.getWorldPosition(node.position.clone()).project(c.camera),box=c.canvas.getBoundingClientRect(),x=box.x+(v.x+1)*box.width/2,y=box.y+(1-v.y)*box.height/2;for(const ox of [0,-5,5,-10,10])for(const oy of [0,-5,5,-10,10])if(document.elementFromPoint(x+ox,y+oy)===c.canvas&&c.personHit({clientX:x+ox,clientY:y+oy}))return {x:x+ox,y:y+oy};return null;});expect(point).toBeTruthy();await page.mouse.dblclick(point.x,point.y);
 }
 const points=await page.evaluate(async axis=>{
  const {bodyControls:c}=await import(new URL('/labs/motion/motion.bundle.js',location.href).href);c.gizmo.getHelper().updateMatrixWorld(true);
  const ring=c.gizmo._gizmo.gizmo.rotate.children.find(n=>n.name===axis),positions=ring.geometry.attributes.position,box=c.canvas.getBoundingClientRect(),points=[],previous=c.gizmo.axis;
  // 页面内先用官方拾取筛掉圈交叉处；随后仍用真实鼠标验证命中，不能直接写axis代替操作。
  // Electron逐点跨进程试探数百顶点会耗尽整项预算，这里最多返回8个可见候选。
  for(let i=0;i<positions.count&&points.length<8;i+=3){const v=ring.position.clone().set(positions.getX(i),positions.getY(i),positions.getZ(i)).applyMatrix4(ring.matrixWorld).project(c.camera);if(Math.abs(v.x)>1||Math.abs(v.y)>1)continue;c.gizmo.pointerHover({x:v.x,y:v.y,button:-1});if(c.gizmo.axis===axis)points.push({x:box.x+(v.x+1)*box.width/2,y:box.y+(1-v.y)*box.height/2});}c.gizmo.axis=previous;return points;
 },axis);
 let start;
 for(const point of points){await page.mouse.move(point.x,point.y);if(await page.evaluate(async axis=>{const {bodyControls:c}=await import(new URL('/labs/motion/motion.bundle.js',location.href).href);return c.gizmo.axis===axis;},axis)){start=point;break;}}
 expect(start,'必须命中可见旋转轨道').toBeTruthy();const end={x:start.x+dx,y:start.y+dy};await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:6});if(during)await during({start,end});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();return {start,end};
}
