// 可用性只派生自会话，不代替工作台执行时的授权/草稿校验。
export function createControlPresentation({hasModel,busy,hasDraft,hasClips,hasBones,hasPoses,hasItems,quickAvailable,recording,context,poseMode}){
 const ready=hasModel&&!busy,animated=ready&&hasClips;
 const disabled={};
 const group=(ids,value)=>{for(const id of ids)disabled[id]=value;};
 group(['editPose','takePhoto','renameModel','appendClips','capturePose','animationFiles','fit','side','viewPreset','savePose'],!ready);
 group(['replaceModel','modelFiles','demo','humanDemo','green'],busy);
 group(['newAction','saveAction'],!ready||!hasItems);
 group(['source','sourceTime','sourceSeek','trimIn','trimOut','markIn','markOut'],!animated);
 group(['bone','rx','ry','rz','skeleton'],!ready||!hasBones);
 disabled.recordVideo=!hasModel||(busy&&!recording);
 disabled.quickSequence=!ready||!quickAvailable;disabled.addPose=!ready||!hasPoses;disabled.seek=!hasItems;
 return {disabled,hasModel,hasItems,workspaceDisabled:!ready||hasDraft,recording,
  recordLabel:recording?'停止录像':'录像',recordTitle:recording?'停止录像':'录像 · 从头录制'+(poseMode&&hasItems?'当前编排':context)};
}
