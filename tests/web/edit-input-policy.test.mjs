import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decideDraftInput} from '../../web/labs/motion/application/edit-input-policy.js';
const user={hasDraft:true,origin:'user'},assistant={hasDraft:true,origin:'assistant'};
test('无草稿放行，不带控件的时间轴阻止，空白观察仍可操作',()=>{
 assert.deepEqual(decideDraftInput({hasDraft:false},{inTimeline:true}),{action:'allow'});
 assert.deepEqual(decideDraftInput(user,{hasControl:false,inTimeline:true}),{action:'block'});
 assert.deepEqual(decideDraftInput(user,{hasControl:false,inTimeline:false}),{action:'allow'});
});
test('草稿撤销重做优先于时间轴；文本输入保留原生快捷键',()=>{
 const event={type:'keydown',ctrlKey:true,key:'Z',hasControl:true,controlId:'poseName',inDialog:true,dialogId:'savePoseDialog'};
 assert.deepEqual(decideDraftInput(user,event),{action:'history',direction:'undo'});
 assert.deepEqual(decideDraftInput(user,{...event,shiftKey:true}),{action:'history',direction:'redo'});
 assert.deepEqual(decideDraftInput(assistant,{...event,key:'y',ctrlKey:false,metaKey:true}),{action:'history',direction:'redo'});
 assert.deepEqual(decideDraftInput(user,{...event,textInput:true}),{action:'allow'});
});
test('用户编辑控件只对用户草稿放行；允许列表与设置权限例外保持',()=>{
 assert.equal(decideDraftInput(user,{hasControl:true,userEditorControl:true}).action,'allow');assert.equal(decideDraftInput(assistant,{hasControl:true,userEditorControl:true}).action,'block');
 for(const controlId of ['replaceModel','capturePose','viewPreset','fit','side','skeleton','green','takePhoto','desktopSettings','closeDesktopSettings','desktopControlWrite','desktopControlToggle'])assert.equal(decideDraftInput(assistant,{hasControl:true,controlId}).action,'allow',controlId);
 for(const controlId of ['play','restart','recordVideo','newAction','saveAction','source'])assert.equal(decideDraftInput(user,{hasControl:true,controlId}).action,'block',controlId);
});
test('保存/确认弹窗与助手工具允许，设置弹窗其他操作仍隔离，不修改输入',()=>{
 const context=structuredClone(user),input={hasControl:true,inDialog:true,dialogId:'motionConfirmDialog'},before=structuredClone(input);
 assert.equal(decideDraftInput(context,input).action,'allow');assert.equal(decideDraftInput(context,{...input,dialogId:'desktopSettingsDialog'}).action,'block');assert.equal(decideDraftInput(context,{hasControl:true,assistantTools:true}).action,'allow');assert.deepEqual(input,before);assert.deepEqual(context,user);
});
