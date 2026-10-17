import * as THREE from 'three';

// 触边后以当前鼠标和受限姿态重新计增量；反向一动即返回，不必先拖回超调区。
// Esc仍由工作台完整事务恢复，不能依赖此处重设的控件起点。
export function rebaseLimitedRotation(control){
 if(!control.dragging||!control.object)return;
 if(!control._quaternionStart?.isQuaternion||!control.pointEnd?.isVector3)throw new Error('旋转限位适配与Three版本不匹配');
 control._quaternionStart.copy(control.object.quaternion);control.pointStart.copy(control.pointEnd);
 control.object.updateWorldMatrix(true,false);control.object.getWorldQuaternion(control.worldQuaternionStart);control.rotationAngle=0;
}

// Three.js 0.186.1三轴适配层：不混入E/XYZE显示或拾取。
// 使用有厚度的完整圆环；沿相机方向弱化后半圈，不叠加自由旋转入口。
export function bindRotationRings(control){
 const helper=control._gizmo,axes=['X','Y','Z'],colors={X:0xed7984,Y:0x78d8a3,Z:0x76b4f5};
 if(!helper?.gizmo?.rotate||!helper?.picker?.rotate)throw new Error('旋转控件结构不兼容');
 const orient=(geometry,axis)=>{
  geometry.rotateY(Math.PI/2);geometry.rotateX(Math.PI/2);
  if(axis==='Y')geometry.rotateZ(-Math.PI/2);
  if(axis==='Z')geometry.rotateY(Math.PI/2);
  return geometry;
 };
 const materials=new Map();
 for(const axis of axes){
  const ring=helper.gizmo.rotate.children.find(n=>n.name===axis),picker=helper.picker.rotate.children.find(n=>n.name===axis);
  if(!ring||!picker)throw new Error(`旋转控件缺少${axis}轴`);
  ring.geometry.dispose();ring.geometry=orient(new THREE.TorusGeometry(.5,.024,12,96),axis);
  // 光照表现圆管截面，前后半圈按实际视线区分；材质仍由原控件销毁。
  ring.material=new THREE.MeshPhongMaterial({color:colors[axis],specular:0x8a9baa,shininess:48,transparent:true,opacity:.95,depthTest:false,depthWrite:false,toneMapped:false});
  const uniforms={trackCenter:{value:new THREE.Vector3()},trackEye:{value:new THREE.Vector3()},trackRadius:{value:1}};
  ring.material.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,uniforms);
   shader.vertexShader='varying vec3 vTrackWorld;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvTrackWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
   shader.fragmentShader='varying vec3 vTrackWorld;\nuniform vec3 trackCenter;\nuniform vec3 trackEye;\nuniform float trackRadius;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat trackFacing = dot(vTrackWorld - trackCenter, normalize(trackEye - trackCenter));\ndiffuseColor.a *= mix(0.24, 1.0, smoothstep(-trackRadius * 0.08, trackRadius * 0.08, trackFacing));');
  };
  ring.onBeforeRender=(_renderer,_scene,camera)=>{uniforms.trackCenter.value.copy(control.worldPosition);camera.getWorldPosition(uniforms.trackEye.value);uniforms.trackRadius.value=ring.scale.x*.5;};
  materials.set(axis,{ring,base:new THREE.Color(colors[axis])});
  picker.geometry.dispose();picker.geometry=orient(new THREE.TorusGeometry(.5,.035,8,96),axis);
 }
 control.showE=false;control.showXYZE=false;
 const originalUpdate=helper.updateMatrixWorld;
 helper.updateMatrixWorld=function(force){
  originalUpdate.call(this,force);
  for(const group of [this.gizmo.rotate,this.picker.rotate])for(const part of group.children)part.visible=part.visible&&axes.includes(part.name);
  // 当前轨道自身提亮表示选中轴，不显示贯穿全视口的轴辅助长线。
  for(const part of this.helper.rotate.children)part.visible=false;
  for(const [axis,{ring,base}] of materials){ring.material.color.copy(base);if(control.axis===axis)ring.material.color.lerp(new THREE.Color(0xffffff),.38);ring.material.opacity=control.axis&&control.axis!==axis?.35:.95;ring.renderOrder=control.axis===axis?1002:1000;}
 };
 return {dispose(){helper.updateMatrixWorld=originalUpdate;}};
}
