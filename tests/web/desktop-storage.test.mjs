import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {encodeRecord,decodeRecord} from '../../web/labs/motion/platform/desktop-store.js';
import {getImage} from '../../web/labs/motion/platform/indexeddb-store.js';
const require=createRequire(import.meta.url),{DataService}=require('../../desktop/storage/service.cjs'),{Library}=require('../../desktop/storage/library.cjs');
async function fixture(){await mkdir(resolve('output/storage-tests'),{recursive:true});const root=await mkdtemp(resolve('output/storage-tests/case-'));const service=new DataService(),paths=Object.fromEntries(['personal','library','exports','backups','cache','logs'].map(key=>[key,join(root,key)]));await service.init(paths);return {service,root,paths};}
test('桌面文件编解码保持多个原文件名称、字节与时间，跨文件槽位不串',async()=>{
 const input={id:'model',files:[new File(['one'],'a.glb',{lastModified:123}),new File(['two'],'b.bin',{lastModified:456})],blob:new Blob(['three'],{type:'image/png'}),data:{value:1}};
 const output=decodeRecord(await encodeRecord(input));assert.equal(await output.files[0].text(),'one');assert.equal(await output.files[1].text(),'two');assert.equal(output.files[1].lastModified,456);assert.equal(await output.blob.text(),'three');assert.deepEqual(output.data,{value:1});
});
test('磁盘事务、重启恢复、空目录搬迁、备份恢复与损坏拒绝，不删原素材',async()=>{
 const {service,root,paths}=await fixture();try{
  const records=await Promise.all([{id:'model',files:[new File(['model-bytes'],'角色.glb')],data:{actions:['跑步']}},{id:'pointer',modelKey:'model'}].map(encodeRecord));
  await service.put({records});await assert.rejects(service.put({records:[{id:'bad',json:'{}',files:[]}],deleteIds:['model']}));assert.equal(decodeRecord(await service.get('model')).files[0].name,'角色.glb');
  await assert.rejects(service.moveLibrary({directory:join(paths.library,'nested')}),/重叠/);await assert.rejects(service.setDirectory({kind:'exports',directory:paths.personal}),/重叠/);
  await assert.rejects(service.put({records:[{id:'dangling',json:JSON.stringify({id:'dangling',file:{__motiondeckFile:99}}),files:[]}]}),/引用无效/);
  await service.setDirectory({kind:'exports',directory:join(root,'自选导出')});const before=await service.makeBackup();
  await service.moveLibrary({directory:join(root,'搬迁库')});assert.equal(await decodeRecord(await service.get('model')).files[0].text(),'model-bytes');assert.ok((await readdir(paths.library)).includes('library.sqlite'));
  await service.put({records:[],deleteIds:['model']});assert.equal(await service.get('model'),null);await service.restore(before);assert.ok(await service.get('model'));
  const active=service.info().library;await service.close();await service.init(paths);assert.equal(service.info().library,active);assert.equal(service.info().exports,join(root,'自选导出'));
  const object=(await readdir(join(active,'objects')))[0];await writeFile(join(active,'objects',object),'damaged');await assert.rejects(service.get('model'),/校验失败/);
 }finally{await service.close();}
});
test('旧库迁移完整备份后切换，只执行一次，失败不覆盖当前库；跨实例锁拒绝',async()=>{
 const {service,paths}=await fixture();try{
  const oldRoot=service.info().library;await assert.rejects(service.migrate({records:[{id:'bad',json:'{}',files:[]}]}));assert.equal(service.info().library,oldRoot);assert.equal(service.info().migrationNeeded,true);
  const migrated=await service.migrate({records:[await encodeRecord({id:'old',files:[new File(['original'],'原模型.glb')]})]});assert.equal(migrated.records,1);assert.equal(service.info().migrationNeeded,false);assert.equal((await service.migrate({records:[]})).already,true);
  assert.ok(await readFile(join(migrated.backup,'library.sqlite')));await assert.rejects(Library.open(service.info().library),/lock|locked/i);
  assert.ok((await readdir(paths.library)).includes('library.sqlite'));assert.ok(await service.get('old'));
 }finally{await service.close();}
});
test('桌面桥缺失显式停止，不悄悄切回IndexedDB',async()=>{const old=globalThis.location;globalThis.location={protocol:'motiondeck:'};try{await assert.rejects(getImage('test'),/禁止回落旧数据库/);}finally{old===undefined?delete globalThis.location:globalThis.location=old;}});
test('实际另存为目录持久化，更改导出目录重设默认位置',async()=>{
 const {service,paths,root}=await fixture();try{const saved=join(root,'实际另存为');await service.rememberExport({directory:saved});await service.close();await service.init(paths);assert.equal(service.info().exports,saved);const configured=join(root,'重新设置');await service.setDirectory({kind:'exports',directory:configured});assert.equal(service.info().exports,configured);}finally{await service.close();}
});
test('索引丢失时拒绝读写而保留恢复入口，不创建空库掩盖丢失',async()=>{const {service,paths}=await fixture();try{await service.migrate({records:[]});await service.put({records:[await encodeRecord({id:'saved',data:{value:1}})]});const backup=await service.makeBackup();await service.close();await rename(join(paths.library,'library.sqlite'),join(paths.library,'library.sqlite.retained'));const info=await service.init(paths);assert.match(info.recoveryRequired,/不新建空库/);assert.equal(info.records,null);await assert.rejects(service.get('saved'),/素材库不可用/);await service.restore(backup);assert.equal(service.info().recoveryRequired,null);assert.equal(decodeRecord(await service.get('saved')).data.value,1);assert.ok(await readFile(join(paths.library,'library.sqlite.retained')));}finally{await service.close();}});
