import {fingerTip} from './hand-rig.js';
import {dragHandJoint} from './hand-joint-motion.js';

// 三点逐段摆动：节点只控制它紧邻的上游骨，其余骨的局部姿态不变。
export class FingerJointDrag{
 constructor(finger,{segment=0,getMode=()=> 'natural'}={}){
  if(!Number.isInteger(segment)||segment<0||segment>2)throw new Error('手指分段无效');
  this.finger=finger;this.segment=segment;this.bones=[finger.bones[segment]];this.getMode=getMode;
  // 指尖只读真实标定偏移，不向模型树插辅助骨。
  this.node=segment<2?finger.bones[segment+1]:{getWorldPosition:target=>target.copy(fingerTip(finger))};
 }
 begin(){this.feedback=[];this.residual=0;}
 moveScreen(delta,camera,pixels){
  const result=dragHandJoint({bone:this.bones[0],node:this.node,config:this.finger.configs[this.segment],camera,delta,mode:this.getMode(),pixels});
  this.residual=result.residual;this.feedback=result.limited||!result.changed?[{joint:this.bones[0].name,residual:result.residual}]:[];return result;
 }
 dispose(){}
}
