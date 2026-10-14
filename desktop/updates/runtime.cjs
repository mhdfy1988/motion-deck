const {app}=require('electron');
const {NsisUpdater}=require('electron-updater');
const {CancellationToken}=require('builder-util-runtime');
const {existsSync,readFileSync}=require('node:fs');
const fs=require('node:fs/promises');
const path=require('node:path');
const {UpdateController}=require('./controller.cjs');
function createUpdates({paths,onChange,prepareInstall}){
 let distribution={kind:'development',variant:'public',productName:'MotionDeck'};
 if(app.isPackaged){distribution=JSON.parse(readFileSync(path.join(process.resourcesPath,'motiondeck-distribution.json'),'utf8'));if(distribution.format!=='motiondeck-distribution'||!['portable','nsis'].includes(distribution.kind)||!['public','acceptance'].includes(distribution.variant))throw new Error('分发配置无效');}
 const installed=app.isPackaged&&distribution.kind==='nsis'&&existsSync(path.join(path.dirname(process.execPath),'Uninstall '+distribution.productName+'.exe'));
 const log=(...args)=>fs.appendFile(path.join(paths.logs,'updates.log'),new Date().toISOString()+' '+args.map(value=>String(value)).join(' ')+'\n','utf8').catch(error=>console.error('更新日志失败',error));
 let updater=null;
 if(installed){
  const testFeed=process.env.MOTIONDECK_TEST_UPDATE_URL;
  if(testFeed){if(distribution.variant!=='acceptance'||!process.env.MOTIONDECK_DATA_DIR)throw new Error('正式包不允许测试更新源');const url=new URL(testFeed);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password)throw new Error('测试源只允许本机回环地址');updater=new NsisUpdater({provider:'generic',url:url.href});}else updater=new NsisUpdater(null);
  // 必须走默认Electron初始化，显式传AppAdapter会跳过官方网络执行器。缓存位置只在适配层重定向。
  Object.defineProperty(updater.app,'baseCachePath',{get:()=>paths.cache});
  updater.logger={info:log,warn:log,error:log,debug:log};updater.disableWebInstaller=true;updater.disableDifferentialDownload=true;updater.allowPrerelease=true;
  // 首版未签名。通过app-update.yml不设置publisherName，不伪装证书验证；SHA512仍由官方下载器强制校验。
 }
 const controller=new UpdateController({updater,version:app.getVersion(),enabled:installed,reason:'安装版支持自动更新；开发/免安装版请下载新版本',onChange,makeToken:()=>new CancellationToken(),prepareInstall:async()=>{if(!updater.installerPath||!existsSync(updater.installerPath))throw new Error('已下载安装包不存在，请重新下载');await prepareInstall();},install:()=>updater.quitAndInstall(true,distribution.variant!=='acceptance')});
 return {controller,start(){if(installed&&!process.argv.includes('--smoke-hidden')){const timer=setTimeout(()=>controller.check().catch(()=>{}),3000);timer.unref();}},distribution};
}
module.exports={createUpdates};
