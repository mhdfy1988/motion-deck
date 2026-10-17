import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateLocalReport} from '../../scripts/local-acceptance-gate.mjs';

function report(){return {stats:{startTime:new Date(Date.now()-1000).toISOString(),expected:138,duration:10,unexpected:0,flaky:0,skipped:0},errors:[],suites:[{file:'tests/motion-lab/playback-mode.spec.js',suites:[]}]};}
test('发布报告检查真实数量与文件，失败/不稳定/跳过不得放行',()=>{
 const required=['playback-mode.spec.js'];assert.equal(typeof validateLocalReport(report(),138,required),'number');
 for(const change of [{expected:137},{unexpected:1},{flaky:1},{skipped:1},{duration:0},{startTime:'invalid'}]){
  const data=report();Object.assign(data.stats,change);assert.throws(()=>validateLocalReport(data,138,required));
 }
 const data=report();data.errors=[{message:'错误'}];assert.throws(()=>validateLocalReport(data,138,required));
 assert.throws(()=>validateLocalReport(report(),138,['finger-edit.spec.js']),/缺少测试文件/);
});
