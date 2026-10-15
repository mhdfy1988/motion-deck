import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {compileSequence,sampleSequence,makeCompositeClip,PoseSampler} from '../../web/labs/motion/core/sequence-core.js';
import {encodeAction,decodeAction,validateLibrary,actionFormatVersion} from '../../web/labs/motion/core/action-codec.js';
const pose=(x,angle=0)=>[{p:[x,0,0],q:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle).toArray(),s:[1,1,1]}];
const item=(x,transition,duration=0)=>({id:crypto.randomUUID(),name:'关键姿势',kind:'pose',pose:pose(x,x*.1),transition,duration,interpolation:'continuous'});
test('零停留连续姿势共享位置与旋转速度，不在内部关键点停住',()=>{
 const seq=compileSequence([item(0,0,.2),item(1,.4),item(3,.7),item(4,.5,.2)]);
 const p=t=>sampleSequence(seq,t).pose[0],eps=1e-5;
 for(const time of [.6,1.3]){
  const a=p(time-eps),b=p(time),c=p(time+eps),left=(b.p[0]-a.p[0])/eps,right=(c.p[0]-b.p[0])/eps;
  assert.ok(left>.1);assert.ok(Math.abs(left-right)<.001);
  const q=v=>new THREE.Quaternion().fromArray(v.q),wl=q(a).angleTo(q(b))/eps,wr=q(b).angleTo(q(c))/eps;assert.ok(Math.abs(wl-wr)<.003);
 }
 for(let t=0;t<=2;t+=.01){const v=p(t);assert.ok(v.p[0]>=-1e-9&&v.p[0]<=4+1e-9);assert.ok(Math.abs(Math.hypot(...v.q)-1)<1e-9);}
});
test('高度反向处速度为零但不出现停留区间，曲线不穿地或超过峰值',()=>{
 const seq=compileSequence([item(0,0,.1),item(1,.4),item(0,.4,.1)]),x=t=>sampleSequence(seq,t).pose[0].p[0];
 assert.ok(x(.49)<1&&x(.51)<1);assert.equal(x(.5),1);
 for(let t=0;t<1;t+=.001)assert.ok(x(t)>=-1e-9&&x(t)<=1+1e-9);
});
test('真实停留隔开连续段；四元数反号不会绕远或失去归一化',()=>{
 const a=item(0,0,.1),b=item(1,.4,.2),c=item(2,.4,.1);b.pose[0].q=b.pose[0].q.map(v=>-v);
 const seq=compileSequence([a,b,c]);assert.deepEqual(sampleSequence(seq,.6).pose,b.pose);
 for(const t of [.3,.8])assert.ok(Math.abs(Math.hypot(...sampleSequence(seq,t).pose[0].q)-1)<1e-9);
 assert.throws(()=>compileSequence([{...a,duration:0,interpolation:undefined}]),/时长/);
 assert.throws(()=>compileSequence([{...a,duration:0}]),/总时长/);
});
test('连续标记与零停留通过版本3存储和合成动作采样，旧版本显式拒绝',()=>{
 const root=new THREE.Group(),items=[item(0,0,.2),item(1,.4),item(2,.4,.2)],encoded=encodeAction(items,'test','连续动作',root);
 const key='a'.repeat(64),data={version:3,modelKey:key,actions:[encoded]};assert.equal(actionFormatVersion(data.actions),3);validateLibrary(data,key);assert.throws(()=>validateLibrary({...data,version:2},key),/版本3/);
 const decoded=decodeAction(encoded,root),sampler=new PoseSampler(root),seq=compileSequence(decoded,sampler),clip=makeCompositeClip(decoded,'组合');
 for(const t of [0,.3,.6,.9,1.2])assert.ok(Math.abs(sampler.sample(clip,t)[0].p[0]-sampleSequence(seq,t,sampler).pose[0].p[0])<1e-9);
 sampler.dispose();
});
