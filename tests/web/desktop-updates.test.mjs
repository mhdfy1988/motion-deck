import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const {UpdateController}=createRequire(import.meta.url)('../../desktop/updates/controller.cjs');
function fixture(){
 const updater=new EventEmitter();let prepared=0,installed=0;
 updater.checkForUpdates=async()=>{updater.emit('checking-for-update');updater.emit('update-available',{version:'0.2.0'});};
 updater.downloadUpdate=async()=>{updater.emit('download-progress',{percent:43,transferred:43,total:100});updater.emit('update-downloaded',{version:'0.2.0'});};
 const control=new UpdateController({updater,version:'0.1.0',enabled:true,makeToken:()=>({cancelled:false,cancel(){this.cancelled=true;}}),prepareInstall:async()=>{prepared++;},install:()=>{installed++;}});
 return {updater,control,counts:()=>({prepared,installed})};
}
test('更新必须显式下载、确认安装，禁止退出时隐式安装和降级',async()=>{
 const {updater,control,counts}=fixture();assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,false);assert.equal(updater.allowDowngrade,false);
 await control.check();assert.equal(control.get().status,'available');assert.deepEqual(counts(),{prepared:0,installed:0});
 await assert.rejects(control.apply(true),/校验/);await control.download();assert.equal(control.get().status,'downloaded');await assert.rejects(control.apply(false),/确认/);
 await control.apply(true);assert.deepEqual(counts(),{prepared:1,installed:1});
});
test('失败显式报告，下载取消后可重试，不重复启动下载',async()=>{
 const {updater,control}=fixture();await control.check();let finish,calls=0;
 updater.downloadUpdate=token=>{calls++;return new Promise((resolve,reject)=>{finish=()=>token.cancelled?reject(new Error('cancelled')):resolve();});};
 const pending=control.download();await control.download();assert.equal(calls,1);control.cancel();finish();await pending;assert.equal(control.get().status,'available');
 updater.downloadUpdate=async()=>{throw new Error('sha512 checksum mismatch');};await assert.rejects(control.download(),/sha512/);assert.equal(control.get().status,'error');await assert.rejects(control.apply(true),/校验/);
 updater.downloadUpdate=async()=>updater.emit('update-downloaded',{version:'0.2.0'});await control.download();assert.equal(control.get().status,'downloaded');
});
test('不支持的发行方式和非更高版本拒绝更新',async()=>{
 const {updater,control}=fixture();updater.checkForUpdates=async()=>updater.emit('update-available',{version:'0.0.9'});await control.check();assert.equal(control.get().status,'error');assert.equal(control.get().nextVersion,null);
 const unsupported=new UpdateController({enabled:false,version:'0.1.0',reason:'免安装版'});await assert.rejects(unsupported.check(),/免安装版/);
});
