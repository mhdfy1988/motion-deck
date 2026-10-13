import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Euler} from 'three';
import {PointerLockControls} from 'three/addons/controls/PointerLockControls.js';
import {stepFreeView} from '../../web/labs/motion/free-view.js';
test('自由观看移动沿相机朝向，升降与加速、对角线归一、停键与预算',()=>{
 const camera=new PerspectiveCamera(),fps=new PointerLockControls(camera);camera.quaternion.setFromEuler(new Euler(0,Math.PI/2,0));stepFreeView(fps,new Set(['KeyW']),.1,2);assert.ok(Math.abs(camera.position.x+.12)<1e-8);assert.ok(Math.abs(camera.position.z)<1e-8);camera.position.set(0,0,0);stepFreeView(fps,new Set(['KeyE','ShiftLeft']),.1,2);assert.ok(Math.abs(camera.position.y-.36)<1e-8);
 camera.position.set(0,0,0);stepFreeView(fps,new Set(['KeyW','KeyD','KeyE']),.1,2);assert.ok(Math.abs(camera.position.length()-.12)<1e-8);const before=camera.position.clone();stepFreeView(fps,new Set(),.1,2);assert.ok(camera.position.equals(before));fps.enabled=false;stepFreeView(fps,new Set(['KeyE']),.1,2);assert.ok(camera.position.equals(before));fps.enabled=true;camera.position.set(0,0,0);stepFreeView(fps,new Set(['KeyD']),10,2);assert.ok(Math.abs(camera.position.length()-.12)<1e-8);
});
