import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTimelinePresentation} from '../../web/labs/motion/application/timeline-presentation.js';

test('动作/姿势/过渡派生稳定身份及原展示字段，不携带素材',()=>{
 const clip={name:'源',tracks:[1]},snapshot={bones:[1]};
 const spans=[{id:'a',kind:'action',name:'源',start:0,duration:1,in:0,out:1,clip},{kind:'transition',targetId:'b',name:'过渡',start:1,duration:.5},{id:'b',kind:'pose',name:'姿势一',start:1.5,duration:.3,snapshot}];
 const input={spans,duration:1.8,items:[{id:'a'},{id:'b'}],selected:1,selectedTransition:true},before=JSON.stringify(input);
 const result=createTimelinePresentation(input,span=>span.kind==='action'?'中文动作':span.name);
 assert.deepEqual(result.entries.map(x=>x.key),['a','transition:b','b']);
 assert.deepEqual(result.entries.map(x=>x.selected),[false,true,false]);
 assert.deepEqual(result.entries.map(x=>x.label),['动作 · 中文动作','过渡','姿势 · 姿势一']);
 assert.equal(result.entries[0].sourceIn,0);assert.equal(result.entries[0].sourceOut,1);
 assert.equal(result.entries[2].durationLabel,'0.30 s');assert.equal(result.entries[2].title,'姿势一 · 1.50—1.80秒');
 assert.equal(JSON.stringify(input),before);assert.ok(result.entries.every(x=>!('clip' in x)&&!('snapshot' in x)));
});
test('选中片段不误选其过渡，空编排正常返回',()=>{
 const spans=[{id:'a',kind:'pose',start:0,duration:1,name:'一'},{kind:'transition',targetId:'a',start:1,duration:.5,name:'过渡'}];
 const model=createTimelinePresentation({spans,duration:1.5,items:[{id:'a'}],selected:0},x=>x.name);
 assert.deepEqual(model.entries.map(x=>x.selected),[true,false]);
 assert.deepEqual(createTimelinePresentation({},()=>{throw Error('空轴不应查询名称');}),{duration:0,entries:[]});
});
