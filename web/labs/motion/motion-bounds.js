import {Box3,Vector3} from 'three';
import {capturePose,applyPose} from './sequence-core.js';

// 以参考视频30fps及动画关键时刻采样；明确限制计算量，不静默退回绑定姿势。
export function boundsSampleTimes(duration,extra=[],maxSamples=2400){
 if(!Number.isFinite(duration)||duration<0)throw new Error('取景时长无效');
 const steps=Math.ceil(duration*30),times=new Set([0,duration]);
 if(steps+1>maxSamples)throw new Error('编排过长，请分段计算适合视图');
 for(let i=1;i<steps;i++)times.add(i/30);
 for(const t of extra)if(Number.isFinite(t)&&t>=0&&t<=duration){times.add(t);if(times.size>maxSamples)throw new Error('关键时刻过多，请分段计算适合视图');}
 return [...times].sort((a,b)=>a-b);
}
export function visibleModelBounds(root){
 root.updateMatrixWorld(true);
 root.traverse(node=>{if(node.isSkinnedMesh){node.skeleton.update();node.computeBoundingBox();}});
 return new Box3().setFromObject(root);
}
export function measureMotionBounds(root,plan){
 const before=capturePose(root),box=new Box3();
 try{for(const pose of plan.poses??[]){applyPose(root,pose);box.union(visibleModelBounds(root));}for(const time of plan.times){applyPose(root,plan.sample(time));box.union(visibleModelBounds(root));}
  if(box.isEmpty()||![...box.min.toArray(),...box.max.toArray()].every(Number.isFinite))throw new Error('无法计算模型边界');
  // 留少量裕量用于采样时刻之间的变化；仍须预览检查极端动作。
  return box.expandByScalar(box.getSize(new Vector3()).length()*.015);
 }finally{applyPose(root,before);visibleModelBounds(root);}
}
