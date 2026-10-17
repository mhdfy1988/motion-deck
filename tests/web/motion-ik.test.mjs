import {test} from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';import {findLimbChains,findEditableLimbChains,LimbIK} from '../../web/labs/motion/pose/pose-ik.js';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {capturePose,applyPose,PoseSampler} from '../../web/labs/motion/core/sequence-core.js';
import {findBodyChain,TorsoDrag,PelvisDrag} from '../../web/labs/motion/pose/body-chain-controls.js';
import {createSessionState} from '../../web/labs/motion/application/session-state.js';
import {createWorkbenchOperations} from '../../web/labs/motion/application/workbench-operations.js';
globalThis.ProgressEvent??=class{constructor(type,fields){Object.assign(this,fields);}};

test('手脚单段拖动固定肘膝，腕踝局部角度不变，两模型四链',async()=>{
 for(const file of ['fixtures/quaternius/AnimationLibrary_Godot_Standard.gltf','fixtures/candidates/m2m-human-base-animations.glb']){
  const root=await rig(file);root.rotation.set(.2,.6,-.1);root.scale.setScalar(1.7);root.updateMatrixWorld(true);const original=capturePose(root);
  for(const chain of findEditableLimbChains(root)){
   applyPose(root,original);const ik=new LimbIK(chain);ik.begin();const before=capturePose(root),upper=chain.upper.quaternion.toArray(),pivot=ik.start.b.clone();
   for(let i=0;i<20;i++){ik.moveEnd(ik.start.c.clone().add(new THREE.Vector3(.1*Math.sin(i),.15,.2)));assert.ok(chain.middle.getWorldPosition(new THREE.Vector3()).distanceTo(pivot)<1e-9);assert.deepEqual(chain.upper.quaternion.toArray(),upper);assert.deepEqual(chain.end.quaternion.toArray(),ik.start.end.toArray());assert.deepEqual(capturePose(root).map(p=>[p.p,p.s]),before.map(p=>[p.p,p.s]));}
   const last=capturePose(root);ik.moveEnd(pivot);assert.deepEqual(capturePose(root),last);ik.dispose();
  }
 }
});

test('两模型躯干联动、骨盆保脚边界、统一草稿撤销保存',async()=>{
 for(const file of ['fixtures/quaternius/AnimationLibrary_Godot_Standard.gltf','fixtures/candidates/m2m-human-base-animations.glb']){
  const root=await rig(file);root.rotation.set(.2,.6,-.1);root.scale.setScalar(1.4);root.updateMatrixWorld(true);
  const body=findBodyChain(root);if(!body){const info=[];root.traverse(n=>{if(n.isBone&&/hips|spine|neck|head|pelvis/.test(n.name))info.push([n.name,n.parent.name,n.scale.toArray()]);});assert.fail(JSON.stringify(info));}assert.equal(body.legs.length,2);
  const state=createSessionState(null);state.root=root;state.modelKey=file;state.sampler=new PoseSampler(root);state.bones=[];root.traverse(n=>{if(n.isBone)state.bones.push(n);});const w=createWorkbenchOperations(state);let saved;w.configure({savePose:async poses=>{saved=structuredClone(poses);}});w.beginUserDraft();
  const before=capturePose(root),torso=new TorsoDrag(body),head=body.head.getWorldPosition(new THREE.Vector3()),feet=body.legs.map(c=>c.end.getWorldPosition(new THREE.Vector3())),hands=findEditableLimbChains(root).filter(c=>c.name.includes('手')).map(c=>({node:c.end,q:c.end.quaternion.toArray(),p:c.end.getWorldPosition(new THREE.Vector3())}));
  torso.begin();w.beginUserPoseGesture(torso.bones);torso.move(new THREE.Vector3(.1,0,.1));w.finishUserPoseGesture();assert.equal(state.poseDraft.undo.length,1);assert.ok(head.distanceTo(body.head.getWorldPosition(new THREE.Vector3()))>.001);hands.forEach(h=>{assert.deepEqual(h.node.quaternion.toArray(),h.q);assert.ok(h.node.getWorldPosition(new THREE.Vector3()).distanceTo(h.p)>.001);});body.legs.forEach((c,i)=>assert.ok(c.end.getWorldPosition(new THREE.Vector3()).distanceTo(feet[i])<1e-8));assert.deepEqual(capturePose(root).map(p=>[p.p,p.s]),before.map(p=>[p.p,p.s]));w.draftHistory('undo');assert.deepEqual(capturePose(root),before);
  const pelvis=new PelvisDrag(body);pelvis.begin();w.beginUserPoseGesture(pelvis.bones,{positionBones:pelvis.positionBones});pelvis.move(new THREE.Vector3(0,-Math.min(...pelvis.length)*.1,0));w.finishUserPoseGesture();assert.ok(body.pelvis.position.distanceTo(pelvis.local)>.001);body.legs.forEach((c,i)=>assert.ok(c.end.getWorldPosition(new THREE.Vector3()).distanceTo(feet[i])<pelvis.length[i]*1.1e-5));assert.equal(state.poseDraft.undo.length,1);
  const after=capturePose(root);pelvis.begin();w.beginUserPoseGesture(pelvis.bones,{positionBones:pelvis.positionBones});pelvis.move(new THREE.Vector3(100,100,100));body.legs.forEach((c,i)=>assert.ok(c.end.getWorldPosition(new THREE.Vector3()).distanceTo(pelvis.feet[i])<pelvis.length[i]*1.1e-5));w.finishUserPoseGesture(true);assert.deepEqual(capturePose(root),after);
  assert.throws(()=>w.beginUserPoseGesture([body.head],{positionBones:[body.head]}),{code:'INVALID_ARGUMENT'});assert.equal(state.busy,false);
  w.draftHistory('undo');assert.deepEqual(capturePose(root),before);w.draftHistory('redo');assert.deepEqual(capturePose(root),after);await w.saveDraft({name:'躯干骨盆测试',confirmed:true});assert.deepEqual(saved[0].pose,after);torso.dispose();pelvis.dispose();
 }
});

test('直接拖肘膝只转父骨：真实两模型四链、直弯肢体、末端位置朝向自然跟随',async()=>{
 for(const file of ['fixtures/quaternius/AnimationLibrary_Godot_Standard.gltf','fixtures/candidates/m2m-human-base-animations.glb']){
  const root=await rig(file);root.rotation.set(.2,.6,-.1);root.scale.setScalar(1.7);root.position.set(2,1,-3);root.updateMatrixWorld(true);const original=capturePose(root);
  for(const chain of findEditableLimbChains(root))for(const bent of [false,true]){
   applyPose(root,original);const ik=new LimbIK(chain);ik.begin();if(bent)ik.move(ik.start.a.clone().lerp(ik.start.c,.65));ik.begin();const s=ik.start,before=capturePose(root),up=new THREE.Vector3(0,1,0).applyQuaternion(root.quaternion),endWorld=chain.end.getWorldQuaternion(new THREE.Quaternion()).normalize();
   for(let i=0;i<20;i++){
    const target=s.b.clone().addScaledVector(up,s.l1*(.2+Math.sin(i*.3)*.6)),direction=target.clone().sub(s.a).normalize(),swing=new THREE.Quaternion().setFromUnitVectors(s.b.clone().sub(s.a).normalize(),direction);ik.moveJoint(target);
    const b=chain.middle.getWorldPosition(new THREE.Vector3()),end=chain.end.getWorldPosition(new THREE.Vector3()),expected=s.c.clone().sub(s.a).applyQuaternion(swing).add(s.a);
    assert.ok(b.clone().sub(s.a).normalize().dot(direction)>1-1e-9);assert.ok(end.distanceTo(expected)<(s.l1+s.l2)*1e-5);assert.ok(Math.abs(b.distanceTo(s.a)-s.l1)<s.l1*1e-5);assert.ok(Math.abs(end.distanceTo(b)-s.l2)<s.l2*1e-5);
    assert.deepEqual(chain.middle.quaternion.toArray(),s.middle.toArray());assert.deepEqual(chain.end.quaternion.toArray(),s.end.toArray());assert.ok(chain.end.getWorldQuaternion(new THREE.Quaternion()).normalize().angleTo(endWorld.clone().premultiply(swing))<1e-5);
    assert.deepEqual(capturePose(root).map(p=>[p.p,p.s]),before.map(p=>[p.p,p.s]));
   }
   const last=capturePose(root);ik.moveJoint(s.a.clone());assert.deepEqual(capturePose(root),last);ik.dispose();
  }
 }
});

test('完全伸直也能直接抬臂，180度摆向保持有限且不改骨长',()=>{
 const root=new THREE.Group(),upper=new THREE.Bone(),middle=new THREE.Bone(),end=new THREE.Bone();middle.position.x=1;end.position.x=1;root.add(upper);upper.add(middle);middle.add(end);const ik=new LimbIK({root,upper,middle,end,constraint:{poleZ:-1,maxBend:2.7}});ik.begin();
 ik.moveJoint(new THREE.Vector3(0,1,0));assert.ok(end.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(0,2,0))<1e-8);ik.moveJoint(new THREE.Vector3(-1,0,0));assert.ok(end.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(-2,0,0))<1e-8);assert.deepEqual(middle.quaternion.toArray(),[0,0,0,1]);assert.deepEqual(end.quaternion.toArray(),[0,0,0,1]);
});
async function rig(file){let data;if(file.endsWith('.gltf')){data=JSON.parse(await readFile(file,'utf8'));data.buffers[0].uri='data:application/octet-stream;base64,'+(await readFile(file.replace('.gltf','.bin'))).toString('base64');}else{const b=await readFile(file),length=b.readUInt32LE(12);data=JSON.parse(b.subarray(20,20+length));data.buffers[0].uri='data:application/octet-stream;base64,'+b.subarray(28+length).toString('base64');}delete data.materials;delete data.textures;delete data.images;for(const m of data.meshes)for(const p of m.primitives)delete p.material;return (await new GLTFLoader().parseAsync(JSON.stringify(data),'')).scene;}
test('两种真实人偶：关节限幅、肘膝方向拖动与端点保持，世界变换后骨长不变',async()=>{
 for(const file of ['fixtures/quaternius/AnimationLibrary_Godot_Standard.gltf','fixtures/candidates/m2m-human-base-animations.glb']){
  const scene=await rig(file);scene.rotation.y=.6;scene.scale.setScalar(1.7);scene.position.set(2,1,-3);scene.updateMatrixWorld(true);const before=capturePose(scene),chains=findLimbChains(scene);assert.equal(chains.length,4);assert.ok(chains.every(c=>c.constraint),file);
  for(const chain of chains){applyPose(scene,before);scene.updateMatrixWorld(true);const ik=new LimbIK(chain),original=chain.mesh.skeleton.bones.map(b=>[b.position.toArray(),b.scale.toArray(),b.parent?.uuid]),a=chain.upper.getWorldPosition(new THREE.Vector3()),c=chain.end.getWorldPosition(new THREE.Vector3()),length=a.distanceTo(c),direction=c.clone().sub(a).normalize();
   for(const ratio of [2,.01,.6,.9]){ik.begin();const end=ik.move(a.clone().addScaledVector(direction,length*ratio)),middle=chain.middle.getWorldPosition(new THREE.Vector3()),u=middle.clone().sub(a),v=end.clone().sub(middle);assert.ok(Number.isFinite(end.length()));assert.ok(u.angleTo(v)<=chain.constraint.maxBend+1e-5);assert.deepEqual(chain.mesh.skeleton.bones.map(b=>[b.position.toArray(),b.scale.toArray(),b.parent?.uuid]),original);}
   ik.begin();const end=chain.end.getWorldPosition(new THREE.Vector3()),middle=chain.middle.getWorldPosition(new THREE.Vector3()),q=chain.end.getWorldQuaternion(new THREE.Quaternion()),side=new THREE.Vector3().crossVectors(end.clone().sub(a),middle.clone().sub(a)).normalize();
   ik.movePole(middle.clone().addScaledVector(side,length*.4));assert.ok(chain.end.getWorldPosition(new THREE.Vector3()).distanceTo(end)<length*1e-5,'弯曲肢体拖中间关节保持末端');assert.ok(chain.middle.getWorldPosition(new THREE.Vector3()).distanceTo(middle)>length*.01);assert.ok(chain.end.getWorldQuaternion(new THREE.Quaternion()).normalize().angleTo(q.normalize())<1e-5);assert.deepEqual(chain.mesh.skeleton.bones.map(b=>[b.position.toArray(),b.scale.toArray(),b.parent?.uuid]),original);
   for(let i=0;i<30;i++){ik.movePole(middle.clone().addScaledVector(side,length*Math.sin(i*.2)));assert.ok(chain.end.getWorldPosition(new THREE.Vector3()).distanceTo(end)<length*1e-5,'连续调方向不移动末端');assert.ok(chain.upper.getWorldPosition(new THREE.Vector3()).distanceTo(a)<length*1e-8);assert.ok(chain.end.getWorldQuaternion(new THREE.Quaternion()).normalize().angleTo(q)<1e-5);}
   ik.dispose();
  }
 }
});
test('真实白模四条IK链，拖动不改骨长、节点和蒙皮骨架',async()=>{
 const b=await readFile('fixtures/candidates/m2m-human-base-animations.glb'),length=b.readUInt32LE(12),data=JSON.parse(b.subarray(20,20+length));data.buffers[0].uri='data:application/octet-stream;base64,'+b.subarray(28+length).toString('base64');delete data.materials;delete data.textures;delete data.images;for(const m of data.meshes)for(const p of m.primitives)delete p.material;
 const {scene}=await new GLTFLoader().parseAsync(JSON.stringify(data),''),before=capturePose(scene),chains=findLimbChains(scene);assert.equal(chains.length,4);
 for(const chain of chains){applyPose(scene,before);scene.updateMatrixWorld(true);const original=chain.mesh.skeleton.bones.map(b=>[b.name,b.position.toArray(),b.scale.toArray(),b.parent?.name]),upper=chain.upper.getWorldPosition(new THREE.Vector3()),end=chain.end.getWorldPosition(new THREE.Vector3()),target=upper.clone().lerp(end,.7).add(new THREE.Vector3(0,end.distanceTo(upper)*.15,0)),ik=new LimbIK(chain);const distance=end.distanceTo(target);assert.ok(ik.move(target).distanceTo(target)<distance*.25,chain.name);assert.deepEqual(chain.mesh.skeleton.bones.map(b=>[b.name,b.position.toArray(),b.scale.toArray(),b.parent?.name]),original);assert.equal(capturePose(scene).length,before.length);ik.dispose();}
});

test('手动入口仅开放明确骨链及正向均匀缩放，连续求解不积累骨长/腕部扭转',async()=>{
 for(const file of ['fixtures/quaternius/AnimationLibrary_Godot_Standard.gltf','fixtures/candidates/m2m-human-base-animations.glb']){
  const root=await rig(file);root.rotation.set(.2,.6,-.1);root.scale.setScalar(1.4);root.updateMatrixWorld(true);
  const chains=findEditableLimbChains(root);assert.equal(chains.length,4,file);
  for(const chain of chains){
   const before=capturePose(root),ik=new LimbIK(chain);ik.begin();const wrist=chain.end.getWorldQuaternion(new THREE.Quaternion()).normalize(),a=chain.upper.getWorldPosition(new THREE.Vector3()),c=chain.end.getWorldPosition(new THREE.Vector3()),l=c.distanceTo(a);
   const local=chain.mesh.skeleton.bones.map(b=>[b.position.toArray(),b.scale.toArray()]);
   for(let i=0;i<30;i++){ik.move(a.clone().lerp(c,.75).add(new THREE.Vector3(Math.sin(i*.2)*l*.15,Math.cos(i*.2)*l*.15,l*.12)));assert.ok(chain.end.getWorldQuaternion(new THREE.Quaternion()).normalize().angleTo(wrist)<1e-6,`${file} ${chain.name} frame ${i}`);for(const b of [chain.upper,chain.middle,chain.end])assert.ok(Math.abs(b.quaternion.length()-1)<1e-6);}
   assert.deepEqual(chain.mesh.skeleton.bones.map(b=>[b.position.toArray(),b.scale.toArray()]),local);applyPose(root,before);ik.dispose();
  }
  root.scale.set(1,2,1);assert.equal(findEditableLimbChains(root).length,0);
  root.scale.set(-1,-1,-1);assert.equal(findEditableLimbChains(root).length,0);
 }
});
test('IK拉动末端，旋转关节，不修改骨长或原骨架',()=>{const root=new THREE.Group(),upper=new THREE.Bone(),middle=new THREE.Bone(),end=new THREE.Bone();upper.name='arm';middle.name='forearm';end.name='DEF-handL';middle.position.x=1;end.position.x=1;upper.add(middle);middle.add(end);root.add(upper);const mesh=new THREE.SkinnedMesh();mesh.skeleton=new THREE.Skeleton([upper,middle,end]);root.add(mesh);root.updateMatrixWorld(true);const chain=findLimbChains(root)[0];assert.equal(chain.name,'左手');const ik=new LimbIK(chain),target=new THREE.Vector3(1,1,0);const before=end.getWorldPosition(new THREE.Vector3()).distanceTo(target),after=ik.move(target).distanceTo(target);assert.ok(after<before*.1);assert.equal(middle.position.length(),1);assert.equal(end.position.length(),1);assert.equal(mesh.skeleton.bones.length,3);assert.equal(root.children.length,2);ik.dispose();});

test('伸直或近伸直拒绝调肘方向，不偷偷回收末端或改变姿势',()=>{
 const root=new THREE.Group(),upper=new THREE.Bone(),middle=new THREE.Bone(),end=new THREE.Bone();middle.position.x=1;end.position.x=1;root.add(upper);upper.add(middle);middle.add(end);
 const ik=new LimbIK({root,upper,middle,end,constraint:{maxBend:2.7,poleZ:-1}});
 for(const angle of [0,.001]){middle.rotation.z=angle;root.updateMatrixWorld(true);ik.begin();const before=capturePose(root);assert.throws(()=>ik.movePole(new THREE.Vector3(1,1,0)),/接近伸直/);assert.deepEqual(capturePose(root),before);}
});
