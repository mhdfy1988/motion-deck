import * as THREE from 'three';
// 姿势按当前模型节点顺序保存，不跨模型复用。
export function capturePose(root){const pose=[];root.traverse(n=>pose.push({p:n.position.toArray(),q:n.quaternion.toArray(),s:n.scale.toArray(),m:n.morphTargetInfluences?.slice()}));return pose;}
export function applyPose(root,pose){let i=0;root.traverse(n=>{const v=pose[i++];n.position.fromArray(v.p);n.quaternion.fromArray(v.q);n.scale.fromArray(v.s);if(v.m&&n.morphTargetInfluences)n.morphTargetInfluences.splice(0,v.m.length,...v.m);});root.updateMatrixWorld(true);}
export function blendPoses(a,b,t){const alpha=Math.max(0,Math.min(1,t)),q=new THREE.Quaternion(),end=new THREE.Quaternion();return a.map((v,i)=>({p:v.p.map((x,j)=>THREE.MathUtils.lerp(x,b[i].p[j],alpha)),s:v.s.map((x,j)=>THREE.MathUtils.lerp(x,b[i].s[j],alpha)),q:q.fromArray(v.q).slerp(end.fromArray(b[i].q),alpha).toArray(),m:v.m?.map((x,j)=>THREE.MathUtils.lerp(x,b[i].m[j],alpha))}));}
export class PoseSampler{
  constructor(root){this.root=root;this.base=capturePose(root);this.mixer=new THREE.AnimationMixer(root);this.composites=new WeakMap();}
  sample(clip,time){this.mixer.stopAllAction();applyPose(this.root,this.base);if(clip.recipeItems){let sequence=this.composites.get(clip);if(!sequence){sequence=compileSequence(clip.recipeItems,this);this.composites.set(clip,sequence);}const pose=sampleSequence(sequence,time,this).pose;applyPose(this.root,pose);return pose;}const action=this.mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();this.mixer.setTime(Math.max(0,Math.min(time,clip.duration)));const pose=capturePose(this.root);this.mixer.stopAllAction();return pose;}
  dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.root);}
}
// 整体片段只包装既有采样，不烘焙、重采样或改变内部裁剪与过渡。
export function makeCompositeClip(items,name){
 if(!items.length)throw new Error('合并动作没有片段');let duration=0;for(let i=0;i<items.length;i++){const item=items[i],d=item.duration??(item.kind==='action'?actionRange(item).duration:undefined);if(!Number.isFinite(d)||d<=0)throw new Error('合并动作时长无效');const transition=i?(item.transition??0):0;if(!Number.isFinite(transition)||transition<0||transition>5)throw new Error('合并动作过渡无效');duration+=d+transition;}
 const clip=new THREE.AnimationClip(name,duration,[]);clip.recipeItems=items.map(item=>({...item,...(item.pose?{pose:structuredClone(item.pose)}:{})}));return clip;
}
export function clipKeyTimes(clip){
 if(!clip.recipeItems)return clip.tracks.flatMap(track=>Array.from(track.times));const keys=[0];let time=0;for(let i=0;i<clip.recipeItems.length;i++){const item=clip.recipeItems[i];if(i){time+=item.transition??0;keys.push(time);}const range=item.kind==='action'?actionRange(item):null,duration=item.duration??range?.duration;
  if(range)for(const key of clipKeyTimes(item.clip))if(key>=range.in&&key<=range.out)keys.push(time+(key-range.in)/(range.out-range.in)*duration);time+=duration;keys.push(time);
 }return keys;
}
export function actionRange(item){const start=item.in??0,end=item.out??item.clip.duration;if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>item.clip.duration||end<=start)throw new Error('动作范围须满足 0 ≤ 开始 < 结束 ≤ 动作时长');return {in:start,out:end,duration:end-start};}
export function compileSequence(items,sampler){let time=0;const spans=[];for(let i=0;i<items.length;i++){
  const item=items[i],range=item.kind==='action'?actionRange(item):null,duration=item.duration??range?.duration;
  if(!Number.isFinite(duration)||duration<=0)throw new Error('片段时长必须大于0');
  const startPose=range?sampler.sample(item.clip,range.in):item.pose,endPose=range?sampler.sample(item.clip,range.out):item.pose;
  if(i){const transition=item.transition;if(!Number.isFinite(transition)||transition<0||transition>5)throw new Error('过渡时长须在0—5秒之间');if(transition>0){spans.push({kind:'transition',targetId:item.id,start:time,duration:transition,a:spans.at(-1).endPose,b:startPose,name:'末帧 → 首帧'});time+=transition;}}
  spans.push({...item,...range,start:time,duration,startPose,endPose});time+=duration;
}return {spans,duration:time};}
export function sampleSequence(sequence,time,sampler){if(!sequence.spans.length)return null;const t=Math.max(0,Math.min(time,sequence.duration)),span=sequence.spans.find(s=>t<s.start+s.duration)||sequence.spans.at(-1),local=Math.max(0,t-span.start);return {span,local,pose:span.kind==='transition'?blendPoses(span.a,span.b,local/span.duration):span.kind==='action'?sampler.sample(span.clip,span.in+Math.min(local/span.duration,1)*(span.out-span.in)):span.pose};}
