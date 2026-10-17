const allowedControls=new Set(['closeDesktopSettings','desktopControlWrite','desktopControlToggle','replaceModel','capturePose','viewPreset','fit','side','skeleton','green','takePhoto','desktopSettings']);

// 只判断输入归属；操作时仍由原工作台/时间轴验证草稿和忙碌状态。
export function decideDraftInput(context,input){
 if(!context.hasDraft)return {action:'allow'};
 const key=(input.key??'').toLowerCase();
 if(input.type==='keydown'&&(input.ctrlKey||input.metaKey)&&['z','y'].includes(key)&&!input.textInput)return {action:'history',direction:key==='y'||input.shiftKey?'redo':'undo'};
 if(!input.hasControl)return {action:input.inTimeline?'block':'allow'};
 if(context.origin==='user'&&input.userEditorControl)return {action:'allow'};
 if(input.assistantTools||input.inDialog&&input.dialogId!=='desktopSettingsDialog'||allowedControls.has(input.controlId))return {action:'allow'};
 return {action:'block'};
}
