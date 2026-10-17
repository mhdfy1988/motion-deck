import {Vector3} from 'three';
import {PointerLockControls} from 'three/addons/controls/PointerLockControls.js';

// 飞行滚轮平移真实相机和观察中心，不改变视场角，也不借轨迹球绕有限目标缩放。
export function stepFlyWheel(camera,target,event,size,height){
 if(!camera.isPerspectiveCamera||!Number.isFinite(event.deltaY)||![0,1,2].includes(event.deltaMode))return false;
 const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?Math.max(height,1):1);if(!pixels)return false;
 const distance=Math.max(camera.position.distanceTo(target),size*.05,.01),step=-Math.sign(pixels)*Math.expm1(Math.min(Math.abs(pixels),500)*.001)*distance,direction=camera.getWorldDirection(new Vector3());
 camera.position.addScaledVector(direction,step);target.addScaledVector(direction,step);camera.updateMatrixWorld(true);return true;
}

export function stepFreeView(controller,keys,delta,size,followPitch=false){
 if(!controller.enabled)return;
 const move=new Vector3(Number(keys.has('KeyD'))-Number(keys.has('KeyA')),Number(keys.has('KeyE'))-Number(keys.has('KeyQ')),Number(keys.has('KeyW'))-Number(keys.has('KeyS')));
 if(!move.lengthSq())return;move.normalize().multiplyScalar(Math.min(Math.max(delta,0),.1)*Math.max(size,.01)*.6*(keys.has('ShiftLeft')||keys.has('ShiftRight')?3:1));
 controller.object.updateMatrixWorld(true);controller.moveRight(move.x);if(followPitch)controller.object.position.addScaledVector(controller.object.getWorldDirection(new Vector3()),move.z);else controller.moveForward(move.z);controller.object.position.y+=move.y;controller.object.updateMatrixWorld(true);
}

// 官方鼠标锁定负责转向；飞行模式左键转头、独立键盘移动，其他模式保留编辑右键观看。
export class FreeView{
 constructor({canvas,stage,orbit,getCamera,getState,enabled,onStatus}){
  Object.assign(this,{canvas,stage,orbit,getCamera,getState,enabled,onStatus});this.active=false;this.keys=new Set();this.doc=canvas.ownerDocument;
  this.fps=new PointerLockControls(getCamera(),canvas);this.fps.enabled=false;this.fps.minPolarAngle=.01;this.fps.maxPolarAngle=Math.PI-.01;canvas.tabIndex=0;
  this.hint=document.createElement('span');this.hint.className='free-view-hint';this.hint.textContent='WASD 移动 · Q/E 升降 · Shift 加速 · 松开右键退出';this.hint.hidden=true;stage.append(this.hint);
  this.down=e=>{if(this.active){e.preventDefault();e.stopImmediatePropagation();return;}if(this.flying()&&e.button===0&&!this.getCamera().isPerspectiveCamera){this.onStatus('自由飞行请先选择透视视图');return;}if(e.button!==(this.flying()?0:2)||!this.available()||!this.orbit.enabled||this.orbit.allowPointer&&!this.orbit.allowPointer(e))return;e.preventDefault();e.stopImmediatePropagation();this.begin();};
  this.up=e=>{if(this.active&&e.button===this.button)this.stop(this.flying());};
  this.wheel=e=>{if(!this.flying()||!this.available()||!this.orbit.enabled&&!this.active)return;if(stepFlyWheel(this.getCamera(),this.orbit.target,e,this.getState().size,this.canvas.clientHeight)){e.preventDefault();e.stopImmediatePropagation();}};
  this.keydown=e=>{if(!this.active&&!this.canFlyKeys()||e.ctrlKey||e.metaKey||e.altKey||e.target.matches?.('input,textarea,select,[contenteditable=true]'))return;if(e.code==='Escape'){this.stop();if(this.flying())this.canvas.blur();return;}if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();e.stopPropagation();this.keys.add(e.code);}};
  this.keyup=e=>this.keys.delete(e.code);this.blur=()=>this.stop();this.visibility=()=>{if(this.doc.hidden)this.stop();};this.context=e=>{if(this.active||this.available())e.preventDefault();};
  this.focusout=()=>this.stop();this.lock=()=>{if(!this.active)this.fps.unlock();};this.unlock=()=>{if(this.active)this.stop();};this.error=()=>{if(!this.active)return;this.stop();onStatus('自由观看未启用：浏览器拒绝鼠标锁定，请检查权限',true);};
  canvas.addEventListener('pointerdown',this.down,true);canvas.addEventListener('wheel',this.wheel,{passive:false,capture:true});canvas.addEventListener('blur',this.focusout);canvas.addEventListener('contextmenu',this.context);this.doc.addEventListener('pointerup',this.up,true);this.doc.addEventListener('pointerlockerror',this.error);this.doc.addEventListener('visibilitychange',this.visibility);window.addEventListener('keydown',this.keydown,true);window.addEventListener('keyup',this.keyup);window.addEventListener('blur',this.blur);this.fps.addEventListener('lock',this.lock);this.fps.addEventListener('unlock',this.unlock);
 }
 flying(){return this.orbit.mode==='fly';}
 available(){return this.enabled()&&this.getCamera().isPerspectiveCamera&&!!this.getState().root&&!this.getState().busy&&(!this.getState().playing||this.flying());}
 canFlyKeys(){return this.flying()&&this.available()&&this.orbit.enabled&&this.doc.activeElement===this.canvas;}
 followTarget(distance){const camera=this.getCamera();this.orbit.target.copy(camera.position).addScaledVector(camera.getWorldDirection(new Vector3()),distance);}
 begin(){
  if(typeof this.canvas.requestPointerLock!=='function'){this.onStatus('当前浏览器不支持鼠标锁定，请使用Chrome',true);return;}
  const camera=this.getCamera();this.orbit.syncCamera();
  // 官方每像素0.002rad；飞行与观察相机统一为2π/视口高，保留其他模式旧右键手感。
  this.fps.pointerSpeed=this.flying()?Math.PI*1000/Math.max(this.canvas.clientHeight,1):1;
  this.distance=Math.max(camera.position.distanceTo(this.orbit.target),this.getState().size*.2);this.button=this.flying()?0:2;this.beforeEnabled=this.orbit.enabled;this.orbit.enabled=false;this.fps.object=camera;this.fps.enabled=true;this.active=true;if(!this.flying())this.keys.clear();this.stage.classList.add('free-looking');this.hint.textContent=this.flying()?'左键转向 · WASD 移动 · Q/E 升降 · Shift 加速':'WASD 移动 · Q/E 升降 · Shift 加速 · 松开右键退出';this.hint.hidden=false;this.canvas.focus({preventScroll:true});
  try{const request=this.canvas.requestPointerLock();request?.catch?.(error=>{if(this.active){this.stop();this.onStatus('自由观看未启用：'+error.message,true);}});}catch(error){this.stop();this.onStatus('自由观看未启用：'+error.message,true);}
 }
 stop(keepKeys=false){
  if(!keepKeys)this.keys.clear();this.hint.hidden=true;if(!this.active)return;this.active=false;this.fps.enabled=false;const camera=this.fps.object;
  camera.up.set(0,1,0).applyQuaternion(camera.quaternion);this.orbit.target.copy(camera.position).addScaledVector(camera.getWorldDirection(new Vector3()),this.distance);this.orbit.enabled=this.beforeEnabled;this.orbit.syncCamera();camera.updateMatrixWorld(true);this.stage.classList.remove('free-looking');this.hint.hidden=true;
  if(this.doc.pointerLockElement===this.canvas)this.fps.unlock();
 }
 update(delta){
  if(this.active){if(!this.available()||this.getCamera()!==this.fps.object||this.doc.activeElement!==this.canvas){this.stop();return;}if(this.fps.isLocked){stepFreeView(this.fps,this.keys,delta,this.getState().size,this.flying());this.fps.object.updateMatrixWorld(true);}return;}
  if(!this.canFlyKeys()){if(this.flying()){this.keys.clear();this.hint.hidden=true;}return;}
  const camera=this.getCamera(),distance=Math.max(camera.position.distanceTo(this.orbit.target),this.getState().size*.2);this.fps.object=camera;this.fps.enabled=true;stepFreeView(this.fps,this.keys,delta,this.getState().size,true);this.fps.enabled=false;camera.updateMatrixWorld(true);this.followTarget(distance);this.hint.textContent='左键转向 · WASD 移动 · Q/E 升降 · Shift 加速';this.hint.hidden=false;
 }
 dispose(){this.stop();this.canvas.removeEventListener('pointerdown',this.down,true);this.canvas.removeEventListener('wheel',this.wheel,true);this.canvas.removeEventListener('blur',this.focusout);this.canvas.removeEventListener('contextmenu',this.context);this.doc.removeEventListener('pointerup',this.up,true);this.doc.removeEventListener('pointerlockerror',this.error);this.doc.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('keydown',this.keydown,true);window.removeEventListener('keyup',this.keyup);window.removeEventListener('blur',this.blur);this.fps.dispose();this.hint.remove();}
}
