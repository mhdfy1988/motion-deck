const {app,BrowserWindow,protocol,session,dialog,Menu,ipcMain,shell,nativeTheme}=require('electron');
const {readFile,mkdir}=require('node:fs/promises');
const {mkdirSync}=require('node:fs');
const path=require('node:path');
const {resolveResource}=require('./resource-policy.cjs');
const {createStorageClient}=require('./storage/client.cjs');
const {createUpdates}=require('./updates/runtime.bundle.cjs');
const {createControlServer}=require('./control/server.cjs');
const {shouldAutoEnableControl}=require('./control/dev-policy.cjs');
const {reply:validateControlReply}=require('./control/validators.generated.cjs');
const {randomUUID}=require('node:crypto');
const {writeCapture,writeExport,writeManifest,writeVideo}=require('./control/capture-files.cjs');
const {timeout:controlTimeout}=require('./control/operation-policy.cjs');

app.setName('MotionDeck');
// 工作台固定深色，原生窗口与菜单也使用同一主题，避免深色底上的黑色悬浮层。
nativeTheme.themeSource='dark';
app.setAppUserModelId('dev.motiondeck.desktop');
const dataDir=process.env.MOTIONDECK_DATA_DIR??path.join(app.getPath('appData'),'MotionDeck');
if(!path.isAbsolute(dataDir))throw new Error('MOTIONDECK_DATA_DIR必须是绝对路径');
mkdirSync(dataDir,{recursive:true});
app.setPath('userData',dataDir);
const autoControl=shouldAutoEnableControl({flag:process.env.MOTIONDECK_DEV_AUTO_CONTROL,dataDir:process.env.MOTIONDECK_DATA_DIR,packaged:app.isPackaged,packageName:require(path.join(app.getAppPath(),'package.json')).name});
const workspace=process.env.MOTIONDECK_DATA_DIR?path.join(dataDir,'workspace'):path.join(app.getPath('documents'),'MotionDeck');
const local=process.env.MOTIONDECK_DATA_DIR?path.join(dataDir,'runtime'):path.join(process.env.LOCALAPPDATA??app.getPath('appData'),'MotionDeck');
const paths={personal:dataDir,library:path.join(workspace,'素材库'),exports:path.join(workspace,'导出'),backups:path.join(workspace,'备份'),cache:path.join(local,'cache'),logs:path.join(local,'logs')};
app.commandLine.appendSwitch('disk-cache-dir',paths.cache);
protocol.registerSchemesAsPrivileged([{scheme:'motiondeck',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);

let window,storage,updates,control,rendererControlReady=false,exportDirectory=paths.exports,quitting=false,draftDirty=false;
const controlPending=new Map();
function cancelControlQueries(){rendererControlReady=false;for(const pending of controlPending.values()){clearTimeout(pending.timer);pending.reject(Object.assign(new Error('客户端会话已关闭'),{code:'SESSION_CLOSED'}));}controlPending.clear();}
if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',()=>{if(window&&!process.argv.includes('--smoke-hidden')){if(window.isMinimized())window.restore();window.show();window.focus();}});
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',event=>{if(storage&&!quitting){event.preventDefault();if(control?.hasPendingWrites())return;if(draftDirty&&dialog.showMessageBoxSync(window,{type:'warning',message:'助手姿势尚未保存，放弃并退出？',buttons:['取消','放弃并退出'],defaultId:0,cancelId:0})!==1)return;quitting=true;draftDirty=false;cancelControlQueries();Promise.resolve(control?.close()).then(()=>storage.close()).then(()=>app.quit()).catch(error=>{console.error('客户端收尾失败',error.code??'ERROR');app.quit();});}});
 app.whenReady().then(async()=>{
  await mkdir(dataDir,{recursive:true});
  storage=createStorageClient();const initialInfo=await storage.call('init',paths);
  // 初始化期间主动退出时，不再创建窗口或向已经关闭的数据库发请求。
  if(quitting)return;
  const trusted=event=>{if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame.url!=='motiondeck://app/labs/motion/index.html')throw new Error('拒绝不可信的客户端请求');};
  control=createControlServer({personal:dataDir,dispatch:async query=>{
   const contents=window?.webContents,video=query.operation==='export.video'&&contents&&!contents.isDestroyed(),throttling=video?contents.getBackgroundThrottling():null;
   if(video)contents.setBackgroundThrottling(false);
   try{return await new Promise((resolve,reject)=>{
   if(!rendererControlReady||!window||window.isDestroyed())return reject(Object.assign(new Error('客户端查询尚未就绪'),{code:'NOT_READY'}));
   const bridgeId=randomUUID(),timer=setTimeout(()=>{controlPending.delete(bridgeId);reject(Object.assign(new Error('客户端操作超时，请查询请求状态'),{code:'RESULT_UNKNOWN'}));},controlTimeout(query.operation)-1000);
   controlPending.set(bridgeId,{resolve,reject,timer,requestId:query.requestId,sessionId:query.sessionId,operation:query.operation});window.webContents.send('motiondeck:control-query',{bridgeId,query});
   });}finally{if(video&&!contents.isDestroyed())contents.setBackgroundThrottling(throttling);}
  }});
  ipcMain.handle('motiondeck:control',async(event,method,value)=>{trusted(event);if(method==='state')return control.state();if(method==='ready'){rendererControlReady=true;if(autoControl){await control.setEnabled(true);control.setWriteEnabled(true);control.setTimelineEnabled(true);}return true;}if(method==='draft'){if(typeof value!=='boolean')throw new Error('草稿状态无效');draftDirty=value;return true;}if(method==='write'||method==='timeline'){if(quitting||!rendererControlReady)throw new Error('工作台未就绪');return method==='write'?control.setWriteEnabled(value):control.setTimelineEnabled(value);}if(method==='enable'){if(quitting||!rendererControlReady||control.hasPendingWrites())throw new Error('工作台正在执行操作');return control.setEnabled(value);}throw new Error('不支持的命令控制操作');});
  ipcMain.handle('motiondeck:control-capture',async(event,value)=>{trusted(event);if(![...controlPending.values()].some(p=>['view.capture','view.captureSequence'].includes(p.operation))||!(control.state().access==='pose-write'||control.state().timelineWrite))throw new Error('没有已授权截图请求');return writeCapture(exportDirectory,value);});
  ipcMain.handle('motiondeck:control-manifest',async(event,value)=>{trusted(event);if(![...controlPending.values()].some(p=>p.operation==='view.captureSequence')||!(control.state().access==='pose-write'||control.state().timelineWrite))throw new Error('没有已授权截图索引请求');return writeManifest(exportDirectory,value);});
  ipcMain.handle('motiondeck:control-video',async(event,value)=>{trusted(event);if(![...controlPending.values()].some(p=>p.operation==='export.video')||!control.state().timelineWrite)throw new Error('没有已授权视频请求');return writeVideo(exportDirectory,value);});
  ipcMain.handle('motiondeck:control-export',async(event,value)=>{trusted(event);if(![...controlPending.values()].some(p=>p.operation==='export.glb')||!control.state().timelineWrite)throw new Error('没有已授权动作导出请求');return writeExport(exportDirectory,value);});
  ipcMain.handle('motiondeck:control-reply',(event,value)=>{trusted(event);const pending=controlPending.get(value?.bridgeId);if(!pending)return false;if(!validateControlReply(value.reply)||value.reply.requestId!==pending.requestId||value.reply.sessionId!==pending.sessionId)throw new Error('查询响应不匹配');clearTimeout(pending.timer);controlPending.delete(value.bridgeId);pending.resolve(value.reply);return true;});
  updates=createUpdates({paths,onChange:value=>{if(window&&!window.isDestroyed())window.webContents.send('motiondeck:update-state',value);},prepareInstall:async()=>{if(draftDirty||control.hasPendingWrites())throw new Error('请先保存或放弃助手姿势，再重启更新');await storage.call('info');}});
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
  window.on('close',event=>{if(quitting)return;if(control.hasPendingWrites()){event.preventDefault();return;}if(draftDirty){event.preventDefault();if(dialog.showMessageBoxSync(window,{type:'warning',message:'助手姿势尚未保存，放弃并关闭？',buttons:['取消','放弃并关闭'],defaultId:0,cancelId:0})===1){draftDirty=false;window.destroy();}}});
  window.webContents.on('will-prevent-unload',event=>{if(control.hasPendingWrites())return;if(dialog.showMessageBoxSync(window,{type:'warning',message:'助手姿势尚未保存，放弃并重新载入？',buttons:['取消','放弃'],defaultId:0,cancelId:0})===1){draftDirty=false;event.preventDefault();}});
  window.webContents.on('did-start-navigation',(_event,_url,_inPlace,isMainFrame)=>{if(isMainFrame){cancelControlQueries();void control.close().catch(error=>console.error('关闭命令控制失败',error.code??'ERROR'));}});
  window.webContents.on('render-process-gone',()=>{cancelControlQueries();void control.close().catch(error=>console.error('关闭命令控制失败',error.code??'ERROR'));});
  window.on('closed',()=>{window=null;});
  window.once('ready-to-show',()=>{if(!process.argv.includes('--smoke-hidden'))window.show();});
  await window.loadURL('motiondeck://app/labs/motion/index.html');
  if(quitting)return;
  updates.start();
 }).catch(error=>{if(quitting){console.info('启动已取消，客户端正在退出');return;}console.error(error);dialog.showErrorBox('MotionDeck启动失败',error.message);app.quit();});
}
