import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewController} from '../../web/labs/motion/application/preview-controller.js';

function fixture(mode='source'){
 const state={mode,root:{},sampler:{},closed:false,busy:false,poseDraft:null,playing:false,items:[],clips:[{duration:1}],sourceTime:0,customTime:0,time:0,sequence:{duration:1},customPreview:{name:'成品',sequence:{duration:2}}};
 const calls=[];let revision=0,changes=0,index=0;
 const commit=(kind,time,options)=>{calls.push({kind,time,options});if(!options.transient)revision++;};
 const workbench={
  source(i,time,playing,options){state.sourceTime=Math.max(0,Math.min(time,state.clips[i].duration));state.mode='source';state.playing=playing;commit('source',time,options);return {clip:state.clips[i],time:state.sourceTime};},
  sequence(time,options){state.time=Math.max(0,Math.min(time,state.sequence.duration));state.mode='sequence';commit('sequence',time,options);return {time:state.time};},
  custom(preview,time,options){state.customTime=Math.max(0,Math.min(time,preview.sequence.duration));state.mode='custom';commit('custom',time,options);return {time:state.customTime};},
  canAdvance(){return !state.closed&&!state.busy&&!state.poseDraft&&state.playing;}
 };
 const callbacks=[];
 const controller=createPreviewController({state,workbench,getSourceIndex:()=>index,onSource:(result,options)=>callbacks.push(['source',options]),onSequence:()=>callbacks.push(['sequence']),onCustom:()=>callbacks.push(['custom']),onChange:()=>changes++});
 return {state,controller,calls,callbacks,get revision(){return revision;},get changes(){return changes;},setIndex:value=>index=value};
}

test('源动作循环、100毫秒帧上限与倍速保持，瞬态采样不增加编辑版本',()=>{
 const f=fixture();f.state.sourceTime=.95;f.state.playing=true;
 f.controller.advance(1,2);
 assert.ok(Math.abs(f.state.sourceTime-.15)<1e-12);assert.equal(f.state.playing,true);
 assert.equal(f.revision,0);assert.equal(f.calls[0].options.transient,true);
 assert.deepEqual(f.callbacks,[['source',{transient:true}]]);
});

for(const mode of ['sequence','custom'])test(mode+'到尾停在末帧，重播和尾部点击播放从零开始',()=>{
 const f=fixture(mode),field=mode==='sequence'?'time':'customTime',end=mode==='sequence'?1:2;
 f.state[field]=end-.05;f.state.playing=true;
 f.controller.advance(.1,1);assert.equal(f.state[field],end);assert.equal(f.state.playing,false);assert.equal(f.changes,1);assert.equal(f.revision,0);
 f.controller.toggle();assert.equal(f.state[field],0);assert.equal(f.state.playing,true);assert.equal(f.state.mode,mode);
 f.controller.restart();assert.equal(f.state[field],0);assert.equal(f.state.playing,true);assert.equal(f.state.mode,mode);
});

test('静态姿势没有编排不切源，有编排从编排开头开始',()=>{
 const f=fixture('pose');f.controller.toggle();assert.equal(f.calls.length,0);assert.equal(f.state.mode,'pose');
 f.controller.restart();assert.equal(f.state.playing,false);assert.equal(f.state.mode,'pose');
 f.state.items=[{}];f.controller.restart();assert.equal(f.state.mode,'sequence');assert.equal(f.state.time,0);assert.equal(f.state.playing,true);
});

test('预览定位保留当前上下文，时间轴定位显式切到编排，均暂停播放',()=>{
 for(const mode of ['source','custom','sequence']){
  const f=fixture(mode);f.state.playing=true;f.controller.seek(.4);
  assert.equal(f.state.mode,mode);assert.equal(f.state.playing,false);assert.equal(f.calls[0].time,.4);assert.equal(f.revision,1);
 }
 const f=fixture('custom');f.controller.seek(.5,'sequence');assert.equal(f.state.mode,'sequence');assert.equal(f.state.time,.5);
});

test('忙碌、草稿、关闭或无模型时不响应播放操作，暂停时不推进',()=>{
 for(const patch of [{busy:true},{poseDraft:{}},{closed:true},{root:null}]){
  const f=fixture();Object.assign(f.state,patch);f.controller.toggle();f.controller.restart();f.controller.seek(.5);
  assert.equal(f.calls.length,0);assert.equal(f.state.playing,false);
 }
 const f=fixture();f.controller.advance(.1,1);assert.equal(f.calls.length,0);
});

test('展示快照只读同一会话，姿势时进度和时钟保留原各自时间口径',()=>{
 const f=fixture('pose');Object.assign(f.state,{time:.7,sourceTime:.3});const before=structuredClone(f.state);
 const view=f.controller.snapshot();assert.equal(view.time,.7);assert.equal(view.clockTime,.3);assert.equal(view.duration,0);assert.equal(view.context,'姿势');
 assert.deepEqual(f.state,before);assert.equal(f.calls.length,0);
 f.state.mode='custom';f.state.customTime=.8;assert.equal(f.controller.snapshot().time,.8);assert.equal(f.controller.snapshot().duration,2);
});
