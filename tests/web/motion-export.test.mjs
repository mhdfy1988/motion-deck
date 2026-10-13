import {test} from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {PoseSampler,capturePose} from '../../web/labs/motion/sequence-core.js';
import {bakeExportAction,exportTimes,exportName} from '../../web/labs/motion/motion-export.js';
test('导出烘焙保留裁剪、变速、姿势停留与过渡且不依赖内部配方',()=>{
 const root=new THREE.Group(),bone=new THREE.Bone();bone.name='joint';root.add(bone);const sampler=new PoseSampler(root),pose=capturePose(root),clip=new THREE.AnimationClip('源',2,[new THREE.VectorKeyframeTrack('joint.position',[0,.37,2],[0,0,0,3,0,0,5,0,0])]);
 const items=[{kind:'action',name:'起手',clip,in:.1,out:1.8,duration:.8},{kind:'pose',name:'停留',pose,duration:.3,transition:.35}],result=bakeExportAction(root,sampler,items,'成品');assert.equal(result.duration,1.45);assert.equal(result.name,'成品');assert.ok(result.tracks.length);assert.equal(result.recipeItems,undefined);assert.ok(result.tracks.every(track=>track.times.at(-1)===Math.fround(1.45)));assert.ok(result.tracks.every(track=>Array.from(track.times).every((time,i,array)=>i===0||time>array[i-1])));assert.throws(()=>exportTimes({duration:181,spans:[]}),/180/);assert.equal(exportName('../a:b'),'.._a_b');sampler.dispose();
});
