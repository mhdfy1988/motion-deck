import {MOUSE,Vector3} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

// 人物与手部共用一个稳定入口；只适配官方轨道控件，不维护第二套相机数学。
export class ViewControls{
 constructor(camera,canvas){
  this.object=camera;
  this.canvas=canvas;
  this.target=new Vector3();
  this._enabled=true;
  this._rotate=true;
  this.active=null;
  this.create();
 }
 get mode(){return 'orbit';}
 get enabled(){return this._enabled;}
 set enabled(value){this._enabled=value;this.stopMotion();this.configure();}
 get enableRotate(){return this._rotate;}
 set enableRotate(value){this._rotate=value;this.stopMotion();this.configure();}

 configure(){
  if(!this.active)return;
  this.active.enabled=this.enabled;
  this.active.enableRotate=this.enableRotate;
  this.active.enableDamping=false;
 }
 release(){
  if(!this.active)return;
  this.canvas.removeEventListener('pointerdown',this.pointerDown);
  this.active.dispose();
  this.active=null;
 }
 create(){
  const camera=this.object;
  const saved={position:camera.position.clone(),quaternion:camera.quaternion.clone(),zoom:camera.zoom};
  // 官方构造时由camera.up建立轨道轴，必须先设世界竖直方向；近景同样不侧翻。
  camera.up.set(0,1,0);
  this.release();
  const control=this.active=new OrbitControls(camera,this.canvas);
  camera.position.copy(saved.position);
  camera.quaternion.copy(saved.quaternion);
  camera.zoom=saved.zoom;
  camera.updateProjectionMatrix();
  control.target=this.target;
  control.mouseButtons={LEFT:MOUSE.ROTATE,MIDDLE:MOUSE.PAN,RIGHT:null};
  control.minDistance=.005;
  control.minZoom=.01;
  control.minPolarAngle=.05;
  control.maxPolarAngle=Math.PI-.05;

  // 固定Three.js 0.186.1内部入口，升级时须核对；环命中不让相机登记同一个指针。
  if(typeof control._onPointerDown!=='function'||!control._sphericalDelta||!control._panOffset?.isVector3||typeof control._scale!=='number'){
   this.release();
   throw new Error('OrbitControls输入适配需要更新');
  }
  this.canvas.removeEventListener('pointerdown',control._onPointerDown);
  this.pointerDown=event=>{
   if(this.enabled&&(!this.allowPointer||this.allowPointer(event)))control._onPointerDown(event);
  };
  this.canvas.addEventListener('pointerdown',this.pointerDown);
  this.configure();
  this.stopMotion();
 }
 stopMotion(){
  if(!this.active)return;
  this.active._sphericalDelta.set(0,0,0);
  this.active._panOffset.set(0,0,0);
  this.active._scale=1;
 }
 // OrbitControls直接读取画布尺寸，无需维护轨迹球的独立screen快照。
 handleResize(){}
 syncCamera(){
  // 模型/固定视图/手部切换可能换camera或up，重建官方轨道轴并沿用公共观察中心。
  this.stopMotion();
  this.create();
  this.active.update();
 }
 update(){
  if(!this.enabled){this.stopMotion();return;}
  this.active.update();
 }
 dispose(){this.release();}
}
