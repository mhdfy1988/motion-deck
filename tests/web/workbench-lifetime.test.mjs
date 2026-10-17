import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorkbenchLifetime} from '../../web/labs/motion/application/workbench-lifetime.js';
const phases=['stopViews','stopEditing','closeWorkbench','stopMedia','stopRendering','releaseScene'];
test('关闭先停输入和订阅，再关会话/媒体/渲染/场景，重复调用不重复释放',()=>{
 const calls=[],lifetime=createWorkbenchLifetime(Object.fromEntries(phases.map(name=>[name,()=>calls.push(name)])));
 lifetime.dispose();lifetime.dispose();assert.deepEqual(calls,phases);
});
test('关闭中重入也不双重释放，不恢复旧运行链',()=>{
 const calls=[];let lifetime;
 lifetime=createWorkbenchLifetime(Object.fromEntries(phases.map(name=>[name,()=>{calls.push(name);if(name==='stopEditing')lifetime.dispose();}])));
 lifetime.dispose();assert.deepEqual(calls,phases);
});
test('关闭阶段失败显式抛出，不静默吞掉或伪称全部资源已释放',()=>{
 const calls=[],lifetime=createWorkbenchLifetime(Object.fromEntries(phases.map(name=>[name,()=>{calls.push(name);if(name==='closeWorkbench')throw Error('关闭失败');}])));
 assert.throws(()=>lifetime.dispose(),/关闭失败/);assert.deepEqual(calls,phases.slice(0,3));
});
