import {test} from 'node:test';
import assert from 'node:assert/strict';
import {builtins,catalogRecord} from '../../web/labs/motion/model-catalog.js';
import {validateLibrary} from '../../web/labs/motion/action-library.js';

test('模型目录按内容身份更新，重命名不产生另一模型，来源名称独立于动作数量',()=>{
 const key='a'.repeat(64),other='b'.repeat(64),initial={version:1,models:[{key,name:'旧名称'},{key:other,name:'其他模型'}]};
 const record=catalogRecord(initial,key,{name:'新名称'});assert.equal(record.data.models.length,2);assert.deepEqual(initial.models[0],{key,name:'旧名称'});assert.deepEqual(record.data.models[1],{key,name:'新名称'});
 assert.deepEqual(builtins.map(m=>m.name),['Quaternius','Mesh2Motion']);assert.equal(builtins.length,2);
});
test('模型元数据和目录复用静态运行时校验，拒绝非法身份和未知内置来源',()=>{
 const key='a'.repeat(64),catalog={version:1,models:[]};
 assert.throws(()=>catalogRecord(catalog,'bad',{name:'模型'}),/无效/);assert.throws(()=>catalogRecord(catalog,key,{name:'模型',builtinId:'unknown'}),/无效/);
 validateLibrary({version:1,modelKey:key,actions:[],model:{name:'模型',builtinId:'makehuman'}},key);
 validateLibrary({version:1,modelKey:key,actions:[],model:{name:'Mesh2Motion',builtinId:'mesh2motion'}},key);
 assert.throws(()=>validateLibrary({version:1,modelKey:key,actions:[],model:{name:'',builtinId:'unknown'}},key));
});
