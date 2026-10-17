import {Vector2,Vector3,Quaternion} from 'three';
import {jointLimits} from './joint-limits.js';
import {handForHit,fingerForHit,fingerTip,handCenter} from './hand-rig.js';
import {FingerJointDrag} from './finger-ik.js';
import {BodyMarkers} from './body-markers.js';
import {nearestPoseHandle} from './pose-picking.js';

// 手表面入口与腕点分开；近景、选指和拖动事务各自收口，历史仍归工作台。
export class HandControls{
 constructor(host,scene){
  this.host=host;
  this.parts=[];
  this.hand=null;
  this.drag=null;
  this.panel=document.createElement('div');
  this.panel.className='hand-editor';
  this.panel.hidden=true;
  this.label=document.createElement('span');
  this.closeButton=document.createElement('button');
  this.closeButton.type='button';
  this.closeButton.textContent='返回全身';
  this.closeButton.onclick=()=>this.close();
  this.panel.append(this.label,this.closeButton);
  host.toolButtons.append(this.panel);
  this.layer=document.createElement('div');
  this.layer.className='body-handles hand-handles';
  this.layer.hidden=true;
  host.stage.append(this.layer);
  this.markers=new BodyMarkers(scene,()=>host.getState().size);
  this.markers.group.name='editor-hand-markers';

  this.down=event=>{
   const state=host.getState();
   if(host.tool!=='pose'||state.busy||state.playing||state.poseDraft?.origin!=='user'||!document.getElementById('posePanel').open||event.button!==0||host.hitGizmo(event))return;
   if(this.hand){
    const hit=host.personHit(event),finger=fingerForHit(this.hand,hit);
    if(finger){
     event.preventDefault();event.stopImmediatePropagation();this.selectFinger(finger);
    }else if(!hit)this.selectFinger(null);
    return;
   }
   const hand=handForHit(jointLimits(state.root).hands??[],host.personHit(event));
   if(!hand)return;
   event.preventDefault();event.stopImmediatePropagation();this.open(hand);
  };
  this.key=event=>{
   if(event.key!=='Escape'||!this.hand)return;
   event.preventDefault();
   if(this.drag)this.finish(true);
   else if(this.selectedFinger)this.selectFinger(null);
   else this.close();
  };
  this.cancel=()=>this.finish(true);
  this.hover=event=>{
   const state=host.getState();
   const enabled=!this.hand&&host.tool==='pose'&&!state.busy&&state.poseDraft?.origin==='user'&&document.getElementById('posePanel').open;
   host.canvas.classList.toggle('hand-edit-hover',!!(enabled&&!host.hitGizmo(event)&&handForHit(jointLimits(state.root).hands??[],host.personHit(event))));
  };
  this.leave=()=>host.canvas.classList.remove('hand-edit-hover');
  host.canvas.addEventListener('pointerdown',this.down,true);
  host.canvas.addEventListener('pointermove',this.hover);
  host.canvas.addEventListener('pointerleave',this.leave);
  window.addEventListener('keydown',this.key);
  window.addEventListener('blur',this.cancel);
 }

 open(hand){
  this.host.clearSelection();
  this.leave();
  this.hand=hand;
  this.focusHand(hand);
  this.selectedFinger=null;
  this.label.textContent=hand.label;
  this.panel.hidden=false;
  this.layer.hidden=false;
  this.parts=hand.fingers.flatMap(finger=>['joint','distal','tip'].map((kind,segment)=>this.createPart(finger,kind,segment)));
 }
 focusHand(hand){
  const camera=this.host.camera,controls=this.host.controls;
  controls.stopMotion();
  this.saved={camera,position:camera.position.clone(),quaternion:camera.quaternion.clone(),up:camera.up.clone(),zoom:camera.zoom,target:controls.target.clone(),rotate:controls.enableRotate};
  hand.wrist.updateWorldMatrix(true,true);
  const worldQ=hand.wrist.getWorldQuaternion(new Quaternion()),center=handCenter(hand);
  const up=hand.fingers[2].bones[0].getWorldPosition(new Vector3()).sub(hand.wrist.getWorldPosition(new Vector3())).normalize();
  const direction=hand.palm.clone().applyQuaternion(worldQ).addScaledVector(hand.across.clone().applyQuaternion(worldQ),.3).addScaledVector(up,.3).normalize();
  const scale=hand.wrist.getWorldScale(new Vector3()).x,span=Math.max(...hand.fingers.map(finger=>finger.length))*scale*1.9;
  // 保留原近景取景参数，为上方编辑工具栏留出空间。
  camera.up.copy(up);
  camera.position.copy(center).addScaledVector(direction,span*2.6);
  camera.lookAt(center);
  camera.zoom=camera.isOrthographicCamera?(camera.top-camera.bottom)/(span*1.9):1;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.enableRotate=true;
  controls.syncCamera();
 }
 createPart(finger,kind,segment){
  const host=this.host,index=Math.min(segment+1,2),node=finger.bones[index];
  const button=document.createElement('button');
  const solver=new FingerJointDrag(finger,{segment,getMode:()=>host.getState().jointConstraintMode});
  const part={node,finger,kind,index,segment,solver,button,worldPosition:()=>kind==='tip'?fingerTip(finger):node.getWorldPosition(new Vector3()),markerScale:kind==='tip'?1:.8};
  button.type='button';
  button.hidden=true;
  button.className='body-handle finger-handle';
  if(kind==='tip')button.dataset.finger=finger.name;
  else if(kind==='joint')button.dataset.fingerJoint=finger.name;
  else button.dataset.fingerDistal=finger.name;
  button.setAttribute('aria-label','拖动'+this.hand.label+finger.label+['第一指节','第二指节','指尖'][segment]);
  this.markers.add(part);
  button.onpointerdown=event=>this.begin(event,part);
  button.onpointermove=event=>this.move(event);
  button.onpointerup=event=>{if(this.drag?.id===event.pointerId)this.finish(false);};
  button.onpointercancel=this.cancel;
  button.onlostpointercapture=this.cancel;
  button.onclick=event=>{if(event.detail===0)this.selectFinger(finger);};
  button.onpointerenter=()=>{this.hovered=part;};
  button.onpointerleave=()=>{this.hovered=null;};
  this.layer.append(button);
  return part;
 }
 selectFinger(finger){
  this.selectedFinger=finger;
  if(finger)this.label.textContent=this.hand.label+'·'+finger.label;
  else if(this.hand)this.label.textContent=this.hand.label;
 }

 begin(event,part){
  const host=this.host;
  if(event.button!==0||host.getState().busy||this.drag)return;
  event.preventDefault();event.stopPropagation();
  part=nearestPoseHandle(this.parts,event,{radius:8})??part;
  this.drag={part,id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,active:false,controls:host.controls.enabled};
  host.controls.enabled=false;
  part.button.setPointerCapture(event.pointerId);
 }
 move(event){
  const drag=this.drag,host=this.host;
  if(!drag||drag.id!==event.pointerId)return;
  event.preventDefault();
  if(!drag.active&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<=3)return;
  try{
   if(!drag.active){
    host.onBegin(drag.part.solver.bones);
    drag.part.solver.begin();
    drag.active=true;
   }
   const box=host.canvas.getBoundingClientRect();
   const delta=new Vector2((event.clientX-drag.lastX)/box.width*2,-(event.clientY-drag.lastY)/box.height*2);
   drag.part.solver.moveScreen(delta,host.camera,new Vector2(box.width/2,box.height/2));
   drag.lastX=event.clientX;drag.lastY=event.clientY;
   host.onConstrain(drag.part.solver);
   host.onEdit({middle:drag.part.node});
  }catch(error){this.finish(true);host.onError(error);}
 }
 finish(cancel){
  const drag=this.drag;
  if(!drag)return;
  this.drag=null;
  this.host.controls.enabled=drag.controls;
  try{if(drag.active)this.host.onFinish(cancel);}catch(error){this.host.onError(error);}
  finally{
   if(drag.part.button.hasPointerCapture(drag.id))drag.part.button.releasePointerCapture(drag.id);
   if(!cancel&&!drag.active)this.selectFinger(drag.part.finger);
  }
 }

 restoreCamera(){
  const saved=this.saved;
  if(!saved)return;
  const controls=this.host.controls;
  saved.camera.position.copy(saved.position);
  saved.camera.quaternion.copy(saved.quaternion);
  saved.camera.up.copy(saved.up);
  saved.camera.zoom=saved.zoom;
  saved.camera.updateProjectionMatrix();
  if(this.host.camera===saved.camera){
   controls.target.copy(saved.target);
   controls.enableRotate=saved.rotate;
  }
  controls.syncCamera();
  this.saved=null;
 }
 close(){
  this.leave();
  if(!this.hand)return;
  this.selectedFinger=null;
  this.finish(true);
  this.hand=null;
  this.hovered=null;
  this.parts.forEach(part=>part.solver.dispose());
  this.parts=[];
  this.layer.replaceChildren();
  this.markers.clear();
  this.markers.update(false);
  this.panel.hidden=true;
  this.layer.hidden=true;
  this.restoreCamera();
 }
 update(visible){
  if(!this.hand)return;
  if(!visible||this.host.camera!==this.saved.camera){this.close();return;}
  const host=this.host,state=host.getState(),box=host.stage.getBoundingClientRect();
  this.closeButton.disabled=state.busy;
  this.markers.update(true,null,this.hovered,this.drag?.part);
  for(const part of this.parts){
   const point=part.worldPosition().project(host.camera);
   part.button.disabled=state.busy&&this.drag?.part!==part;
   part.button.hidden=part.finger!==this.selectedFinger||Math.abs(point.x)>1||Math.abs(point.y)>1||Math.abs(point.z)>1;
   part.marker.visible=!part.button.hidden;
   part.marker.material.opacity=1;
   part.button.style.left=`${(point.x+1)*box.width/2}px`;
   part.button.style.top=`${(1-point.y)*box.height/2}px`;
  }
 }
 dispose(){
  this.close();this.leave();
  this.host.canvas.removeEventListener('pointerdown',this.down,true);
  this.host.canvas.removeEventListener('pointermove',this.hover);
  this.host.canvas.removeEventListener('pointerleave',this.leave);
  window.removeEventListener('keydown',this.key);
  window.removeEventListener('blur',this.cancel);
  this.markers.dispose();
  this.panel.remove();
  this.layer.remove();
 }
}
