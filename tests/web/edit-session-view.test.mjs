import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindEditSessionView} from '../../web/labs/motion/ui/edit-session-view.js';

class Control extends EventTarget{
 constructor(){super();this.attributes={};this.classList={toggle:(name,value)=>{this[name]=value;}};}
 setAttribute(key,value){this.attributes[key]=value;}
 matches(){return !!this.textInput;}
 closest(selector){return selector==='button,input,select,a'?this.control:null;}
}
test('编辑视图转交意图、捕获隔离/离开保护和历史，销毁清自有节点/监听',()=>{
 const names=['documentTarget','windowTarget','body','panel','sourcePanel','editButton','undoButton','resetButton','timeline'],elements=Object.fromEntries(names.map(name=>[name,new Control()])),calls=[],mode={};let redo,context={hasDraft:false},protect=false;
 elements.panel.querySelector=()=>mode;elements.undoButton.ownerDocument={createElement:()=>new Control()};elements.undoButton.after=node=>{redo=node;node.remove=()=>calls.push('remove');};
 const view=bindEditSessionView({...elements,poseLayout:{sync:value=>calls.push(['layout',value])},advancedTools:false,icons:{'redo-2':'R'},stopMotion:()=>calls.push('stop'),onToggle:()=>calls.push('toggle'),onPanelChanged:()=>calls.push('panel'),onHistory:direction=>calls.push(direction),getInputState:()=>context,preventUnload:()=>protect,onBlocked:()=>calls.push('block'),onTimelineHistory:direction=>calls.push('timeline:'+direction),onTimelineAll:()=>calls.push('all')});
 elements.editButton.dispatchEvent(new Event('click'));elements.panel.dispatchEvent(new Event('toggle'));elements.undoButton.dispatchEvent(new Event('click'));redo.dispatchEvent(new Event('click'));assert.deepEqual(calls,['toggle','panel','undo','redo']);
 view.renderEditing(true);assert.equal(elements.body['pose-editing'],true);assert.equal(elements.sourcePanel.hidden,true);assert.equal(mode.textContent,'退出编辑');view.renderHistory({undoDisabled:true,redoDisabled:false});assert.equal(redo.disabled,false);
 const emit=(target,type,values={})=>{const event=Object.assign(new Event(type,{cancelable:true}),values);target.dispatchEvent(event);return event;};
 context={hasDraft:true,origin:'user'};elements.documentTarget.control=elements.editButton;
 const blocked=emit(elements.documentTarget,'click');assert.equal(blocked.defaultPrevented,true);assert.equal(calls.at(-1),'block');
 const history=emit(elements.documentTarget,'keydown',{key:'z',ctrlKey:true});assert.equal(history.defaultPrevented,true);assert.equal(calls.at(-1),'undo');
 protect=true;assert.equal(emit(elements.windowTarget,'beforeunload').defaultPrevented,true);
 emit(elements.timeline,'keydown',{key:'a',ctrlKey:true});assert.equal(calls.at(-1),'all');
 view.dispose();const size=calls.length;emit(elements.editButton,'click');emit(elements.documentTarget,'click');emit(elements.windowTarget,'beforeunload');assert.equal(calls.length,size);assert.equal(calls.at(-1),'remove');
});
