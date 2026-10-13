import {test} from 'node:test';
import assert from 'node:assert/strict';
import {THREE,assertSameRig,compatibleClips} from '../../web/labs/motion/three-adapter.js';
function rig(){const root=new THREE.Group(),hip=new THREE.Bone(),arm=new THREE.Bone();hip.name='hip';arm.name='arm';root.add(hip);hip.add(arm);return root;}
test('同骨架支持追加，变换和名称歧义明确拒绝',()=>{
  const a=rig(),b=rig();assert.doesNotThrow(()=>assertSameRig(a,b));
  const clip=new THREE.AnimationClip('挥手',1,[new THREE.QuaternionKeyframeTrack('arm.quaternion',[0,1],[0,0,0,1,0,0,.5,.866])]);
  assert.equal(compatibleClips(a,[clip])[0],clip);
  b.getObjectByName('arm').position.x=2;assert.throws(()=>assertSameRig(a,b),/初始骨骼/);
  b.getObjectByName('arm').name='hip';assert.throws(()=>assertSameRig(a,b),/名称重复/);
});
