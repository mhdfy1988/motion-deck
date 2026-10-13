import {Vector3} from 'three';

export function resizeView(camera,aspect){
 camera.aspect=aspect;
 if(camera.isOrthographicCamera){const half=(camera.top-camera.bottom)/2;camera.left=-half*aspect;camera.right=half*aspect;}
 camera.updateProjectionMatrix();
}

// 用绑定姿势的包围盒统一取景，不逐帧追随角色，保留动作前后的空间关系。
export function fitView(camera,bounds,direction,aspect,framingDirections=[direction]){
 const center=bounds.getCenter(new Vector3()),size=bounds.getSize(new Vector3()).length();
 const forward=direction.clone().normalize(),right=new Vector3().crossVectors(new Vector3(0,1,0),forward).normalize(),up=new Vector3().crossVectors(forward,right);
 const points=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new Vector3(x,y,z).sub(center);points.push([p.dot(right),p.dot(up),p.dot(forward)]);}
 camera.zoom=1;camera.near=Math.max(size/1000,.001);camera.far=size*100;
 let distance=size*2;
 if(camera.isOrthographicCamera){
  // 同一组四/八向共用尺寸，防止切方向时人偶忽大忽小；不按动画帧动态缩放。
  let half=0;for(const view of framingDirections){const f=view.clone().normalize(),r=new Vector3().crossVectors(new Vector3(0,1,0),f).normalize(),u=new Vector3().crossVectors(f,r);for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new Vector3(x,y,z).sub(center);half=Math.max(half,Math.abs(p.dot(u))/.65,Math.abs(p.dot(r))/(.85*aspect));}}
  camera.top=half;camera.bottom=-half;
 }
 else{const tangent=Math.tan(camera.fov*Math.PI/360);distance=Math.max(...points.map(([x,y,z])=>z+Math.max(Math.abs(y)/(.65*tangent),Math.abs(x)/(.85*aspect*tangent))));}
 camera.position.copy(center).addScaledVector(forward,distance);camera.up.set(0,1,0);camera.lookAt(center);resizeView(camera,aspect);return center;
}
