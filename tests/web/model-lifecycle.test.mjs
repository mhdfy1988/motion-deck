import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createModelLifecycle} from '../../web/labs/motion/application/model-lifecycle.js';
import * as THREE from 'three';
import {createSessionState} from '../../web/labs/motion/application/session-state.js';
import {createWorkbenchOperations} from '../../web/labs/motion/application/workbench-operations.js';
import {createModelScene} from '../../web/labs/motion/platform/model-scene.js';

function fixture(){
 const old=new THREE.Group(),next=new THREE.Group();
 const state={...createSessionState(null),root:old,modelKey:'old-key',model:{name:'旧模型'},sampler:{},items:[{id:'clip'}],selection:new Set(['clip']),aiWorkspace:{tasks:[]},playing:true};
 const library={actions:[{id:'saved',name:'已保存'}],aiWorkspace:{version:1,tasks:[],activeTaskId:null}};
 const candidate={root:next,rig:{},data:{modelKey:'new-key'},metadata:{name:'新模型'},poses:[{id:'builtin:stand',pose:[1]}],clips:[{duration:1}],info:{bones:[{}],skins:[]}};
 const log=[],messages=[],restored=[],builtins=[{id:'mesh2motion',files:['default.glb'],prefix:'/fixtures/'},{id:'other',files:['other.glb'],prefix:'/other/'}];
 let answer=true,write=async()=>{},prepare=async()=>candidate,installed=()=>{},ready=()=>{},refresh=async()=>{},last={data:{modelKey:'new-key'},files:['saved.glb']};
 const modelScene={releaseCurrent:()=>log.push('release-old'),createSampler:()=>({}),attach:()=>log.push('attach'),releaseCandidate:()=>log.push('release-candidate')};
 const lifecycle=createModelLifecycle({state,builtins,workbench:{discardDraft(){log.push('discard');state.poseDraft=null;}},
  storage:{modelKey:async()=>{log.push('key');return 'new-key';},readLibrary:async()=>{log.push('read');return library;},saveLibrary:async(...args)=>{log.push('save');await write(...args);},savedModel:async value=>{log.push('saved:'+value);return {files:['cached.glb']};},removeLegacyTestModels:async()=>log.push('cleanup'),lastSavedModel:async()=>last},
  prepareModel:async(...args)=>{log.push('prepare');return prepare(...args);},fetchModelFiles:async(names,prefix,builtin)=>{log.push('fetch:'+builtin?.id);return names;},
  modelScene,history:{reset:()=>log.push('reset-history')},
  confirm:async()=>{log.push('confirm');return answer;},message:(text,error)=>messages.push({text,error}),onBusyChange:()=>log.push('busy:'+state.busy),refreshMenu:async()=>{log.push('menu');await refresh();},syncMenu:()=>{},
  onInstalled:value=>{log.push('installed');installed(value);},onReady:()=>{log.push('ready');ready();},onRestored:value=>restored.push(value)
 });
 return {state,old,next,candidate,library,log,messages,restored,lifecycle,modelScene,answer:value=>answer=value,onWrite:fn=>write=fn,onPrepare:fn=>prepare=fn,onInstalled:fn=>installed=fn,onReady:fn=>ready=fn,onRefresh:fn=>refresh=fn,setLast:value=>last=value};
}

test('新模型准备与整笔保存完成前旧场景/编排不动，之后才提交与释放',async()=>{
 const f=fixture();f.onWrite(()=>{assert.equal(f.state.root,f.old);assert.equal(f.state.items.length,1);assert.equal(f.log.includes('release-old'),false);});
 assert.equal(await f.lifecycle.importModel(['new.glb']),true);
 assert.ok(f.log.indexOf('save')<f.log.indexOf('release-old'));assert.ok(f.log.indexOf('release-old')<f.log.indexOf('attach'));
 assert.equal(f.state.root,f.next);assert.deepEqual(f.state.items,[]);assert.equal(f.state.selection.size,0);assert.equal(f.state.playing,false);assert.equal(f.state.busy,false);
 assert.equal(f.state.modelKey,'new-key');assert.deepEqual(f.state.modelFiles,['new.glb']);assert.equal(f.state.poses[0].id,'builtin:stand');
});

test('准备失败或写盘失败保留旧根/编排；候选只在交回生命周期后由其清理',async()=>{
 const f=fixture();f.onPrepare(()=>{throw new Error('准备失败');});
 assert.equal(await f.lifecycle.importModel(['bad']),false);assert.equal(f.state.root,f.old);assert.equal(f.log.includes('release-candidate'),false);
 const g=fixture();g.onWrite(()=>{throw new Error('目录写入失败');});
 assert.equal(await g.lifecycle.importModel(['new']),false);assert.equal(g.state.root,g.old);assert.equal(g.state.items.length,1);assert.equal(g.state.busy,false);
 assert.equal(g.log.filter(value=>value==='release-candidate').length,1);assert.equal(g.log.includes('release-old'),false);assert.match(g.messages.at(-1).text,/原模型保留/);
});

test('发布后的展示失败清理未完成场景，不伪称已回滚',async()=>{
 const f=fixture();f.onInstalled(()=>{throw new Error('展示失败');});assert.equal(await f.lifecycle.importModel(['new']),false);
 assert.equal(f.state.root,null);assert.equal(f.log.includes('release-candidate'),false);assert.equal(f.state.busy,false);
 assert.match(f.messages.at(-1).text,/新模型已提交，初始化未完成/);
});

for(const stage of ['releaseCurrent','createSampler','attach','onInstalled','onReady'])test(`真实工作台在${stage}失败后不可操作，释放资源且允许重新加载`,async()=>{
 const f=fixture(),scene=new THREE.Scene(),grid=new THREE.GridHelper();
 f.candidate.box=new THREE.Box3(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,2,1));f.candidate.size=2;
 const adapter=createModelScene({state:f.state,scene,grid,isSkeletonVisible:()=>false});
 let oldDisposed=0,newDisposed=0;
 f.state.sampler={dispose(){oldDisposed++;if(stage==='releaseCurrent')throw new Error(stage);}};
 f.state.helper=new THREE.SkeletonHelper(f.old);scene.add(f.old,f.state.helper);
 Object.assign(f.modelScene,adapter);
 const create=adapter.createSampler;
 f.modelScene.createSampler=root=>{if(stage==='createSampler')throw new Error(stage);const sampler=create(root),dispose=sampler.dispose.bind(sampler);sampler.dispose=()=>{newDisposed++;dispose();};return sampler;};
 if(stage==='attach')f.modelScene.attach=()=>{adapter.attach(f.candidate);throw new Error(stage);};
 if(stage==='onInstalled')f.onInstalled(()=>{throw new Error(stage);});
 if(stage==='onReady')f.onReady(()=>{throw new Error(stage);});
 const w=createWorkbenchOperations(f.state);w.inspect();
 assert.equal(await f.lifecycle.importModel(['new']),false);
 assert.equal(w.inspect().status,'loading');assert.equal(f.state.root,null);assert.equal(f.state.sampler,null);
 assert.equal(f.state.playing,false);assert.equal(f.state.busy,false);assert.equal(oldDisposed,1);
 assert.equal(newDisposed,['releaseCurrent','createSampler'].includes(stage)?0:1);assert.equal(scene.children.length,0);
 assert.throws(()=>w.source(0),{code:'NOT_READY'});assert.match(f.messages.at(-1).text,/新模型已提交，初始化未完成/);
 Object.assign(f.modelScene,adapter);f.onInstalled(()=>{});f.onReady(()=>{});
 assert.equal(await f.lifecycle.importModel(['new']),true);assert.equal(w.inspect().status,'ready');
 adapter.releaseCurrent();grid.geometry.dispose();grid.material.dispose();
});

test('写盘成功后的菜单失败仍释放未发布候选，但不冒充已回滚磁盘提交',async()=>{
 const f=fixture();f.onRefresh(()=>{throw new Error('菜单失败');});assert.equal(await f.lifecycle.importModel(['new']),false);
 assert.ok(f.log.indexOf('save')<f.log.indexOf('menu'));assert.equal(f.state.root,f.old);assert.equal(f.log.includes('release-old'),false);
 assert.equal(f.log.filter(value=>value==='release-candidate').length,1);assert.equal(f.state.busy,false);
 assert.match(f.messages.at(-1).text,/新模型已保存，原场景保留/);
});

test('恢复初始化失败不继续报告素材恢复成功，清理错误显式保留',async()=>{
 const f=fixture();f.onInstalled(()=>{throw new Error('初始化失败');});
 f.modelScene.releaseCurrent=()=>{if(f.state.root===f.next)throw new Error('清理失败');};
 await f.lifecycle.restore();assert.equal(f.restored.length,0);assert.equal(f.state.root,null);assert.equal(f.state.sampler,null);
 assert.match(f.messages.at(-1).text,/初始化失败.*资源清理失败：清理失败/);
});

test('草稿取消切换不丢草稿；同意后仍走原discard及未保存编排确认',async()=>{
 const f=fixture(),draft={origin:'user'};f.state.poseDraft=draft;f.answer(false);
 assert.equal(await f.lifecycle.allowSwitch(),false);assert.equal(f.state.poseDraft,draft);assert.equal(f.log.includes('discard'),false);
 f.answer(true);assert.equal(await f.lifecycle.allowSwitch(),true);assert.equal(f.state.poseDraft,null);assert.equal(f.log.filter(value=>value==='confirm').length,3);
});

test('选择当前模型不重载，外部模型从已保存文件读取，忙碌拒绝重复加载',async()=>{
 const f=fixture();await f.lifecycle.select('old-key');assert.equal(f.log.length,0);
 f.state.busy=true;assert.equal(await f.lifecycle.importModel(['new']),false);assert.equal(f.log.length,0);f.state.busy=false;
 await f.lifecycle.select('external');assert.ok(f.log.includes('saved:external'));assert.deepEqual(f.state.modelFiles,['cached.glb']);
});

test('无恢复指针加载既有Mesh2Motion默认入口，有指针恢复保存模型及素材上下文',async()=>{
 const f=fixture();f.state.items=[];f.setLast(null);await f.lifecycle.restore();assert.ok(f.log.includes('fetch:mesh2motion'));assert.deepEqual(f.state.modelFiles,['default.glb']);
 const g=fixture();await g.lifecycle.restore();assert.deepEqual(g.state.modelFiles,['saved.glb']);assert.equal(g.restored[0].library,'custom');
});

test('恢复损坏显式报告不换默认模型，目录快照不携带场景或素材',async()=>{
 const f=fixture();f.onPrepare(()=>{throw new Error('素材损坏');});await f.lifecycle.restore();assert.equal(f.state.root,f.old);assert.equal(f.log.some(value=>value.startsWith('fetch:')),false);
 assert.match(f.messages.find(value=>value.error).text,/素材损坏/);
 assert.deepEqual(f.lifecycle.menuState(),{modelKey:'old-key',builtinId:undefined,hasRoot:true});
});
