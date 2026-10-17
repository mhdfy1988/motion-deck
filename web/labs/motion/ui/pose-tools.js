// 只渲染摆姿工具与约束反馈，实际操作仍回到BodyControls及工作台。
export class PoseTools{
 constructor({onTool,onConstraintMode,onError}){
  this.element=document.createElement('div');
  this.element.className='body-tool-switch';
  this.element.setAttribute('role','group');
  this.element.setAttribute('aria-label','姿势工具');
  this.toolMode=this.createModes('pose-mode-slider','调整方式',[
   ['pose','摆姿'],['whole','整体调整']
  ],'bodyTool',onTool,onError);
  this.limitMode=this.createModes('joint-limit-mode pose-mode-slider','关节约束',[
   ['natural','自然约束'],['free','自由编辑']
  ],'constraintMode',onConstraintMode,onError);
  this.status=document.createElement('span');
  this.status.className='joint-limit-status';
  this.status.setAttribute('role','status');
  this.element.append(this.createSection('调整方式',this.toolMode),this.createSection('关节约束',this.limitMode),this.status);
  (document.getElementById('poseEditorContent')??document.getElementById('posePanel')).prepend(this.element);
 }
 createSection(label,control){
  const section=document.createElement('section');section.className='pose-tool-section';
  const title=document.createElement('h3');title.textContent=label;section.append(title,control);return section;
 }
 createModes(className,label,choices,key,onChange,onError){
  const group=document.createElement('div');
  group.className=className;
  group.setAttribute('role','group');
  group.setAttribute('aria-label',label);
  for(const [value,text] of choices){
   const button=document.createElement('button');
   button.type='button';button.dataset[key]=value;button.textContent=text;
   button.onclick=()=>{try{onChange(value);}catch(error){onError(error);}};
   group.append(button);
  }
  return group;
 }
 update({state,visible,tool,rig}){
  this.element.hidden=!visible;
  for(const button of this.toolMode.children){
   button.disabled=!visible||state.busy;
   button.setAttribute('aria-pressed',String(button.dataset.bodyTool===tool));
  }
  for(const button of this.limitMode.children){
   button.disabled=!visible||state.busy||tool==='whole'||button.dataset.constraintMode==='natural'&&!rig?.supported;
   button.setAttribute('aria-pressed',String(button.dataset.constraintMode===(state.jointConstraintMode??'free')));
  }
  this.status.textContent=!rig?.supported?'未标定':state.jointConstraintMode!=='natural'?'':state.jointConstraintFeedback?.length?'已到关节边界':state.jointConstraintViolations?`原姿势超限 ${state.jointConstraintViolations}`:'';
  this.status.title=rig?.reason??'';
  this.status.hidden=!this.status.textContent;
  this.status.dataset.kind=state.jointConstraintFeedback?.length?'boundary':'existing';
 }
 dispose(){this.element.remove();}
}
