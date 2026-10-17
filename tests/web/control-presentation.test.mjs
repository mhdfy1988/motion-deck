import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createControlPresentation} from '../../web/labs/motion/application/control-presentation.js';
import {createWorkbenchControls} from '../../web/labs/motion/ui/workbench-controls.js';
const ready={hasModel:true,busy:false,hasDraft:false,hasClips:true,hasBones:true,hasPoses:true,hasItems:true,quickAvailable:true,recording:false,context:'源动作',poseMode:false};
test('就绪/空模型/无动作能力按原规则刷新，不改输入',()=>{
 const before=JSON.stringify(ready),model=createControlPresentation(ready);
 assert.ok(Object.values(model.disabled).every(value=>value===false));assert.equal(JSON.stringify(ready),before);
 const empty=createControlPresentation({...ready,hasModel:false,hasClips:false,hasBones:false,hasPoses:false,hasItems:false});
 for(const id of ['play','editPose','capturePose','source','bone','saveAction','addPose','seek'])if(id!=='play')assert.equal(empty.disabled[id],true,id);
 assert.equal(empty.disabled.replaceModel,false);assert.equal(empty.disabled.green,false);
});
test('忙碌录像保留停止入口，草稿禁用动态工具但保留观看与保存入口',()=>{
 const busy=createControlPresentation({...ready,busy:true,recording:true});assert.equal(busy.disabled.recordVideo,false);assert.equal(busy.recordLabel,'停止录像');assert.equal(busy.disabled.capturePose,true);
 const draft=createControlPresentation({...ready,hasDraft:true,poseMode:true});assert.equal(draft.workspaceDisabled,true);assert.equal(draft.disabled.capturePose,false);assert.equal(draft.disabled.viewPreset,false);assert.equal(draft.recordTitle,'录像 · 从头录制当前编排');
});
test('控件视图刷新动态节点和原属性，不缓存过期按钮',()=>{
 const elements=new Map(),classes=()=>({values:new Set(),toggle(name,on){if(on)this.values.add(name);else this.values.delete(name);},add(name){this.values.add(name);}});
 const $=id=>{if(!elements.has(id))elements.set(id,{classList:classes(),setAttribute(key,value){this[key]=value;}});return elements.get(id);};
 let workspace=[{}];const body={classList:classes()},view=createWorkbenchControls({getElement:$,body,icons:{square:'S',video:'V'},getWorkspaceButtons:()=>workspace});
 view.render(createControlPresentation({...ready,busy:true}));assert.equal(workspace[0].disabled,true);
 workspace=[{}];view.render(createControlPresentation(ready));assert.equal(workspace[0].disabled,false);assert.equal($('recordVideo').innerHTML,'V');
 view.renderRootMotion({horizontal:true,vertical:false,disabled:true});assert.equal($('previewVerticalMotion').checked,false);assert.equal($('previewVerticalMotion').disabled,true);
 view.renderEditing({exportDisabled:false,canCut:false});assert.equal($('splitAction').disabled,true);
 view.renderSource({name:'动作',range:'0—1 秒',disabled:false});assert.equal($('addAction')['aria-disabled'],'false');
 view.renderTransition({sourceDisabled:false,addDisabled:true});assert.equal($('addTransition').disabled,true);
});
