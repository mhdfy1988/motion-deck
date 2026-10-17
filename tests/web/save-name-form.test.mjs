import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {bindSaveNameForm} from '../../web/labs/motion/ui/save-name-form.js';

class Control extends EventTarget{
 value='';disabled=false;open=false;
 showModal(){this.open=true;}
 close(){this.open=false;this.dispatchEvent(new Event('close'));}
 focus(){this.focused=true;}
 setCustomValidity(text){this.error=text;}
 reportValidity(){this.reported=true;}
}
function fixture(onSubmit){
 const dialog=new Control(),form=new Control(),input=new Control(),submit=new Control(),cancel=new Control();
 const view=bindSaveNameForm({dialog,form,input,submit,cancelButtons:[cancel],emptyMessage:'请输入名称',isBusy:()=>false,onSubmit});
 const send=()=>form.dispatchEvent(new Event('submit',{cancelable:true}));
 return {dialog,form,input,submit,cancel,view,send};
}

test('共用表单校验名称、传递原提交上下文，失败保持弹窗成功关闭',async()=>{
 const calls=[];let success=false;const f=fixture(async(name,payload)=>{calls.push([name,payload]);return success;});
 const pose=[1];f.view.open('',pose);f.send();assert.equal(f.input.error,'请输入名称');assert.equal(calls.length,0);
 f.input.value=' 姿势 ';f.input.dispatchEvent(new Event('input'));f.send();await setImmediate();
 assert.deepEqual(calls,[['姿势',pose]]);assert.equal(f.dialog.open,true);assert.equal(f.submit.disabled,false);assert.equal(f.input.error,'');
 success=true;f.send();await setImmediate();assert.equal(f.dialog.open,false);f.send();await setImmediate();assert.equal(calls.length,2);
});

test('提交锁不重复保存，取消清上下文，销毁解绑但不擅自关闭原弹窗',async()=>{
 let finish,calls=0;const f=fixture(()=>{calls++;return new Promise(resolve=>finish=resolve);});
 f.view.open('动作');f.send();f.send();assert.equal(calls,1);assert.equal(f.submit.disabled,true);
 finish(false);await setImmediate();f.cancel.dispatchEvent(new Event('click'));f.send();assert.equal(calls,1);
 f.view.open('另存');f.view.dispose();f.send();f.cancel.dispatchEvent(new Event('click'));assert.equal(calls,1);assert.equal(f.dialog.open,true);
});
