import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3,PerspectiveCamera,OrthographicCamera} from 'three';
import {fitView,resizeView} from '../../web/labs/motion/view-camera.js';
import {viewPresets,viewPreset,framingDirections} from '../../web/labs/motion/view-presets.js';
const box=new Box3(new Vector3(-.5,0,-.3),new Vector3(.5,2,.3));
test('20个正交方向唯一，组内取景尺度不变，等角三轴投影长度一致',()=>{
 assert.equal(viewPresets.length,21);assert.equal(new Set(viewPresets.map(p=>p.id)).size,21);assert.throws(()=>viewPreset('invalid'),/未知视角/);
 for(const family of ['flat','overhead','isometric']){let half;const presets=viewPresets.filter(p=>p.family===family);assert.equal(presets.length,family==='isometric'?4:8);const directions=framingDirections(presets[0]).map(d=>new Vector3(...d));
  assert.equal(new Set(directions.map(d=>d.toArray().map(n=>n.toFixed(5)).join(','))).size,presets.length);
  for(const p of presets){const c=new OrthographicCamera();fitView(c,box,new Vector3(...p.direction),1.5,directions);c.updateMatrixWorld();if(half===undefined)half=c.top;assert.ok(Math.abs(c.top-half)<1e-9);
   for(const x of [-.5,.5])for(const y of [0,2])for(const z of [-.3,.3]){const v=new Vector3(x,y,z).project(c);assert.ok(Math.abs(v.y)<=.650001);assert.ok(Math.abs(v.x)<=.850001);}
   if(family==='isometric'){const origin=new Vector3().project(c),lengths=[[1,0,0],[0,1,0],[0,0,1]].map(axis=>{const projected=new Vector3(...axis).project(c).sub(origin);return Math.hypot(projected.x*1.5,projected.y);});assert.ok(Math.max(...lengths)-Math.min(...lengths)<1e-9);}
  }
 }
});
test('透视适配约65%高度且不截断，宽屏和短屏保持比例',()=>{
 for(const aspect of [.7,1.5,3]){const c=new PerspectiveCamera(38);fitView(c,box,new Vector3(.75,.25,1),aspect);c.updateMatrixWorld();for(const x of [-.5,.5])for(const y of [0,2])for(const z of [-.3,.3]){const p=new Vector3(x,y,z).project(c);assert.ok(Math.abs(p.y)<=.650001);assert.ok(Math.abs(p.x)<=.850001);}}
});
test('横版正交向右、向左，纵深不改变大小，输出相机按新宽高比调整',()=>{
 for(const sign of [-1,1]){const c=new OrthographicCamera();fitView(c,box,new Vector3(sign,0,0),2);c.updateMatrixWorld();const a=new Vector3(0,2,0).project(c),b=new Vector3(sign*.3,2,0).project(c);assert.ok(Math.abs(a.y-b.y)<1e-8);assert.ok(Math.abs(a.y-.65)<1e-8);assert.equal(Math.sign(new Vector3(0,1,1).project(c).x),-sign);const clone=c.clone();resizeView(clone,1.5);assert.equal((clone.right-clone.left)/(clone.top-clone.bottom),1.5);assert.equal(clone.top,c.top);}
});
