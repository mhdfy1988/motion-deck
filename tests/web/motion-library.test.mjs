import {test} from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {encodeAction,decodeAction,validateLibrary,modelKey} from '../../web/labs/motion/action-library.js';
import {PoseSampler,compileSequence,sampleSequence,capturePose} from '../../web/labs/motion/sequence-core.js';
import {validatePoses} from '../../web/labs/motion/action-library.js';
test('姿势库兼容旧动作快照，校验姿势形状、重复身份与模型节点数',()=>{
 const root=new THREE.Group(),key='a'.repeat(64),pose=capturePose(root),entry={id:'p1',name:'站立',pose};
 validateLibrary({version:1,modelKey:key,actions:[]},key);
 validateLibrary({version:1,modelKey:key,actions:[],poses:[entry]},key);validatePoses([entry],root);
 assert.throws(()=>validateLibrary({version:1,modelKey:key,actions:[],poses:[entry,entry]},key));
 assert.throws(()=>validateLibrary({version:1,modelKey:key,actions:[],poses:[{...entry,pose:[{p:[0],q:[0,0,0,1],s:[1,1,1]}]}]},key));
 assert.throws(()=>validatePoses([{...entry,pose:[]}],root),/不匹配/);
});
test('默认和自定义姿势允许同名，组内重复及重复身份仍拒绝',()=>{
 const key='a'.repeat(64),pose=capturePose(new THREE.Group()),builtin={id:'builtin:one',name:'站立',pose},custom={id:'mine',name:'站立',pose};
 validateLibrary({version:1,modelKey:key,actions:[],poses:[builtin,custom]},key);
 assert.throws(()=>validateLibrary({version:1,modelKey:key,actions:[],poses:[custom,{...custom,id:'other'}]},key),/重复条目/);
 assert.throws(()=>validateLibrary({version:1,modelKey:key,actions:[],poses:[builtin,{...builtin,name:'不同名称'}]},key),/重复条目/);
});
test('姿势和动作共用编排协议，保存后过渡采样不丢失',()=>{
 const root=new THREE.Group(),sampler=new PoseSampler(root),a=capturePose(root);root.position.x=4;const b=capturePose(root);
 const items=[{kind:'pose',name:'起点',pose:a,duration:1,transition:0},{kind:'pose',name:'终点',pose:b,duration:1,transition:.5}],saved=encodeAction(items,'id','移动'),restored=decodeAction(saved,root),sequence=compileSequence(restored,sampler);
 assert.equal(sampleSequence(sequence,1.25,sampler).pose[0].p[0],2);assert.equal(sequence.duration,2.5);sampler.dispose();
});
test('保存编排保留源范围与过渡，恢复采样一致并重新生成身份',()=>{
 const root=new THREE.Group(),bone=new THREE.Bone();bone.name='joint';root.add(bone);const sampler=new PoseSampler(root),clip=new THREE.AnimationClip('walk',2,[new THREE.VectorKeyframeTrack('joint.position',[0,2],[0,0,0,20,0,0])]);
 const items=[{id:'a',kind:'action',name:'walk',clip,in:.2,out:1,transition:0},{id:'b',kind:'action',name:'walk',clip,in:1.2,out:1.8,transition:.35}],encoded=encodeAction(items,'custom','我的动作'),key='a'.repeat(64);
 validateLibrary({version:1,modelKey:key,actions:[encoded]},key);assert.equal(encoded.clips.length,1);const restored=decodeAction(JSON.parse(JSON.stringify(encoded)),2);assert.notEqual(restored[0].id,'a');const a=compileSequence(items,sampler),b=compileSequence(restored,sampler);assert.equal(a.duration,b.duration);for(const t of [0,.5,.8,1,1.15,1.7])assert.deepEqual(sampleSequence(a,t,sampler).pose,sampleSequence(b,t,sampler).pose);sampler.dispose();
});
test('模型身份不依赖选择顺序，相同文件名不同内容不共用库',async()=>{const a=new File(['x'],'a.gltf'),b=new File(['y'],'b.bin');assert.equal(await modelKey([a,b]),await modelKey([b,a]));assert.notEqual(await modelKey([a]),await modelKey([new File(['changed'],'a.gltf')]));});
test('损坏版本、跨模型与源动作缺失拒绝',()=>{const key='a'.repeat(64);assert.throws(()=>validateLibrary({version:99,modelKey:key,actions:[]},key));assert.throws(()=>validateLibrary({version:1,modelKey:key,actions:[]},'b'.repeat(64)));assert.throws(()=>decodeAction({clips:[],items:[{kind:'action',clipIndex:0}]},1),/缺失/);});
test('无名节点的UUID动画绑定在重新载入后恢复到对应节点',()=>{
 const original=new THREE.Group(),node=new THREE.Bone();original.add(node);const clip=new THREE.AnimationClip('匿名节点动作',1,[new THREE.VectorKeyframeTrack(node.uuid+'.position',[0,1],[0,0,0,10,0,0])]);
 const saved=encodeAction([{kind:'action',name:'匿名节点动作',clip,transition:0}],'id','匿名动作',original),restored=new THREE.Group(),newNode=new THREE.Bone();restored.add(newNode);assert.notEqual(node.uuid,newNode.uuid);
 const decoded=decodeAction(saved,restored),sampler=new PoseSampler(restored),sequence=compileSequence(decoded,sampler);assert.equal(sampleSequence(sequence,.5,sampler).pose[1].p[0],5);sampler.dispose();
});
