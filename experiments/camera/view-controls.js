import {MOUSE,Vector3} from 'three';
import {TrackballControls} from 'three/addons/controls/TrackballControls.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {ArcballControls} from 'three/addons/controls/ArcballControls.js';

// 固定Three 0.186.1的输入/惯性适配；旋转、平移、缩放仍由官方轨迹球实现。
class CalibratedTrackball extends TrackballControls{
 constructor(camera,canvas){
  super(camera,canvas);
  if(!this._movePrev?.isVector2||!this._zoomStart?.isVector2||!Array.isArray(this._pointers)||typeof this._onPointerDown!=='function')throw new Error('TrackballControls适配需要更新');
  this.keys=[];this.dynamicDampingFactor=.25;this.minDistance=.005;this.minZoom=.01;this.mouseButtons.MIDDLE=MOUSE.PAN;
  // 环拥有自己的鼠标手势；轨迹球不先抢指针，否则禁用时官方pointerUp会留下旧指针。
  canvas.removeEventListener('pointerdown',this._onPointerDown);
  this.pointerDown=e=>{if(!this.enabled||this.allowPointer&&!this.allowPointer(e))return;this.mouseButtons.LEFT=e.shiftKey?MOUSE.PAN:MOUSE.ROTATE;this.handleResize();this._onPointerDown(e);};
  canvas.addEventListener('pointerdown',this.pointerDown);
 }
 get enableRotate(){return !this.noRotate;}
 handleResize(){
  super.handleResize();
  // 官方轨迹球每像素为2/宽；沿用原观察相机2π/高的手感，宽屏不再拖不动。
  this.rotateSpeed=Math.PI*this.screen.width/Math.max(this.screen.height,1);
 }
 set enableRotate(value){this.noRotate=!value;}
 get enableDamping(){return !this.staticMoving;}
 set enableDamping(value){this.staticMoving=!value;}
 stopMotion(){
  this._movePrev.copy(this._moveCurr);this._zoomStart.copy(this._zoomEnd);this._panStart.copy(this._panEnd);this._lastAngle=0;this._lastRollAngle=0;this._touchZoomDistanceStart=this._touchZoomDistanceEnd;
 }
 syncCamera(){this.stopMotion();this.handleResize();const damping=this.enableDamping;this.enableDamping=false;super.update();this.enableDamping=damping;}
 update(){if(this.enabled===false){this.stopMotion();return;}super.update();}
 dispose(){this.domElement.removeEventListener('pointerdown',this.pointerDown);super.dispose();}
}

// 当前试用仅开放人物中心观察，其他实验实现不作为可切换入口或失败回退。
export const cameraModes=[['orbit','人物观察']];

class CalibratedArcball extends ArcballControls{
 setCamera(camera){
  super.setCamera(camera);
  // 官方applyTransformMatrix再乘绝对相机四元数，此处必须为相机局部上轴，不能重复旋转世界up。
  if(!this._upState?.isVector3)throw new Error('ArcballControls上轴适配需要更新');this._upState.set(0,1,0);
 }
}

// 应用只持有这一份入口；切换销毁旧控件，避免多套监听器同时抢同一次手势。
export class ViewControls{
 constructor(camera,canvas){
  this.object=camera;this.canvas=canvas;this.target=new Vector3();this.mode='orbit';this._enabled=true;this._rotate=true;this._damping=false;this.create();
 }
 get enabled(){return this._enabled;}
 set enabled(value){this._enabled=value;this.stopMotion();this.configure();}
 get enableRotate(){return this._rotate;}
 set enableRotate(value){this._rotate=value;this.stopMotion();this.configure();}
 get enableDamping(){return this._damping;}
 set enableDamping(value){this._damping=value;this.configure();}
 get screen(){return this.active?.screen??this.canvas.getBoundingClientRect();}
 get _pointers(){return this.active?._pointers??[];}
 configure(){
  const c=this.active;if(!c)return;c.enabled=this.enabled;
  if(c instanceof CalibratedTrackball){c.enableRotate=this.enableRotate&&this.mode!=='fly';c.enableDamping=this.enableDamping;c.noPan=this.mode==='fly';c.noZoom=this.mode==='fly';}
  else{c.enableRotate=this.enableRotate;if(c instanceof OrbitControls)c.enableDamping=false;}
 }
 release(){
  if(!this.active)return;this.canvas.removeEventListener('pointerdown',this.pointerDown);this.active.dispose();
  if(this.active instanceof ArcballControls)this.active._gizmos.traverse(n=>{n.geometry?.dispose();if(n.material)for(const material of Array.isArray(n.material)?n.material:[n.material])material.dispose();});
 }
 create(){
  const saved={p:this.object.position.clone(),q:this.object.quaternion.clone(),up:this.object.up.clone(),zoom:this.object.zoom};
  // 全身和手部近景共用世界竖直轴；必须在官方控件构造其轨道轴之前设定。
  if(this.mode==='orbit'){saved.up.set(0,1,0);this.object.up.copy(saved.up);}
  this.release();
  const c=this.active=this.mode==='orbit'?new OrbitControls(this.object,this.canvas):this.mode==='arcball'?new CalibratedArcball(this.object,this.canvas):new CalibratedTrackball(this.object,this.canvas);
  this.object.position.copy(saved.p);this.object.quaternion.copy(saved.q);this.object.up.copy(saved.up);this.object.zoom=saved.zoom;this.object.updateProjectionMatrix();c.target=this.target;
  if(c instanceof OrbitControls){c.mouseButtons={LEFT:MOUSE.ROTATE,MIDDLE:MOUSE.PAN,RIGHT:null};c.minDistance=.005;c.minZoom=.01;c.minPolarAngle=.05;c.maxPolarAngle=Math.PI-.05;}
  if(c instanceof ArcballControls){
   c.enableAnimations=false;c.enableFocus=false;c.cursorZoom=false;c.mouseActions=[];c.setMouseAction('ROTATE',0);c.setMouseAction('PAN',1);c.setMouseAction('PAN',0,'SHIFT');c.setMouseAction('ZOOM','WHEEL');c.minDistance=.005;c.minZoom=.01;c.setCamera(this.object);c.setGizmosVisible(false);
   // 官方实际中心存于_gizmos，平移后public target不会自动更新；交接以实际中心为准。
   c.addEventListener('change',()=>{this.target.copy(c._gizmos.position);c._currentTarget.copy(this.target);});
  }
  // 官方内部pointer入口集中隔离，环命中不让相机先登记指针；失败显式暴露。
  const down=c instanceof CalibratedTrackball?c.pointerDown:c._onPointerDown;if(typeof down!=='function')throw new Error('相机控件指针适配需要更新');this.canvas.removeEventListener('pointerdown',down);
  this.pointerDown=e=>{if(this.enabled&&(!this.allowPointer||this.allowPointer(e)))down(e);};this.canvas.addEventListener('pointerdown',this.pointerDown);
  this.configure();this.handleResize();this.stopMotion();
 }
 setMode(mode){
  if(!cameraModes.some(([id])=>id===mode))throw new Error('未知相机模式');if(mode===this.mode)return;
  if(this._pointers.length)throw new Error('请先结束相机拖动');this.mode=mode;this.create();this.syncCamera();
 }
 stopMotion(){
  const c=this.active;if(!c)return;
  if(c instanceof CalibratedTrackball)c.stopMotion();
  else if(c instanceof OrbitControls){c._sphericalDelta.set(0,0,0);c._panOffset.set(0,0,0);c._scale=1;}
 }
 handleResize(){const c=this.active;if(c instanceof CalibratedTrackball)c.handleResize();else if(c instanceof ArcballControls)c._onWindowResize();}
 syncCamera(){
  const c=this.active;this.stopMotion();
  if(c.object!==this.object||c instanceof OrbitControls){this.create();}
  if(this.active instanceof CalibratedTrackball)this.active.syncCamera();
  else if(this.active instanceof ArcballControls){this.active.setCamera(this.object);this.active.update();}
  else{const damping=this.active.enableDamping;this.active.enableDamping=false;this.active.update();this.active.enableDamping=damping;}
  this.handleResize();
 }
 update(){if(!this.enabled){this.stopMotion();return;}if(this.mode!=='fly')this.active.update();}
 dispose(){this.release();this.active=null;}
}
