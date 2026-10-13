import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {importPoseClips} from '../../web/labs/motion/pose-import.js';
function rig(){const root=new THREE.Group(),bone=new THREE.Bone();bone.name='joint';root.add(bone);return root;}
test('单帧姿势、重复浮点四元数与独立目标快照',()=>{
 const root=rig(),source=rig(),q=[.1,.2,.3,.9273618];
 const clip=new THREE.AnimationClip('固定姿势',1,[new THREE.QuaternionKeyframeTrack('joint.quaternion',[0,1],[...q,...q])]);
 const [a]=importPoseClips(root,root.clone(true),source,[clip]);assert.deepEqual(a.pose[1].q,Array.from(clip.tracks[0].values.slice(0,4)));
 const single=new THREE.AnimationClip('单帧',0,[new THREE.VectorKeyframeTrack('joint.position',[0],[0,2,0])]);const [b]=importPoseClips(root,root.clone(true),source,[single]);assert.equal(b.pose[1].p[1],2);assert.equal(root.children[0].position.y,0);
});
test('连续动作、无动画静态模型和不兼容骨架明确拒绝',()=>{
 const root=rig(),source=rig(),clip=new THREE.AnimationClip('移动',1,[new THREE.VectorKeyframeTrack('joint.position',[0,1],[0,0,0,0,2,0])]);
 assert.throws(()=>importPoseClips(root,root.clone(true),source,[clip]),/连续动作/);assert.throws(()=>importPoseClips(root,root.clone(true),source,[]),/没有姿势动画/);source.children[0].name='other';assert.throws(()=>importPoseClips(root,root.clone(true),source,[clip]),/结构不匹配/);
});
