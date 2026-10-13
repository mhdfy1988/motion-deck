import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mappedDefaultActions,defaultBoneName} from '../../web/labs/motion/default-poses.js';
import {capturePose,applyPose,PoseSampler} from '../../web/labs/motion/sequence-core.js';
globalThis.ProgressEvent??=class{constructor(type,fields){Object.assign(this,fields);}};
test('真实UAL2：43动作映射、731个采样点的主骨骼一致，源不变异、未知轨道拒绝',async()=>{
 const loader=new GLTFLoader(),j=JSON.parse(await readFile('fixtures/quaternius/AnimationLibrary_Godot_Standard.gltf','utf8'));
 j.buffers[0].uri='data:application/octet-stream;base64,'+(await readFile('fixtures/quaternius/AnimationLibrary_Godot_Standard.bin')).toString('base64');
 const a=await loader.parseAsync(JSON.stringify(j),''),b=await readFile('fixtures/candidates/ual2/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb');
 // 结构采样不需要贴图；原始带贴图GLB另由Chrome验收。
 const length=b.readUInt32LE(12),data=JSON.parse(b.subarray(20,20+length));data.buffers[0].uri='data:application/octet-stream;base64,'+b.subarray(28+length).toString('base64');delete data.materials;delete data.textures;delete data.images;for(const m of data.meshes)for(const p of m.primitives)delete p.material;
 const source=await loader.parseAsync(JSON.stringify(data),''),before=capturePose(a.scene),sourceBefore=capturePose(source.scene),tracks=source.animations.map(c=>c.tracks.map(t=>t.name));
 const clips=mappedDefaultActions(a.scene,source.scene,source.animations);assert.equal(clips.length,43);assert.deepEqual(capturePose(a.scene),before);assert.deepEqual(source.animations.map(c=>c.tracks.map(t=>t.name)),tracks);
 const targetSampler=new PoseSampler(a.scene),sourceSampler=new PoseSampler(source.scene);let maxError=0;
 for(let i=0;i<clips.length;i++)for(let frame=0;frame<=16;frame++){
  const time=clips[i].duration*frame/16;applyPose(a.scene,targetSampler.sample(clips[i],time));applyPose(source.scene,sourceSampler.sample(source.animations[i],time));a.scene.updateMatrixWorld(true);source.scene.updateMatrixWorld(true);
  const ar=a.scene.getObjectByName('root'),br=source.scene.getObjectByName('root');
  a.scene.traverse(bone=>{if(!bone.isBone)return;const other=source.scene.getObjectByName(defaultBoneName(bone.name)),ap=bone.getWorldPosition(bone.position.clone()),bp=other.getWorldPosition(other.position.clone());ar.worldToLocal(ap);br.worldToLocal(bp);maxError=Math.max(maxError,ap.distanceTo(bp));});
 }
 assert.ok(maxError<.0001,'主骨骼采样误差：'+maxError);targetSampler.dispose();sourceSampler.dispose();applyPose(a.scene,before);applyPose(source.scene,sourceBefore);
 const invalid=source.animations[0].clone();invalid.tracks[0].name='unknown.position';assert.throws(()=>mappedDefaultActions(a.scene,source.scene,[invalid]),/未知轨道/);
});
