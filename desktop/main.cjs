const {app,BrowserWindow,protocol,session,dialog,Menu,ipcMain,shell,nativeTheme}=require('electron');
const {readFile,mkdir}=require('node:fs/promises');
const {mkdirSync}=require('node:fs');
const path=require('node:path');
const {resolveResource}=require('./resource-policy.cjs');
const {createStorageClient}=require('./storage/client.cjs');
const {createUpdates}=require('./updates/runtime.bundle.cjs');

app.setName('MotionDeck');
// 工作台固定深色，原生窗口与菜单也使用同一主题，避免深色底上的黑色悬浮层。
nativeTheme.themeSource='dark';
app.setAppUserModelId('dev.motiondeck.desktop');
const dataDir=process.env.MOTIONDECK_DATA_DIR??path.join(app.getPath('appData'),'MotionDeck');
if(!path.isAbsolute(dataDir))throw new Error('MOTIONDECK_DATA_DIR必须是绝对路径');
mkdirSync(dataDir,{recursive:true});
app.setPath('userData',dataDir);
const workspace=process.env.MOTIONDECK_DATA_DIR?path.join(dataDir,'workspace'):path.join(app.getPath('documents'),'MotionDeck');
const local=process.env.MOTIONDECK_DATA_DIR?path.join(dataDir,'runtime'):path.join(process.env.LOCALAPPDATA??app.getPath('appData'),'MotionDeck');
const paths={personal:dataDir,library:path.join(workspace,'素材库'),exports:path.join(workspace,'导出'),backups:path.join(workspace,'备份'),cache:path.join(local,'cache'),logs:path.join(local,'logs')};
app.commandLine.appendSwitch('disk-cache-dir',paths.cache);
protocol.registerSchemesAsPrivileged([{scheme:'motiondeck',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);

let window,storage,updates,exportDirectory=paths.exports,quitting=false;
if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',()=>{if(window&&!process.argv.includes('--smoke-hidden')){if(window.isMinimized())window.restore();window.show();window.focus();}});
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',event=>{if(storage&&!quitting){event.preventDefault();quitting=true;storage.close().then(()=>app.quit()).catch(error=>{console.error(error);app.quit();});}});
 app.whenReady().then(async()=>{
  await mkdir(dataDir,{recursive:true});
  storage=createStorageClient();const initialInfo=await storage.call('init',paths);
  // 初始化期间主动退出时，不再创建窗口或向已经关闭的数据库发请求。
  if(quitting)return;
  const trusted=event=>{if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame.url!=='motiondeck://app/labs/motion/index.html')throw new Error('拒绝不可信的客户端请求');};
  updates=createUpdates({paths,onChange:value=>{if(window&&!window.isDestroyed())window.webContents.send('motiondeck:update-state',value);},prepareInstall:async()=>{await storage.call('info');}});
  ipcMain.handle('motiondeck:update',async(event,method,confirmed)=>{trusted(event);const controller=updates.controller;if(method==='state')return controller.get();if(method==='check')return controller.check();if(method==='download')return controller.download();if(method==='cancel')return controller.cancel();if(method==='install')return controller.apply(confirmed);if(method==='releases'){await shell.openExternal('https://github.com/mhdfy1988/motion-deck/releases');return true;}throw new Error('不支持的更新操作');});
  ipcMain.handle('motiondeck:data',async(event,method,args)=>{trusted(event);if(!['get','put','info','migrate'].includes(method))throw new Error('不支持的素材操作');return storage.call(method,args);});
  ipcMain.handle('motiondeck:settings',async(event,method,kind)=>{
   trusted(event);if(method==='info')return storage.call('info');
   if(method==='open'){if(!['personal','library','exports','backups','cache','logs'].includes(kind))throw new Error('目录类型无效');const info=await storage.call('info'),error=await shell.openPath(info[kind]);if(error)throw new Error(error);return true;}
   if(method==='choose'){if(!['library','exports','backups'].includes(kind))throw new Error('目录类型无效');const selected=await dialog.showOpenDialog(window,{title:kind==='library'?'迁移素材库到空目录':'选择目录',properties:['openDirectory','createDirectory']});if(selected.canceled)return null;const info=await storage.call(kind==='library'?'moveLibrary':'setDirectory',{kind,directory:selected.filePaths[0]});exportDirectory=info.exports;return info;}
   if(method==='backup')return storage.call('makeBackup');
   if(method==='restore'){const selected=await dialog.showOpenDialog(window,{title:'选择完整MotionDeck备份目录',properties:['openDirectory']});if(selected.canceled)return null;return storage.call('restore',{directory:selected.filePaths[0]});}
   if(method==='clearCache'){await session.defaultSession.clearCache();return true;}
   throw new Error('不支持的目录操作');
  });
  protocol.handle('motiondeck',async request=>{
   const resource=resolveResource(request,app.getAppPath());
   if(resource.status!==200)return new Response('资源请求被拒绝',{status:resource.status});
   try{const bytes=await readFile(resource.file);return new Response(request.method==='HEAD'?null:bytes,{headers:resource.headers});}
   catch(error){if(error.code==='ENOENT')return new Response('资源不存在',{status:404});console.error('资源读取失败',error);return new Response('资源读取失败',{status:500});}
  });
  // 不暴露Node/文件系统到渲染页面，也不允许新窗口、外部导航或设备权限。
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  Menu.setApplicationMenu(null);
  window=new BrowserWindow({width:1440,height:960,minWidth:1100,minHeight:680,title:'MotionDeck',titleBarStyle:'hidden',titleBarOverlay:{color:'#191b1f',symbolColor:'#ebedf2',height:51},icon:path.join(__dirname,'assets','motiondeck.ico'),backgroundColor:'#121416',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  exportDirectory=initialInfo.exports;
  session.defaultSession.on('will-download',(_event,item)=>{item.setSaveDialogOptions({defaultPath:path.join(exportDirectory,path.basename(item.getFilename()))});item.once('done',(_event,state)=>{if(state==='completed')storage.call('rememberExport',{directory:path.dirname(item.getSavePath())}).then(directory=>{exportDirectory=directory;}).catch(error=>console.error('记住导出目录失败',error));});});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(url!=='motiondeck://app/labs/motion/index.html')event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.on('closed',()=>{window=null;});
  window.once('ready-to-show',()=>{if(!process.argv.includes('--smoke-hidden'))window.show();});
  await window.loadURL('motiondeck://app/labs/motion/index.html');
  if(quitting)return;
  updates.start();
 }).catch(error=>{if(quitting){console.info('启动已取消，客户端正在退出');return;}console.error(error);dialog.showErrorBox('MotionDeck启动失败',error.message);app.quit();});
}
