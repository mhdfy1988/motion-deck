import {Raycaster,Vector2} from 'three';

// 身体与手部共用指针坐标，不拥有选择状态、骨骼或编辑历史。
export function pointerCoordinates(event,canvas){
 const box=canvas.getBoundingClientRect();
 return {
  x:(event.clientX-box.left)/box.width*2-1,
  y:-(event.clientY-box.top)/box.height*2+1,
  button:event.button
 };
}

export function pointerRay(event,canvas,camera){
 const point=pointerCoordinates(event,canvas),ray=new Raycaster();
 ray.setFromCamera(new Vector2(point.x,point.y),camera);
 return ray;
}

// 重叠点击区按可见点中心距离分流；身体用实际按钮范围，手部沿用8像素半宽。
export function nearestPoseHandle(parts,event,{radius}={}){
 let nearest=null,distance=Infinity;
 for(const part of parts){
  if(!part.button||part.button.hidden||part.button.disabled)continue;
  const box=part.button.getBoundingClientRect();
  const dx=event.clientX-box.left-box.width/2,dy=event.clientY-box.top-box.height/2;
  if(Math.abs(dx)>(radius??box.width/2)||Math.abs(dy)>(radius??box.height/2))continue;
  const squared=dx*dx+dy*dy;
  if(squared<distance){distance=squared;nearest=part;}
 }
 return nearest;
}
