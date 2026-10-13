import {test} from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {PoseSampler,compileSequence,sampleSequence,makeCompositeClip,capturePose,clipKeyTimes} from '../../web/labs/motion/sequence-core.js';
import {encodeAction,decodeAction,validateLibrary} from '../../web/labs/motion/action-library.js';
function samePose(a,b){assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)for(const key of ['p','q','s','m'])if(a[i][key])a[i][key].forEach((v,n)=>assert.ok(Math.abs(v-b[i][key][n])<1e-9,'仅允许浮点运算舍入差'));
}
test('合并整体保留内部动作、姿势、过渡，裁剪变速及再次保存恢复采样一致',()=>{
 const root=new THREE.Group(),bone=new THREE.Bone();bone.name='joint';root.add(bone);const sampler=new PoseSampler(root),pose=capturePose(root),clip=new THREE.AnimationClip('源',2,[new THREE.VectorKeyframeTrack('joint.position',[0,.37,2],[0,0,0,3,0,0,5,0,0])]);
 const parts=[{kind:'action',name:'起手',clip,in:.1,out:1.8,duration:.8,transition:0},{kind:'pose',name:'结束',pose,duration:.3,transition:.35}],original=compileSequence(parts,sampler),combined=makeCompositeClip(parts,'剑攻击-1'),outer=[{kind:'action',name:'剑攻击-1',clip:combined,transition:0}],sequence=compileSequence(outer,sampler);
 assert.equal(sequence.spans.length,1);assert.equal(sequence.duration,original.duration);for(let t=0;t<=original.duration;t+=.031)samePose(sampleSequence(sequence,t,sampler).pose,sampleSequence(original,t,sampler).pose);
 const encoded=encodeAction(outer,'a','组合',root),key='a'.repeat(64);validateLibrary({version:2,modelKey:key,actions:[encoded]},key);assert.throws(()=>validateLibrary({version:1,modelKey:key,actions:[encoded]},key),/版本2/);const restored=decodeAction(JSON.parse(JSON.stringify(encoded)),root);assert.equal(restored.length,1);assert.equal(restored[0].clip.recipeItems.length,2);
 restored[0].in=.2;restored[0].out=combined.duration-.1;restored[0].duration=2;const edited=compileSequence(restored,sampler);for(const t of [0,.3,1,2])samePose(sampleSequence(edited,t,sampler).pose,sampleSequence(original,.2+t/2*(combined.duration-.3),sampler).pose);
 assert.ok(clipKeyTimes(combined).some(t=>Math.abs(t-(.37-.1)/1.7*.8)<1e-6));encoded.clips[0].duration+=1;assert.throws(()=>decodeAction(encoded,root),/时长/);let nested=combined;for(let i=0;i<9;i++)nested=makeCompositeClip([{kind:'action',name:'内部',clip:nested,transition:0}],'嵌套');assert.throws(()=>encodeAction([{kind:'action',name:'嵌套',clip:nested,transition:0}],'depth','嵌套',root),/8层/);sampler.dispose();
});
