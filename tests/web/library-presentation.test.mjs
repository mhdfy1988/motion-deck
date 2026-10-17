import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assetPresentation,sourcePresentations,createLibraryPresentation,isDefaultPose} from '../../web/labs/motion/application/library-presentation.js';

function fixture(){
 return {
  activeLibrary:'default',
  clips:[{name:'Idle_Loop',duration:2},{name:'Imported',duration:3,thirdParty:true}],
  poses:[{id:'builtin:stand',name:'站立',pose:[1]},{id:'user-pose',name:'自定义姿势',pose:[2]},{id:'ai-pose',name:'AI姿势',pose:[3]}],
  customs:[{id:'user-action',name:'自定义动作'},{id:'ai-action',name:'AI动作'}],
  aiWorkspace:{tasks:[{id:'task',entries:[{assetId:'ai-pose',kind:'pose',state:'active'},{assetId:'ai-action',kind:'custom',state:'trash'}]}]}
 };
}

test('动作展示保留源索引、第三方归属，普通库不混入AI和回收素材',()=>{
 const state=fixture(),before=structuredClone(state),decoded=[];
 const model=createLibraryPresentation(state,action=>{decoded.push(action.id);return 4.125;});
 assert.equal(model.tab,'action');assert.equal(model.count,3);
 assert.deepEqual(model.groups.map(group=>[group.key,group.open]),[['default',true],['thirdparty',false],['custom',false]]);
 assert.deepEqual(model.groups[0].entries,[{kind:'source',index:0}]);
 assert.deepEqual(model.groups[1].entries,[{kind:'source',index:1}]);
 assert.equal(model.groups[2].entries[0].meta,'4.13 s');
 assert.deepEqual(decoded,['user-action'],'不为普通列表解码AI动作');
 assert.deepEqual(state,before,'展示派生不修改素材/工作区');
});

test('默认姿势只读，自定义姿势优先展开，展示对象不携带姿势快照',()=>{
 const state=fixture();state.activeLibrary='pose';
 const model=createLibraryPresentation(state,()=>{throw new Error('姿势列表不应解码动作');});
 assert.equal(model.count,2);assert.equal(model.groups[0].open,false);assert.equal(model.groups[1].open,true);
 const builtin=model.groups[0].entries[0],custom=model.groups[1].entries[0];
 assert.equal(builtin.readonly,true);assert.equal(custom.readonly,false);
 assert.equal(builtin.editPose,true);assert.equal(custom.editPose,true);
 assert.equal('pose' in builtin,false);assert.equal('pose' in custom,false);
 assert.equal(isDefaultPose(state.poses[0]),true);
});

test('折叠动作组、无自定义姿势、空库及AI计数保持原口径',()=>{
 const state=fixture();state.activeLibrary='actions';
 assert.ok(createLibraryPresentation(state,()=>1).groups.every(group=>!group.open));
 state.activeLibrary='ai';const ai=createLibraryPresentation(state,()=>{throw new Error('AI分组交给既有工作区');});
 assert.equal(ai.tab,'ai');assert.equal(ai.count,1);assert.deepEqual(ai.groups,[]);
 state.activeLibrary='pose';state.poses=[state.poses[0]];
 assert.equal(createLibraryPresentation(state,()=>1).groups[0].open,true);
 state.poses=[];assert.equal(createLibraryPresentation(state,()=>1).empty,'导入姿势，或从预览中保存');
});

test('源动作只产生展示字段与稳定索引，AI条目不会新增双击编辑行为',()=>{
 const source=[{name:'Idle_Loop',duration:2.125}];
 assert.deepEqual(sourcePresentations(source,()=> '站立待机'),[{
  kind:'source',index:0,name:'站立待机',clipName:'Idle_Loop',searchName:'Idle_Loop 站立待机',meta:'2.13 s',title:'Idle_Loop · 单击预览，拖到时间轴放置'
 }]);
 assert.equal(assetPresentation({id:'ai-pose',name:'测试'},'pose').editPose,undefined);
});
