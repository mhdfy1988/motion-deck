import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createModelLibraryOperations} from '../../web/labs/motion/application/model-library-operations.js';
import {bindLibraryFileInputs} from '../../web/labs/motion/ui/library-file-inputs.js';
function fixture(overrides={}){
 const state={root:{},rig:{},busy:false,poses:[{id:'p'}],clips:[{name:'旧动作',thirdParty:true}],model:{name:'旧名'}},calls=[];
 const operations=createModelLibraryOperations({state,prepareImport:async()=>[{id:'new'}],persist:async data=>calls.push(data),onBusyChange:()=>calls.push(state.busy),refreshMenu:async()=>calls.push('menu'),...overrides});return {state,operations,calls};
}
test('追加素材整笔写盘后才提交，动作与姿势分别沿原数组',async()=>{
 let f;f=fixture({persist:async candidate=>{assert.equal(f.state.clips.length,1);assert.equal(candidate.thirdParty.length,2);}});
 assert.deepEqual(await f.operations.append('action',['file']),{kind:'action',count:1});assert.equal(f.state.clips.length,2);assert.equal(f.state.busy,false);
 const pose=fixture();await pose.operations.append('pose',['file']);assert.equal(pose.state.poses.length,2);assert.equal(pose.state.clips.length,1);
});
test('准备失败/磁盘失败释放忙碌，不提交数组，忙碌不重入',async()=>{
 for(const overrides of [{prepareImport:async()=>{throw Error('解析失败');}},{persist:async()=>{throw Error('写入失败');}}]){
  const {state,operations}=fixture(overrides),before=state.poses;
  await assert.rejects(operations.append('pose',[]),/失败/);assert.equal(state.poses,before);assert.equal(state.busy,false);
  state.busy=true;assert.equal(await operations.append('action',[]),null);
 }
});
test('模型名称保存失败不提交，菜单失败不冒充磁盘回滚',async()=>{
 const f=fixture();assert.equal(await f.operations.rename('新名'),true);assert.equal(f.state.model.name,'新名');assert.equal(f.calls.at(-2),'menu');
 const failed=fixture({persist:async()=>{throw Error('写盘失败');}});await assert.rejects(failed.operations.rename('新名'));assert.equal(failed.state.model.name,'旧名');
 const menu=fixture({refreshMenu:async()=>{throw Error('菜单失败');}});await assert.rejects(menu.operations.rename('新名'));assert.equal(menu.state.model.name,'新名');assert.equal(menu.state.busy,false);
});
test('文件输入转交同一FileList，完成后清空并支持销毁解绑',async()=>{
 class Input extends EventTarget{constructor(){super();this.files=['file'];this.value='chosen';}}
 const actions=new Input(),poses=new Input(),calls=[];
 const view=bindLibraryFileInputs({actions,poses,onAppend:async(kind,files)=>calls.push([kind,files])});
 actions.dispatchEvent(new Event('change'));poses.dispatchEvent(new Event('change'));await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls,[['action',actions.files],['pose',poses.files]]);assert.equal(actions.value,'');view.dispose();actions.dispatchEvent(new Event('change'));assert.equal(calls.length,2);
});
