import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group,SkinnedMesh,Bone,Skeleton,BoxGeometry,MeshBasicMaterial,Uint16BufferAttribute,Float32BufferAttribute} from 'three';
import {boundsSampleTimes,measureMotionBounds} from '../../web/labs/motion/motion-bounds.js';
import {capturePose} from '../../web/labs/motion/sequence-core.js';
test('取景覆盖30fps与关键时刻，过长任务明确拒绝',()=>{const times=boundsSampleTimes(.1,[.013,.02,.013]);assert.ok(times.includes(.013));assert.equal(times[0],0);assert.equal(times.at(-1),.1);assert.equal(new Set(times).size,times.length);assert.throws(()=>boundsSampleTimes(100),/分段/);assert.throws(()=>boundsSampleTimes(NaN),/无效/);});
test('真实蒙皮顶点范围随骨骼变化，完成与失败均恢复姿势',()=>{
 const root=new Group(),bone=new Bone(),geometry=new BoxGeometry(),n=geometry.attributes.position.count;geometry.setAttribute('skinIndex',new Uint16BufferAttribute(new Uint16Array(n*4),4));const weights=new Float32Array(n*4);for(let i=0;i<n;i++)weights[i*4]=1;geometry.setAttribute('skinWeight',new Float32BufferAttribute(weights,4));const mesh=new SkinnedMesh(geometry,new MeshBasicMaterial());root.add(bone,mesh);root.updateMatrixWorld(true);mesh.bind(new Skeleton([bone]));const before=capturePose(root);
 const box=measureMotionBounds(root,{times:[0,.5,1],sample:t=>{bone.position.y=t*3;return capturePose(root);}});assert.ok(box.max.y>=3.5);assert.ok(box.min.y<=-.5);assert.deepEqual(capturePose(root),before);
 assert.throws(()=>measureMotionBounds(root,{times:[0,1],sample:t=>{bone.position.y=8;if(t)throw new Error('采样失败');return capturePose(root);}}),/采样失败/);assert.deepEqual(capturePose(root),before);geometry.dispose();mesh.material.dispose();mesh.skeleton.dispose();
});
