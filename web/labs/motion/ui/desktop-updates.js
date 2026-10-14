export function bindDesktopUpdates({prompts,isBusy,onError}){
 const bridge=globalThis.motionDeckDesktop;if(!bridge)return;
 const button=document.createElement('button');button.id='desktopUpdates';button.textContent='更新';button.title='检查更新';document.querySelector('.top').append(button);
 const dialog=document.createElement('dialog');dialog.id='desktopUpdateDialog';dialog.setAttribute('aria-labelledby','desktopUpdateTitle');
 dialog.innerHTML='<div class="dialog-head"><h2 id="desktopUpdateTitle">软件更新</h2><button id="closeDesktopUpdate" aria-label="关闭更新" type="button">×</button></div><p id="updateVersion"></p><p id="updateStatus" role="status"></p><progress id="updateProgress" max="100" value="0" hidden></progress><p class="update-security">未签名测试版 · 下载有完整性校验，无证书身份验证</p><div class="dialog-actions"><button id="updateReleasePage">下载页面</button><button id="checkDesktopUpdate">检查更新</button><button id="downloadDesktopUpdate" hidden>下载更新</button><button id="cancelDesktopUpdate" hidden>取消下载</button><button id="installDesktopUpdate" class="primary" hidden>重启更新</button></div>';
 document.body.append(dialog);
 const $=id=>dialog.querySelector('#'+id);
 function render(value){$('updateVersion').textContent='当前版本 '+value.currentVersion+(value.nextVersion?' → '+value.nextVersion:'');
  const labels={idle:'尚未检查',checking:'正在检查更新…',current:'已是最新版本',available:'发现新版本',downloading:'正在下载 '+Math.round(value.percent)+'%',downloaded:'下载与校验完成',installing:'正在关闭资料并安装更新…',error:'更新失败：'+value.error,unsupported:value.reason};$('updateStatus').textContent=labels[value.status]??'更新状态未知';
  const downloading=value.status==='downloading',busy=downloading||['checking','installing'].includes(value.status);
  $('checkDesktopUpdate').disabled=busy||value.status==='unsupported'||value.status==='downloaded';$('downloadDesktopUpdate').hidden=!(['available','error'].includes(value.status)&&value.nextVersion);$('downloadDesktopUpdate').textContent=value.status==='error'?'重试下载':'下载更新';$('cancelDesktopUpdate').hidden=!downloading;$('installDesktopUpdate').hidden=value.status!=='downloaded';$('updateProgress').hidden=!downloading;$('updateProgress').value=value.percent;
  button.dataset.available=String(['available','downloaded'].includes(value.status));
 }
 // 更新错误已在本弹窗展示，不重复污染主场景状态和长错误浮层。
 async function run(operation){try{render(await operation());}catch(error){try{render(await bridge.updateState());}catch{$('updateStatus').textContent='无法读取更新状态，请重启客户端后重试';}}}
 const unsubscribe=bridge.onUpdate(render);window.addEventListener('pagehide',unsubscribe,{once:true});
 button.onclick=async()=>{await run(()=>bridge.updateState());dialog.showModal();};$('closeDesktopUpdate').onclick=()=>dialog.close();$('checkDesktopUpdate').onclick=()=>run(()=>bridge.checkUpdate());$('downloadDesktopUpdate').onclick=()=>run(()=>bridge.downloadUpdate());$('cancelDesktopUpdate').onclick=()=>run(()=>bridge.cancelUpdate());$('updateReleasePage').onclick=()=>run(async()=>{await bridge.openReleases();return bridge.updateState();});
 $('installDesktopUpdate').onclick=async()=>{if(isBusy()){onError(new Error('当前正在录制或处理素材，请完成后再更新'));return;}if(!await prompts.ask('更新会重启客户端，未保存的编排会丢失。请先保存；已保存素材和目录设置保留。','重启更新','安装更新'))return;await run(()=>bridge.installUpdate(true));};
 bridge.updateState().then(render).catch(onError);
}
