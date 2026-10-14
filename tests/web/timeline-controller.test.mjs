import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSessionState} from '../../web/labs/motion/application/session-state.js';
import {createTimelineController} from '../../web/labs/motion/application/timeline-controller.js';
test('操作层共用状态，无DOM即可移动、裁剪、变速与删除',()=>{
 const state=createSessionState(null);state.items=[{id:'a',kind:'action',clip:{duration:4},in:0,out:4,duration:4},{id:'b',kind:'pose',duration:1,transition:.35}];state.selection=new Set(['a']);
 const controller=createTimelineController(state),original={...state.items[0]};
 assert.equal(controller.resize('a',2,'right',original,'trim'),true);assert.equal(state.items[0].out,2);
 controller.resize('a',1,'right',{...state.items[0]},'duration');assert.equal(state.items[0].out,2);assert.equal(state.items[0].duration,1);
 controller.move('a','b',true);assert.deepEqual(state.items.map(item=>item.id),['b','a']);
 controller.remove();assert.deepEqual(state.items.map(item=>item.id),['b']);
 state.selection=new Set(['transition:b']);controller.remove();assert.equal(state.items[0].transition,0);
 state.busy=true;assert.equal(controller.resize('b',8,'right',state.items[0],'duration'),false);
});
