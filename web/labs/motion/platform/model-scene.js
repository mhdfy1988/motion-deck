import {THREE,disposeModel} from './three-adapter.js';
import {PoseSampler} from '../core/sequence-core.js';

// 只适配Three.js场景与自有辅助资源，不负责目录、资料写入或切换确认。
export function createModelScene({state,scene,grid,isSkeletonVisible}){
 function releaseCurrent(){
  const {root,sampler,helper}=state;
  // 先撤销可用引用，后续失败或重复清理不能再次访问已释放对象。
  state.root=null;state.sampler=null;state.helper=null;
  const errors=[],release=run=>{try{run();}catch(error){errors.push(error);}};
  if(root)scene.remove(root);if(helper)scene.remove(helper);
  if(sampler)release(()=>sampler.dispose());
  if(root)release(()=>disposeModel(root));
  if(helper){release(()=>helper.geometry.dispose());release(()=>helper.material.dispose());}
  if(errors.length)throw new AggregateError(errors,'模型资源释放失败：'+errors.map(error=>error.message).join('；'));
 }
 function attach(candidate){
  state.helper=new THREE.SkeletonHelper(state.root);state.helper.visible=isSkeletonVisible();scene.add(state.root,state.helper);
  state.size=candidate.size;state.bounds=candidate.box.clone();state.viewBounds=null;state.center=candidate.box.getCenter(new THREE.Vector3());
  grid.position.y=candidate.box.min.y;grid.scale.setScalar(candidate.size/4);
 }
 return {releaseCurrent,attach,createSampler:root=>new PoseSampler(root),releaseCandidate:candidate=>disposeModel(candidate.root)};
}
