import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createModelScene} from '../../web/labs/motion/platform/model-scene.js';

function model(){
 const root=new THREE.Group(),bone=new THREE.Bone(),child=new THREE.Bone();child.position.y=1;bone.add(child);root.add(bone);
 root.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));root.updateMatrixWorld(true);return root;
}

test('场景适配只释放旧资源，挂载候选的骨架辅助和范围使用原几何口径',()=>{
 const root=model(),scene=new THREE.Scene(),grid=new THREE.GridHelper(),helper=new THREE.SkeletonHelper(root);
 scene.add(root,helper,grid);let samplerDisposed=0,helperDisposed=0,meshDisposed=0;
 helper.geometry.addEventListener('dispose',()=>helperDisposed++);root.children[1].geometry.addEventListener('dispose',()=>meshDisposed++);
 const state={root,helper,sampler:{dispose:()=>samplerDisposed++}},adapter=createModelScene({state,scene,grid,isSkeletonVisible:()=>false});
 adapter.releaseCurrent();assert.equal(samplerDisposed,1);assert.equal(helperDisposed,1);assert.equal(meshDisposed,1);assert.equal(scene.children.includes(root),false);
 assert.equal(state.root,null);assert.equal(state.sampler,null);assert.equal(state.helper,null);
 adapter.releaseCurrent();assert.equal(samplerDisposed,1);assert.equal(helperDisposed,1);assert.equal(meshDisposed,1);
 state.root=model();state.sampler=adapter.createSampler(state.root);
 const box=new THREE.Box3(new THREE.Vector3(-2,-1,-2),new THREE.Vector3(2,3,2));adapter.attach({box,size:8});
 assert.ok(scene.children.includes(state.root));assert.ok(scene.children.includes(state.helper));assert.equal(state.helper.visible,false);
 assert.notEqual(state.bounds,box);assert.deepEqual(state.center.toArray(),[0,1,0]);assert.equal(grid.position.y,-1);assert.equal(grid.scale.x,2);
 adapter.releaseCurrent();grid.geometry.dispose();grid.material.dispose();
});

test('未发布候选释放不碰当前场景资源',()=>{
 const root=model(),candidate=model(),scene=new THREE.Scene(),grid=new THREE.GridHelper();let oldDisposed=0,newDisposed=0;
 root.children[1].geometry.addEventListener('dispose',()=>oldDisposed++);candidate.children[1].geometry.addEventListener('dispose',()=>newDisposed++);
 scene.add(root);const adapter=createModelScene({state:{root},scene,grid,isSkeletonVisible:()=>true});adapter.releaseCandidate({root:candidate});
 assert.equal(oldDisposed,0);assert.equal(newDisposed,1);assert.ok(scene.children.includes(root));
 root.children[1].geometry.dispose();root.children[1].material.dispose();grid.geometry.dispose();grid.material.dispose();
});
