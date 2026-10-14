const {valid,gt}=require('semver');
class UpdateController{
 constructor({updater,version,enabled,reason,onChange=()=>{},makeToken,prepareInstall,install}){
  this.updater=updater;this.enabled=enabled;this.reason=reason;this.onChange=onChange;this.makeToken=makeToken;this.prepareInstall=prepareInstall;this.install=install;this.active=null;this.token=null;
  this.state={status:enabled?'idle':'unsupported',currentVersion:version,nextVersion:null,percent:0,transferred:0,total:0,error:null,reason:enabled?null:reason};
  if(!enabled)return;
  updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowDowngrade=false;
  updater.on('checking-for-update',()=>this.set({status:'checking',error:null}));
  updater.on('update-available',info=>{if(!valid(info.version)||!gt(info.version,version)){this.fail(new Error('更新版本无效或不高于当前版本'));return;}this.set({status:'available',nextVersion:info.version,error:null});});
  updater.on('update-not-available',()=>this.set({status:'current',nextVersion:null,error:null}));
  updater.on('download-progress',progress=>this.set({status:'downloading',percent:Math.max(0,Math.min(100,progress.percent)),transferred:progress.transferred,total:progress.total}));
  updater.on('update-downloaded',info=>this.set({status:'downloaded',nextVersion:info.version,percent:100,error:null}));
  updater.on('error',error=>this.fail(error));
  updater.on('update-cancelled',()=>this.set({status:'available',percent:0,error:null}));
 }
 get(){return {...this.state};}
 set(change){Object.assign(this.state,change);this.onChange(this.get());}
 fail(error){const detail=String(error?.message??error);const message=/checksum|sha512/i.test(detail)?'文件校验失败，请重新下载':/503|ECONN|ENOTFOUND|ERR_INTERNET|ERR_NAME|timed? ?out|HTTP/i.test(detail)?'暂时无法连接更新源，请稍后重试':detail.slice(0,300);this.set({status:'error',error:message});}
 assertEnabled(){if(!this.enabled)throw new Error(this.reason);}
 async check(){this.assertEnabled();if(this.active)return this.get();if(this.state.status==='downloaded')return this.get();this.active='check';try{await this.updater.checkForUpdates();return this.get();}catch(error){this.fail(error);throw error;}finally{this.active=null;}}
 async download(){this.assertEnabled();if(this.active)return this.get();if(!['available','error'].includes(this.state.status)||!this.state.nextVersion)throw new Error('请先检查更新');this.active='download';this.token=this.makeToken();this.set({status:'downloading',percent:0,error:null});try{await this.updater.downloadUpdate(this.token);return this.get();}catch(error){if(this.token.cancelled){this.set({status:'available',percent:0,error:null});return this.get();}this.fail(error);throw error;}finally{this.token=null;this.active=null;}}
 cancel(){if(this.active==='download')this.token?.cancel();return this.get();}
 async apply(confirmed){this.assertEnabled();if(confirmed!==true)throw new Error('重启更新需要明确确认');if(this.active||this.state.status!=='downloaded')throw new Error('更新尚未完成校验');this.active='install';this.set({status:'installing'});try{await this.prepareInstall();this.install();return this.get();}catch(error){this.fail(error);throw error;}finally{this.active=null;}}
}
module.exports={UpdateController};
