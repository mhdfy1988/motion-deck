const {contextBridge,ipcRenderer}=require('electron');
// 只暴露固定业务操作，绝不暴露ipcRenderer、Node或任意文件路径读写。
contextBridge.exposeInMainWorld('motionDeckDesktop',Object.freeze({
 getRecord:id=>ipcRenderer.invoke('motiondeck:data','get',id),
 putRecords:payload=>ipcRenderer.invoke('motiondeck:data','put',payload),
 migrationInfo:()=>ipcRenderer.invoke('motiondeck:data','info'),
 migrateRecords:records=>ipcRenderer.invoke('motiondeck:data','migrate',{records}),
 settings:()=>ipcRenderer.invoke('motiondeck:settings','info'),
 chooseDirectory:kind=>ipcRenderer.invoke('motiondeck:settings','choose',kind),
 openDirectory:kind=>ipcRenderer.invoke('motiondeck:settings','open',kind),
 backup:()=>ipcRenderer.invoke('motiondeck:settings','backup'),
 restore:()=>ipcRenderer.invoke('motiondeck:settings','restore'),
 clearCache:()=>ipcRenderer.invoke('motiondeck:settings','clearCache'),
 updateState:()=>ipcRenderer.invoke('motiondeck:update','state'),
 checkUpdate:()=>ipcRenderer.invoke('motiondeck:update','check'),
 downloadUpdate:()=>ipcRenderer.invoke('motiondeck:update','download'),
 cancelUpdate:()=>ipcRenderer.invoke('motiondeck:update','cancel'),
 installUpdate:confirmed=>ipcRenderer.invoke('motiondeck:update','install',confirmed),
 openReleases:()=>ipcRenderer.invoke('motiondeck:update','releases'),
 onUpdate:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('motiondeck:update-state',listener);return ()=>ipcRenderer.removeListener('motiondeck:update-state',listener);}
}));
