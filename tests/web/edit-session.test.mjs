import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEditSession} from '../../web/labs/motion/application/edit-session.js';

function fixture(overrides={}){
 const state={root:{},busy:false,playing:true,poseDraft:null,closed:false},listeners=new Set(),calls=[];let open=false;
 const emit=()=>{for(const listener of listeners)listener();};
 const workbench={subscribe:listener=>{listeners.add(listener);return ()=>listeners.delete(listener);},beginUserDraft:()=>{calls.push('begin');state.poseDraft={origin:'user',undo:[],redo:[],dirty:false};emit();},discardDraft:()=>{calls.push('discard');state.poseDraft=null;emit();},draftHistory:direction=>calls.push(direction)};
 const session=createEditSession({state,workbench,isEnabled:()=>true,isOpen:()=>open,setOpen:value=>{open=value;},confirm:async()=>true,message:text=>calls.push(text),clearSelection:()=>calls.push('clearSelection'),renderEditing:value=>calls.push(['editing',value]),renderHistory:value=>calls.push(['history',value]),onChange:()=>calls.push('change'),notifyDraft:value=>calls.push(['draft',value]),...overrides});
 return {state,session,calls,emit,listeners,setOpen:value=>{open=value;},get open(){return open;}};
}
test('用户进入只建立原工作台草稿，面板变更暂停播放，退出委托原放弃事务',async()=>{
 const f=fixture();await f.session.toggle();assert.equal(f.open,true);assert.equal(f.state.poseDraft.origin,'user');assert.equal(f.calls.filter(value=>value==='begin').length,1);
 f.session.panelChanged();assert.equal(f.state.playing,false);assert.deepEqual(f.calls.at(-2),['editing',true]);
 await f.session.toggle();assert.equal(f.open,false);assert.equal(f.state.poseDraft,null);assert.ok(f.calls.includes('clearSelection'));
});
test('退出取消保留同一草稿与选择，助手草稿不能通过用户面板接管',async()=>{
 const f=fixture({confirm:async()=>false});await f.session.toggle();const draft=f.state.poseDraft;f.calls.length=0;await f.session.toggle();assert.equal(f.open,true);assert.equal(f.state.poseDraft,draft);assert.ok(!f.calls.includes('clearSelection'));
 f.state.poseDraft={origin:'assistant',undo:[],redo:[]};f.setOpen(false);await f.session.toggle();assert.equal(f.open,false);assert.ok(f.calls.includes('请先保存或放弃当前姿势草稿'));
 f.setOpen(true);f.session.panelChanged();assert.equal(f.open,false);
});
test('保存/模型替换结束草稿统一清选择、禁历史，仍引用原历史数组',async()=>{
 const f=fixture();await f.session.toggle();f.state.poseDraft.undo.push({});f.emit();assert.deepEqual(f.calls.at(-1),['history',{undoDisabled:false,redoDisabled:true}]);f.session.history('undo');assert.equal(f.calls.at(-1),'undo');
 f.state.busy=true;f.session.history('undo');f.emit();assert.deepEqual(f.calls.at(-1),['history',{undoDisabled:true,redoDisabled:true}]);f.state.busy=false;f.state.poseDraft=null;f.emit();assert.equal(f.open,false);assert.ok(f.calls.includes('clearSelection'));
});
test('草稿/忙碌/离开与桌面报告规则保持，时间轴只能在无草稿且不忙碌时写入',async()=>{
 const f=fixture();assert.equal(f.session.canEditTimeline(),true);assert.equal(f.session.preventUnload(),false);await f.session.toggle();assert.deepEqual(f.session.inputState(),{hasDraft:true,origin:'user'});assert.equal(f.session.canEditTimeline(),false);assert.equal(f.session.preventUnload(),false);
 f.state.busy=true;assert.equal(f.session.preventUnload(),true);f.state.busy=false;f.state.poseDraft.dirty=true;assert.equal(f.session.preventUnload(),true);f.session.reportDraft();assert.deepEqual(f.calls.at(-1),['draft',true]);
 f.state.closed=true;const size=f.calls.length;f.session.reportDraft();assert.equal(f.calls.length,size);
});
test('销毁退订且不放弃草稿；未结束的确认返回后不再修改会话',async()=>{
 let decide;const f=fixture({confirm:()=>new Promise(resolve=>{decide=resolve;})});await f.session.toggle();const draft=f.state.poseDraft;const pending=f.session.toggle();f.session.dispose();f.session.dispose();assert.equal(f.listeners.size,0);decide(true);await pending;assert.equal(f.state.poseDraft,draft);assert.equal(f.open,true);
 const size=f.calls.length;f.emit();f.session.history('undo');f.session.panelChanged();assert.equal(f.calls.length,size);
});
