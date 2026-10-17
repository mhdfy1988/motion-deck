import {Plane,Vector3} from 'three';

// 只编排身体拖动手势，状态仍在原BodyControls，历史只由工作台持有。
export function beginBodyPointer(host,event,part){
 const state=host.getState();
 if(event.button!==0||state.busy||state.playing||state.poseDraft?.origin!=='user'||host.pointerDrag||host.dragging)return;
 event.preventDefault();event.stopPropagation();host.root.updateMatrixWorld(true);
 const start=part.node.getWorldPosition(new Vector3());
 const plane=new Plane().setFromNormalAndCoplanarPoint(host.camera.getWorldDirection(new Vector3()),part.point??start);
 host.pointerDrag={part,id:event.pointerId,x:event.clientX,y:event.clientY,start,plane,origin:null,active:false,controls:host.controls.enabled};
 host.pointerDrag.origin=bodyPointerPoint(host,event);
 if(!host.pointerDrag.origin){host.pointerDrag=null;return;}
 host.controls.enabled=false;
 host.rotationOpen=false;
 host.gizmo.detach();
 part.button.setPointerCapture(event.pointerId);
}

export function bodyPointerPoint(host,event){
 return host.pointerRay(event).ray.intersectPlane(host.pointerDrag.plane,new Vector3());
}

function beginGesture(host,drag){
 if(drag.part.whole){
  host.onBegin([drag.part.node],{rootTranslation:true});
 }else if(drag.part.bodyDrag){
  const controller=drag.part.bodyDrag;
  controller.begin();
  host.onBegin(controller.bones,{positionBones:controller.positionBones??[]});
 }else{
  const {chain,ik}=drag.part.limb;
  ik.begin();
  host.onBegin(drag.part.middleDrag?[chain.upper]:[chain.middle]);
 }
 drag.active=true;
 drag.part.button.classList.add('dragging');
}

export function moveBodyPointer(host,event){
 const drag=host.pointerDrag;
 if(!drag||drag.id!==event.pointerId)return;
 event.preventDefault();
 if(!drag.part.whole&&!drag.part.limb&&!drag.part.bodyDrag)return;
 if(!drag.active&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<=3)return;
 try{
  const hit=bodyPointerPoint(host,event);
  if(!hit)return;
  if(!drag.active)beginGesture(host,drag);
  const delta=hit.clone().sub(drag.origin),target=drag.start.clone().add(delta);
  if(drag.part.whole){
   const carrier=drag.part.node;
   carrier.position.copy(carrier.parent?carrier.parent.worldToLocal(target):target);
   host.root.updateMatrixWorld(true);
   return;
  }
  const solver=drag.part.bodyDrag??drag.part.limb?.ik;
  if(drag.part.bodyDrag)solver.move(delta);
  else if(drag.part.middleDrag)solver.moveJoint(target);
  else solver.moveEnd(target);
  const limited=host.onConstrain(solver);
  if(solver?.feedback?.length||limited.length){
   solver.begin();
   drag.start.copy(drag.part.node.getWorldPosition(new Vector3()));
   drag.origin.copy(hit);
  }
  host.onEdit({middle:drag.part.node});
 }catch(error){host.finishPointer(true);host.onError(error);}
}

export function finishBodyPointer(host,cancel){
 const drag=host.pointerDrag;
 if(!drag)return;
 host.pointerDrag=null;
 host.controls.enabled=drag.controls;
 drag.part.button.classList.remove('dragging');
 try{if(drag.active)host.onFinish(cancel);}catch(error){host.onError(error);}
 finally{
  if(drag.part.button.hasPointerCapture(drag.id))drag.part.button.releasePointerCapture(drag.id);
  if(drag.part.whole&&cancel)host.setMoveHover(false);
  if(!drag.part.whole)host.choose(drag.part);
 }
}
