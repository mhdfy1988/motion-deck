import {test} from 'node:test';import assert from 'node:assert/strict';
import {createTimelineHistory} from '../../web/labs/motion/timeline-history.js';
test('编排事务按一次手势合并，空事务不入历史，新修改清空重做',()=>{
 let items=[{id:'a',clip:{uuid:'clip'}}];const history=createTimelineHistory(()=>({items:items.map(i=>({...i}))}),s=>{items=s.items.map(i=>({...i}));},()=>{});
 history.begin();history.run(()=>{items[0].duration=2;});history.run(()=>{items[0].duration=4;});history.end();history.undo();assert.equal(items[0].duration,undefined);assert.equal(history.canUndo,false);history.redo();assert.equal(items[0].duration,4);
 history.begin();history.end();history.undo();assert.equal(items[0].duration,undefined);history.run(()=>items=[]);assert.equal(history.canRedo,false);history.undo();assert.equal(items[0].id,'a');history.reset();assert.equal(history.canUndo,false);
});
