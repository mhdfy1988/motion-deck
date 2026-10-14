import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mappedDefaultPoses,defaultBoneName} from '../../web/labs/motion/default-poses.js';
import {capturePose,applyPose,PoseSampler} from '../../web/labs/motion/core/sequence-core.js';
globalThis.ProgressEvent??=class {constructor(type,fields){this.type=type;Object.assign(this,fields);}};
test('真实资源：53主骨骼映射99固定姿势，完整快照不变异及绑定错误拒绝',async()=>{
 const json=JSON.parse(await readFile('fixtures/quaternius/AnimationLibrary_Godot_Standard.gltf','utf8'));json.buffers[0].uri='data:application/octet-stream;base64,'+(await readFile('fixtures/quaternius/AnimationLibrary_Godot_Standard.bin')).toString('base64');
 const loader=new GLTFLoader(),a=await loader.parseAsync(JSON.stringify(json),''),bytes=await readFile('fixtures/poses/MakeHumanPoses.glb'),b=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const before=capturePose(a.scene),poses=mappedDefaultPoses(a.scene,b.scene,b.animations);assert.equal(poses.length,99);assert.deepEqual(capturePose(a.scene),before);
 const sampler=new PoseSampler(b.scene);let maxError=0;for(let i=0;i<99;i++){applyPose(a.scene,poses[i].pose);applyPose(b.scene,sampler.sample(b.animations[i],0));const targetRoot=a.scene.getObjectByName('root'),sourceRoot=b.scene.getObjectByName('root');a.scene.updateMatrixWorld(true);b.scene.updateMatrixWorld(true);
  a.scene.traverse(bone=>{if(!bone.isBone)return;const other=b.scene.getObjectByName(defaultBoneName(bone.name)),p=bone.getWorldPosition(bone.position.clone()),q=other.getWorldPosition(other.position.clone());targetRoot.worldToLocal(p);sourceRoot.worldToLocal(q);maxError=Math.max(maxError,p.distanceTo(q));});
 }assert.ok(maxError<.0001,'对应骨骼相对根位置误差：'+maxError);applyPose(a.scene,before);b.scene.getObjectByName('hand_l').position.x+=.1;assert.throws(()=>mappedDefaultPoses(a.scene,b.scene,b.animations),/绑定姿态/);
});
