import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mesh2motionAddonActions,mesh2motionAddonPoses} from '../../web/labs/motion/builtin-expansion.js';
import {modelInfo,assertSameRig} from '../../web/labs/motion/platform/three-adapter.js';import {PoseSampler,capturePose} from '../../web/labs/motion/core/sequence-core.js';
globalThis.ProgressEvent??=class{constructor(type,fields){Object.assign(this,fields);}};
async function load(path){const bytes=await readFile(path),length=bytes.readUInt32LE(12),data=JSON.parse(bytes.subarray(20,20+length));data.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+length).toString('base64');delete data.images;delete data.textures;delete data.materials;for(const mesh of data.meshes??[])for(const primitive of mesh.primitives)delete primitive.material;return new GLTFLoader().parseAsync(JSON.stringify(data),'');}
test('真实附加75动作遵循官方轨道清理，不放宽通用骨架校验，16姿势不改当前模型',async()=>{
 const base=await load('fixtures/candidates/m2m-human-base-animations.glb'),source=await load('fixtures/candidates/m2m-human-addon-animations.glb');assert.throws(()=>assertSameRig(base.scene,source.scene),/初始骨骼变换/);const before=capturePose(base.scene),clips=mesh2motionAddonActions(base.scene,source.scene,source.animations);assert.equal(clips.length,75);assert.equal(new Set(clips.map(c=>c.name)).size,75);const nodes=[];base.scene.traverse(node=>nodes.push(node));const sampler=new PoseSampler(base.scene);
 for(const clip of clips){assert.ok(clip.tracks.every(track=>track.name.endsWith('.quaternion')||track.name==='pelvis.position'||/rm$/i.test(clip.name)&&track.name==='root.position'));
  for(const ratio of [0,.25,.5,.75,1]){const pose=sampler.sample(clip,clip.duration*ratio);pose.forEach((value,index)=>{assert.ok([...value.p,...value.q,...value.s].every(Number.isFinite));assert.deepEqual(value.s,before[index].s);if(!['root','pelvis'].includes(nodes[index].name))assert.deepEqual(value.p,before[index].p);});}
 }
 sampler.dispose();const snapshot=capturePose(base.scene),poses=mesh2motionAddonPoses(base.scene,clips);assert.equal(poses.length,16);assert.ok(poses.every(p=>p.id.startsWith('builtin:')));assert.deepEqual(capturePose(base.scene),snapshot);assert.equal(modelInfo(base.scene).bones.length,66);
 source.scene.getObjectByName('hand_l').name='unknown';assert.throws(()=>mesh2motionAddonActions(base.scene,source.scene,source.animations),/层级不符/);
});
