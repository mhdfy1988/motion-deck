import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Object3D} from 'three';
import {capturePose} from '../../web/labs/motion/core/sequence-core.js';
import {createFramingPlan,createRecordingPlan,createPreviewMediaController} from '../../web/labs/motion/application/preview-media-controller.js';

function fixture(overrides={}){
 const root=new Object3D(),state={root,busy:false,playing:true,mode:'source',clips:[{duration:2,tracks:[{times:[0,.5,1,2]}]}],items:[],sequence:{duration:3,spans:[]},customPreview:{sequence:{duration:4,spans:[]}},rootMotion:{horizontal:true,vertical:true}},calls=[];
 const sampled=time=>{const pose=capturePose(root);pose[0].p[0]=time;return pose;};
 const workbench={sampleSource:(clip,time)=>{calls.push(['source',time]);return sampled(time);},sampleOutput:(sequence,time)=>{calls.push(['output',sequence.duration,time]);return {pose:sampled(time)};}};
 let activeCapture;
 const options={state,workbench,getSourceIndex:()=>0,getSpeed:()=>2,getName:()=>'测试',isAdvanced:()=>false,stopMotion:()=>calls.push('stopMotion'),frame:()=>calls.push('frame'),sampleTimes:(duration,keys)=>[duration,...keys],measureBounds:()=>({bounds:true}),nextFrame:async()=>calls.push('nextFrame'),createCapture:()=>{
  activeCapture={photo:async()=>new Blob(['png']),record:async plan=>{plan.sample(1);return {blob:new Blob(['video']),extension:'mp4'};},dispose:()=>calls.push('dispose'),stop:()=>calls.push('stop')};return activeCapture;
 },download:(blob,name)=>calls.push(['download',name]),lockInteraction:()=>{calls.push('lock');return ()=>calls.push('unlock');},onChange:()=>calls.push(['change',state.busy]),message:(text,error)=>calls.push(['message',text,!!error]),onStopRequested:()=>calls.push('stopRequested'),onRecordingEnd:()=>calls.push('end'),...overrides};
 const controller=createPreviewMediaController(options);return {state,workbench,options,controller,calls,get activeCapture(){return activeCapture;}};
}
test('取景保留源关键时刻、裁剪/变速映射与位移过滤边界',()=>{
 const {state,workbench,options,calls}=fixture();
 const plan=()=>createFramingPlan({state,workbench,sourceIndex:0,sampleTimes:options.sampleTimes});
 assert.deepEqual(plan().times,[2,0,.5,1,2]);plan().sample(.5);assert.deepEqual(calls.at(-1),['source',.5]);
 const a=capturePose(state.root),b=structuredClone(a);b[0].p[1]=1;
 state.mode='sequence';state.sequence={duration:5,spans:[{kind:'action',clip:state.clips[0],start:1,duration:4,in:.5,out:1,a,b}]};
 const sequence=plan();assert.deepEqual(sequence.times,[5,1,5,1,5]);assert.deepEqual(sequence.poses,[a,b]);sequence.sample(2);assert.deepEqual(calls.at(-1),['output',5,2]);
 state.rootMotion.vertical=false;assert.equal(plan().poses,undefined);
 state.mode='custom';assert.deepEqual(plan().times,[0]);state.mode='pose';assert.deepEqual(plan().times,[0]);
});
test('静态姿势取景仍取当前姿势，有编排录像才使用编排，不切换模式',()=>{
 const f=fixture(),before=capturePose(f.state.root);f.state.mode='pose';
 assert.equal(createRecordingPlan({state:f.state,workbench:f.workbench,sourceIndex:0}),null);
 f.state.items=[{id:'x'}];const plan=createRecordingPlan({state:f.state,workbench:f.workbench,sourceIndex:0});assert.equal(plan.duration,3);plan.sample(.8);assert.equal(f.state.root.position.x,.8);assert.equal(f.state.mode,'pose');
 const still=createFramingPlan({state:f.state,workbench:f.workbench,sourceIndex:0,sampleTimes:()=>{throw Error('静态姿势不用轴');}});assert.equal(still.sample()[0].p[0],.8);assert.equal(before[0].p[0],0);
 f.state.mode='custom';assert.equal(createRecordingPlan({state:f.state,workbench:f.workbench,sourceIndex:0}).duration,4);
});
test('截图释放捕获、恢复忙碌，不暂停播放；错误也释放',async()=>{
 const f=fixture();await f.controller.photo();assert.equal(f.state.playing,true);assert.equal(f.state.busy,false);assert.ok(f.calls.some(value=>Array.isArray(value)&&value[1]==='测试.png'));assert.equal(f.calls.filter(value=>value==='dispose').length,1);
 const failed=fixture({createCapture:()=>({photo:async()=>{throw Error('编码失败');},dispose:()=>{failed.calls.push('dispose');}})});await failed.controller.photo();assert.equal(failed.state.busy,false);assert.ok(failed.calls.some(value=>Array.isArray(value)&&value[1]==='拍照失败：编码失败'));assert.ok(failed.calls.includes('dispose'));
});
test('录像采样恢复原姿势/播放状态并释放锁，不写时间和编辑历史',async()=>{
 const f=fixture();f.state.time=1.4;f.state.revision=7;f.state.root.position.set(3,4,5);const before=capturePose(f.state.root);
 await f.controller.record();assert.deepEqual(capturePose(f.state.root),before);assert.equal(f.state.playing,true);assert.equal(f.state.busy,false);assert.equal(f.state.time,1.4);assert.equal(f.state.revision,7);assert.equal(f.controller.recording,false);
 assert.ok(f.calls.includes('lock'));assert.ok(f.calls.includes('unlock'));assert.ok(f.calls.includes('end'));assert.ok(f.calls.some(value=>Array.isArray(value)&&value[1]==='测试.mp4'));
});
test('录像失败/捕获创建失败仍恢复锁和原姿势；静态无编排不占用忙碌',async()=>{
 let f;f=fixture({createCapture:()=>({record:async()=>{f.state.root.position.x=99;throw Error('已取消');},dispose:()=>{}})});await f.controller.record();assert.equal(f.state.root.position.x,0);assert.equal(f.state.playing,true);assert.equal(f.state.busy,false);assert.ok(f.calls.includes('unlock'));
 const failed=fixture({createCapture:()=>{throw Error('渲染失败');}});await failed.controller.record();assert.equal(failed.state.busy,false);assert.ok(failed.calls.includes('unlock'));
 const still=fixture();still.state.mode='pose';await still.controller.record();assert.equal(still.state.busy,false);assert.ok(!still.calls.includes('lock'));
});
test('录制中再次点击只请求停止，销毁沿捕获取消；忙碌拒绝新操作',async()=>{
 let finish;const stopCalls=[];
 const f=fixture({createCapture:()=>({record:()=>new Promise(resolve=>{finish=resolve;}),stop:()=>stopCalls.push('stop'),dispose:()=>stopCalls.push('dispose')})});
 const recording=f.controller.record();assert.equal(f.controller.recording,true);await f.controller.photo();await f.controller.fit();await f.controller.record();assert.deepEqual(stopCalls,['stop']);assert.ok(f.calls.includes('stopRequested'));
 f.controller.dispose();assert.deepEqual(stopCalls,['stop','dispose']);finish({blob:new Blob(['video']),extension:'webm'});await recording;assert.equal(f.state.busy,false);
});
test('自动取景等待一帧、提交边界并恢复播放，错误/高级入口不串流程',async()=>{
 const f=fixture();await f.controller.fit();assert.deepEqual(f.state.viewBounds,{bounds:true});assert.equal(f.state.playing,true);assert.equal(f.state.busy,false);assert.ok(f.calls.indexOf('nextFrame')<f.calls.indexOf('frame'));
 const failed=fixture({measureBounds:()=>{throw Error('不可计算');}});await failed.controller.fit();assert.equal(failed.state.viewBounds,undefined);assert.equal(failed.state.busy,false);assert.equal(failed.state.playing,true);
 const advanced=fixture({isAdvanced:()=>true});await advanced.controller.fit();assert.deepEqual(advanced.calls,['frame']);
});
