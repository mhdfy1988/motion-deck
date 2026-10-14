import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {FullBodyRig} from '../../web/labs/motion/fullbody-rig.js';
import {capturePose,applyPose,PoseSampler} from '../../web/labs/motion/core/sequence-core.js';
globalThis.ProgressEvent??=class{constructor(type,fields){Object.assign(this,fields);}};
async function fixture(file){
 let data;if(file.endsWith('.gltf')){data=JSON.parse(await readFile(file,'utf8'));data.buffers[0].uri='data:application/octet-stream;base64,'+(await readFile(file.replace('.gltf','.bin'))).toString('base64');}
 else{const b=await readFile(file),len=b.readUInt32LE(12);data=JSON.parse(b.subarray(20,20+len));data.buffers[0].uri='data:application/octet-stream;base64,'+b.subarray(28+len).toString('base64');}
 delete data.materials;delete data.textures;delete data.images;for(const mesh of data.meshes)for(const p of mesh.primitives)delete p.material;
 return new GLTFLoader().parseAsync(JSON.stringify(data),'');
}
for(const [model,file] of [['quaternius','fixtures/quaternius/AnimationLibrary_Godot_Standard.gltf'],['mesh2motion','fixtures/candidates/m2m-human-base-animations.glb']])test(`${model} 全身试验：保持双脚拖胸、跨肢体联动、骨长、取消与不可达目标`,async()=>{
 const {scene,animations}=await fixture(file),sampler=new PoseSampler(scene),clip=animations.find(c=>/^(Idle_Loop|Idle|Standing_Idle)$/i.test(c.name));
 if(clip)applyPose(scene,sampler.sample(clip,0));scene.rotation.y=.4;scene.scale.setScalar(1.2);scene.updateMatrixWorld(true);
 const rig=new FullBodyRig(scene),before=capturePose(scene),invariants=rig.bones.map(b=>[b,b.position.clone(),b.scale.clone(),b.parent]),originalRotations=new Map(rig.bones.map(b=>[b,b.quaternion.clone().normalize()]));
 const pins=new Map(['左脚','右脚'].map(n=>[n,{position:rig.point(n),rotation:rig.orientation(n)}]));
 const chest=rig.point('胸'),target=chest.clone().add(new THREE.Vector3(.08,-.08,.1).multiplyScalar(rig.size));
 rig.begin('胸',pins);let report;for(let i=1;i<=6;i++)report=rig.move(chest.clone().lerp(target,i/6));
 console.log(model,JSON.stringify(report));
 assert.ok(report.errors.every(e=>e.position<.015),'所有目标位置误差应小于身高1.5%');
 const changed=rig.bones.filter(b=>originalRotations.get(b).angleTo(b.quaternion.clone().normalize())>.01);
 assert.ok(changed.some(b=>b===rig.parts.get('左大腿')||b===rig.parts.get('左膝')),'左腿参与');
 assert.ok(changed.some(b=>b===rig.parts.get('右大腿')||b===rig.parts.get('右膝')),'右腿参与');
 for(const [bone,p,s,parent] of invariants){if(bone!==rig.pelvis)assert.deepEqual(bone.position.toArray(),p.toArray());assert.deepEqual(bone.scale.toArray(),s.toArray());assert.equal(bone.parent,parent);}
 applyPose(scene,before);assert.deepEqual(capturePose(scene),before);
 const head=rig.point('头'),rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.25).multiply(rig.orientation('头'));rig.begin('头',pins,'rotation');for(let i=0;i<3;i++)report=rig.move(head,rotation);
 assert.ok(rig.orientation('头').angleTo(rotation)<.03,'位置和旋转目标同时求解');
 applyPose(scene,before);const chestRotation=rig.orientation('胸'),rotationPin=new Map([['胸',{position:null,rotation:chestRotation}]]);rig.begin('骨盆',rotationPin);const pelvisTarget=rig.point('骨盆').add(new THREE.Vector3(.05,0,0).multiplyScalar(rig.size));report=rig.move(pelvisTarget);assert.ok(rig.orientation('胸').angleTo(chestRotation)<.03,'只保持朝向，不假装保持位置');
 applyPose(scene,before);
 rig.begin('头',pins);report=rig.move(rig.point('头').add(new THREE.Vector3(0,rig.size*3,0)));assert.ok(report.errors.some(e=>e.position>.1));
 for(const [bone,p,s,parent] of invariants){if(bone!==rig.pelvis)assert.deepEqual(bone.position.toArray(),p.toArray());assert.deepEqual(bone.scale.toArray(),s.toArray());assert.equal(bone.parent,parent);}
 assert.ok(capturePose(scene).every(p=>[...p.p,...p.q,...p.s].every(Number.isFinite)));applyPose(scene,before);scene.scale.x*=2;scene.updateMatrixWorld(true);assert.throws(()=>new FullBodyRig(scene),/等比/);sampler.dispose();
});

for(const [model,file] of [['quaternius','fixtures/quaternius/AnimationLibrary_Godot_Standard.gltf'],['mesh2motion','fixtures/candidates/m2m-human-base-animations.glb']])test(`${model} 稳定性回归：拖手不带乱上身，拖膝不带乱手臂，超范围有残差`,async()=>{
 const {scene,animations}=await fixture(file),sampler=new PoseSampler(scene),idle=animations.find(c=>/^(Idle_Loop|Idle|Standing_Idle)$/i.test(c.name));if(idle)applyPose(scene,sampler.sample(idle,0));
 scene.rotation.y=.35;scene.scale.setScalar(1.3);scene.updateMatrixWorld(true);const rig=new FullBodyRig(scene),before=capturePose(scene);
 const pins=new Map(['左脚','右脚'].map(n=>[n,{position:rig.point(n),rotation:rig.orientation(n)}]));
 const probe=names=>new Map(names.map(n=>[n,{p:rig.point(n),q:rig.orientation(n)}]));
 // 向肩内收再抬起：先选臂长以内的目标，避免把“不可达目标不乱动”误测成跟随失败。
 const start=rig.point('左手'),target=start.clone().lerp(rig.point('左肩'),.25).add(new THREE.Vector3(0,.08,.08).multiplyScalar(rig.size));
 const body=probe(['胸','头','右手']),arm=rig.parts.get('左肘'),armBefore=arm.quaternion.clone();
 rig.begin('左手',pins);let report;for(let i=1;i<=8;i++)report=rig.move(start.clone().lerp(target,i/8));
 const stableDrift=Math.max(...[...body].map(([name,v])=>rig.point(name).distanceTo(v.p)/rig.size));
 console.log(model,'拖手稳定性',JSON.stringify({stableDrift,report}));
 assert.ok(stableDrift<.04,'上身与另一只手漂移低于身高4%');assert.ok(rig.point('左手').distanceTo(target)/rig.size<.02,'手仍能接近目标');assert.ok(arm.quaternion.angleTo(armBefore)>.04,'关节不是定死');
 for(const {joint} of rig.entries.values())for(const d of joint.dof){assert.ok(joint.getDoFValue(d)>=joint.getMinLimit(d)-1e-6);assert.ok(joint.getDoFValue(d)<=joint.getMaxLimit(d)+1e-6);}
 assert.equal(report.participation.near,0,'局部能完成时不放开邻近');assert.equal(report.participation.support,0);assert.ok(stableDrift<1e-5,'局部调整中无关身体点保持原位');
 applyPose(scene,before);const knee=rig.point('左膝'),hands=probe(['左手','右手','胸']);rig.begin('左膝',pins);const kneeTarget=knee.clone().add(new THREE.Vector3(0,.025,.025).multiplyScalar(rig.size));for(let i=1;i<=6;i++)report=rig.move(knee.clone().lerp(kneeTarget,i/6));
 assert.ok(rig.point('左膝').distanceTo(knee)>rig.size*.01,'膝仍可移动');assert.ok(Math.max(...[...hands].map(([name,v])=>rig.point(name).distanceTo(v.p)/rig.size))<.06,'拖膝不牵动大幅上身调整');
 applyPose(scene,before);rig.begin('左手',pins);report=rig.move(start.clone().add(new THREE.Vector3(0,2*rig.size,0)));assert.equal(report.limited,true);assert.ok(report.errors.at(-1).position>.3,'不靠扩大到全身满足远目标');
 sampler.dispose();
});

for(const [model,file] of [['quaternius','fixtures/quaternius/AnimationLibrary_Godot_Standard.gltf'],['mesh2motion','fixtures/candidates/m2m-human-base-animations.glb']])test(`${model} 渐进联动：剩余误差驱动、分级平滑、拉回收敛及不累积`,async()=>{
 const {scene}=await fixture(file),rig=new FullBodyRig(scene),before=capturePose(scene),start=rig.point('左手'),out=start.clone().sub(rig.point('左肩')).normalize(),pins=new Map(['左脚','右脚'].map(n=>[n,{position:rig.point(n),rotation:rig.orientation(n)}]));
 rig.begin('左手',pins);const rows=[];let previous=0,partial=false,lastPoints=new Map([...rig.parts.keys()].map(n=>[n,rig.point(n)]));
 for(let i=0;i<=40;i++){const target=start.clone().addScaledVector(out,rig.size*i*.003),r=rig.move(target);rows.push(r.participation);assert.ok(r.participation.near>=previous-.01,'逐渐外拉不会突然收紧');previous=r.participation.near;if(previous>.02&&previous<.98)partial=true;
  for(const {joint} of rig.entries.values())for(const d of joint.dof)assert.ok(joint.getDoFValue(d)<=joint.getMaxLimit(d)+1e-6&&joint.getDoFValue(d)>=joint.getMinLimit(d)-1e-6);
  for(const n of ['左肩','胸','骨盆']){const p=rig.point(n);assert.ok(p.distanceTo(lastPoints.get(n))/rig.size<.015,'被带动部位逐步移动，不出现大幅突跳');lastPoints.set(n,p);}
 }
 assert.equal(rows[0].near,0);assert.equal(rows[0].support,0);assert.ok(partial,'存在中间参与程度，不是开关');assert.ok(rows.at(-1).near>.8);assert.ok(rows.at(-1).support>.1,'邻近仍不足才让周边配合');
 const back=rig.move(start);assert.equal(back.participation.near,0);assert.equal(back.participation.support,0);assert.ok(rig.point('左手').distanceTo(start)/rig.size<.001);
 const target=start.clone().addScaledVector(out,rig.size*.03),first=rig.move(target),pose=capturePose(scene);for(let i=0;i<10;i++){const r=rig.move(target);assert.ok(Math.abs(r.participation.near-first.participation.near)<1e-8);const current=capturePose(scene);for(let n=0;n<pose.length;n++)assert.ok(new THREE.Quaternion().fromArray(pose[n].q).normalize().angleTo(new THREE.Quaternion().fromArray(current[n].q).normalize())<1e-5,'同目标反复求解不累积姿势');}
 applyPose(scene,before);assert.deepEqual(capturePose(scene),before);console.log(model,'渐进范围',rows.filter((_,i)=>i%8===0));
});
