import {Quaternion,Vector3} from 'three';

// 只保存本次手势的数学起点，不拥有姿势或撤销历史。
export function beginWholeRotation(carrier,anchor){
 carrier.updateWorldMatrix(true,false);anchor.updateWorldMatrix(true,false);
 return {carrier,anchor,pivot:anchor.getWorldPosition(new Vector3()),anchorQuaternion:anchor.getWorldQuaternion(new Quaternion()),position:carrier.getWorldPosition(new Vector3()),quaternion:carrier.getWorldQuaternion(new Quaternion())};
}

export function applyWholeRotation(gesture){
 const {carrier,anchor,pivot}=gesture;
 const delta=anchor.getWorldQuaternion(new Quaternion()).multiply(gesture.anchorQuaternion.clone().invert()).normalize();
 const position=gesture.position.clone().sub(pivot).applyQuaternion(delta).add(pivot),quaternion=delta.clone().multiply(gesture.quaternion);
 if(carrier.parent){carrier.parent.updateWorldMatrix(true,false);carrier.parent.worldToLocal(position);quaternion.premultiply(carrier.parent.getWorldQuaternion(new Quaternion()).invert());}
 carrier.position.copy(position);carrier.quaternion.copy(quaternion.normalize());carrier.updateWorldMatrix(false,true);
}
