import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,OrthographicCamera,Vector3} from 'three';
import {pointerCoordinates,pointerRay,nearestPoseHandle} from '../../web/labs/motion/pose/pose-picking.js';

const canvas={getBoundingClientRect:()=>({left:20,top:40,width:200,height:100})};
const handle=(x,y,width=16,height=16,extra={})=>({button:{hidden:false,disabled:false,getBoundingClientRect:()=>({left:x-width/2,top:y-height/2,width,height}),...extra}});

test('指针坐标以实际画布归一，透视与正交射线共用同一入口',()=>{
 assert.deepEqual(pointerCoordinates({clientX:120,clientY:90,button:0},canvas),{x:0,y:0,button:0});
 assert.deepEqual(pointerCoordinates({clientX:20,clientY:40,button:1},canvas),{x:-1,y:1,button:1});
 for(const camera of [new PerspectiveCamera(40,2,.1,100),new OrthographicCamera(-2,2,1,-1,.1,100)]){
  camera.position.set(0,0,5);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const ray=pointerRay({clientX:120,clientY:90,button:0},canvas,camera);
  assert.ok(ray.ray.direction.distanceTo(new Vector3(0,0,-1))<1e-12);
 }
});

test('重叠节点按中心距离选取，隐藏/禁用不命中，等距保持原插入顺序',()=>{
 const a=handle(20,20),b=handle(25,20),hidden=handle(25,20,16,16,{hidden:true}),disabled=handle(25,20,16,16,{disabled:true});
 assert.equal(nearestPoseHandle([a,b],{clientX:24,clientY:20}),b);
 assert.equal(nearestPoseHandle([hidden,disabled,a,b],{clientX:24,clientY:20}),b);
 assert.equal(nearestPoseHandle([a,handle(20,20)],{clientX:20,clientY:20}),a);
 assert.equal(nearestPoseHandle([a],{clientX:29,clientY:20}),null);
});

test('身体保留矩形按钮范围，手部保留固定8像素半宽，不扩大命中区',()=>{
 const wide=handle(20,20,40,10);
 assert.equal(nearestPoseHandle([wide],{clientX:38,clientY:20}),wide);
 assert.equal(nearestPoseHandle([wide],{clientX:38,clientY:20},{radius:8}),null);
 assert.equal(nearestPoseHandle([wide],{clientX:20,clientY:27}),null);
 assert.equal(nearestPoseHandle([wide],{clientX:20,clientY:27},{radius:8}),wide);
});
