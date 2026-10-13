import {Vector3} from 'three';
import {PointerLockControls} from 'three/addons/controls/PointerLockControls.js';

export function stepFreeView(controller,keys,delta,size){
 if(!controller.enabled)return;
 const move=new Vector3(Number(keys.has('KeyD'))-Number(keys.has('KeyA')),Number(keys.has('KeyE'))-Number(keys.has('KeyQ')),Number(keys.has('KeyW'))-Number(keys.has('KeyS')));
 if(!move.lengthSq())return;move.normalize().multiplyScalar(Math.min(Math.max(delta,0),.1)*Math.max(size,.01)*.6*(keys.has('ShiftLeft')||keys.has('ShiftRight')?3:1));
 controller.object.updateMatrixWorld(true);controller.moveRight(move.x);controller.moveForward(move.z);controller.object.position.y+=move.y;controller.object.updateMatrixWorld(true);
}

// 原生鼠标锁定负责连续转向，适配层只管理右键手势、快捷键与OrbitControls交接。
export class FreeView{
 constructor({canvas,stage,orbit,getCamera,getState,enabled,onStatus}){
  Object.assign(this,{canvas,stage,orbit,getCamera,getState,enabled,onStatus});this.active=false;this.keys=new Set();this.doc=canvas.ownerDocument;
  this.fps=new PointerLockControls(getCamera(),canvas);this.fps.enabled=false;this.fps.minPolarAngle=.01;this.fps.maxPolarAngle=Math.PI-.01;canvas.tabIndex=0;
  this.hint=document.createElement('span');this.hint.className='free-view-hint';this.hint.textContent='WASD 移动 · Q/E 升降 · Shift 加速 · 松开右键退出';this.hint.hidden=true;stage.append(this.hint);
  this.down=e=>{if(this.active){e.preventDefault();e.stopImmediatePropagation();return;}if(e.button!==2||!this.available()||!this.orbit.enabled)return;e.preventDefault();e.stopImmediatePropagation();this.begin();};
  this.up=e=>{if(e.button===2)this.stop();};
  this.keydown=e=>{if(!this.active||e.ctrlKey||e.metaKey||e.altKey||e.target.matches?.('input,textarea,select,[contenteditable=true]'))return;if(e.code==='Escape'){this.stop();return;}if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();e.stopPropagation();this.keys.add(e.code);}};
  this.keyup=e=>this.keys.delete(e.code);this.blur=()=>this.stop();this.visibility=()=>{if(this.doc.hidden)this.stop();};this.context=e=>{if(this.active||this.available())e.preventDefault();};
  this.lock=()=>{if(!this.active)this.fps.unlock();};this.unlock=()=>this.stop();this.error=()=>{if(!this.active)return;this.stop();onStatus('自由观看未启用：浏览器拒绝鼠标锁定，请检查权限',true);};
  canvas.addEventListener('pointerdown',this.down,true);canvas.addEventListener('contextmenu',this.context);this.doc.addEventListener('pointerup',this.up,true);this.doc.addEventListener('pointerlockerror',this.error);this.doc.addEventListener('visibilitychange',this.visibility);window.addEventListener('keydown',this.keydown,true);window.addEventListener('keyup',this.keyup);window.addEventListener('blur',this.blur);this.fps.addEventListener('lock',this.lock);this.fps.addEventListener('unlock',this.unlock);
 }
 available(){return this.enabled()&&this.getCamera().isPerspectiveCamera&&!!this.getState().root&&!this.getState().busy&&!this.getState().playing;}
 begin(){
  if(typeof this.canvas.requestPointerLock!=='function'){this.onStatus('当前浏览器不支持鼠标锁定，请使用Chrome',true);return;}
  const camera=this.getCamera(),damping=this.orbit.enableDamping;this.orbit.enableDamping=false;this.orbit.update();this.orbit.enableDamping=damping;
  this.distance=Math.max(camera.position.distanceTo(this.orbit.target),this.getState().size*.2);this.beforeEnabled=this.orbit.enabled;this.orbit.enabled=false;this.fps.object=camera;this.fps.enabled=true;this.active=true;this.keys.clear();this.stage.classList.add('free-looking');this.hint.hidden=false;this.canvas.focus({preventScroll:true});
  try{const request=this.canvas.requestPointerLock();request?.catch?.(error=>{if(this.active){this.stop();this.onStatus('自由观看未启用：'+error.message,true);}});}catch(error){this.stop();this.onStatus('自由观看未启用：'+error.message,true);}
 }
 stop(){
  if(!this.active)return;this.active=false;this.keys.clear();this.fps.enabled=false;const camera=this.fps.object;
  this.orbit.target.copy(camera.position).addScaledVector(camera.getWorldDirection(new Vector3()),this.distance);this.orbit.enabled=this.beforeEnabled;this.orbit.update();camera.updateMatrixWorld(true);this.stage.classList.remove('free-looking');this.hint.hidden=true;
  if(this.doc.pointerLockElement===this.canvas)this.fps.unlock();
 }
 update(delta){if(!this.active)return;if(!this.available()||this.getCamera()!==this.fps.object||this.doc.activeElement?.matches('input,textarea,select,[contenteditable=true]')){this.stop();return;}if(this.fps.isLocked){stepFreeView(this.fps,this.keys,delta,this.getState().size);this.fps.object.updateMatrixWorld(true);}}
 dispose(){this.stop();this.canvas.removeEventListener('pointerdown',this.down,true);this.canvas.removeEventListener('contextmenu',this.context);this.doc.removeEventListener('pointerup',this.up,true);this.doc.removeEventListener('pointerlockerror',this.error);this.doc.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('keydown',this.keydown,true);window.removeEventListener('keyup',this.keyup);window.removeEventListener('blur',this.blur);this.fps.dispose();this.hint.remove();}
}
