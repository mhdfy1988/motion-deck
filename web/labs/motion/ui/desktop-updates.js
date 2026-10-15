export function bindDesktopUpdates({prompts,isBusy,onError}){
 const bridge=globalThis.motionDeckDesktop;if(!bridge)return;
 const panel=document.createElement('section');panel.id='desktopUpdateSection';panel.className='update-panel';panel.setAttribute('aria-label','软件更新');
 panel.innerHTML='<div class="update-heading"><span id="updateVersion"></span><div class="update-actions"><button id="checkDesktopUpdate">检查更新</button><button id="downloadDesktopUpdate" hidden>下载更新</button><button id="cancelDesktopUpdate" hidden>取消下载</button><button id="installDesktopUpdate" class="primary" hidden>重启更新</button></div></div><span id="updateStatus" class="update-announcement" role="status"></span><div class="update-download" hidden><progress id="updateProgress" max="100" value="0"></progress><span id="updatePercent"></span></div>';
 document.querySelector('#desktopSettingsDialog .settings-update').append(panel);
 const $=id=>panel.querySelector('#'+id);
 function render(value){$('updateVersion').textContent='当前版本 '+value.currentVersion;
  const labels={idle:'尚未检查',checking:'正在检查更新…',current:'已是最新版本',available:'发现新版本',downloading:'正在下载 '+Math.round(value.percent)+'%',downloaded:'下载与校验完成',installing:'正在关闭资料并安装更新…',error:'更新失败：'+value.error,unsupported:value.reason};$('updateStatus').textContent=labels[value.status]??'更新状态未知';
  const downloading=value.status==='downloading',busy=downloading||['checking','installing'].includes(value.status);
  const canDownload=['available','error'].includes(value.status)&&!!value.nextVersion,install=['downloaded','installing'].includes(value.status);$('checkDesktopUpdate').hidden=canDownload||downloading||install;$('checkDesktopUpdate').disabled=busy||value.status==='unsupported';$('checkDesktopUpdate').textContent=value.status==='checking'?'检查中…':value.status==='current'?'已是最新':value.status==='error'?'检查失败，重试':'检查更新';$('checkDesktopUpdate').title=value.status==='unsupported'?value.reason??'':value.status==='error'?value.error??'':'';
  $('downloadDesktopUpdate').hidden=!canDownload;$('downloadDesktopUpdate').textContent=value.status==='error'?'重试下载':'下载更新';$('downloadDesktopUpdate').title=value.status==='error'?value.error??'':value.nextVersion??'';$('cancelDesktopUpdate').hidden=!downloading;$('installDesktopUpdate').hidden=!install;$('installDesktopUpdate').disabled=value.status==='installing';$('installDesktopUpdate').textContent=value.status==='installing'?'更新中…':'重启更新';panel.querySelector('.update-download').hidden=!downloading;$('updateProgress').value=value.percent;$('updatePercent').textContent=Math.round(value.percent??0)+'%';
  panel.dataset.available=String(['available','downloaded'].includes(value.status));
 }
 // 更新状态留在设置内，不另外弹窗或污染主场景状态。
 async function run(operation){try{render(await operation());}catch(error){try{render(await bridge.updateState());}catch{$('updateStatus').textContent='无法读取更新状态，请重试';const button=$('checkDesktopUpdate');button.hidden=false;button.disabled=false;button.textContent='检查失败，重试';button.title='无法读取更新状态';}}}
 const unsubscribe=bridge.onUpdate(render);window.addEventListener('pagehide',unsubscribe,{once:true});
 $('checkDesktopUpdate').onclick=()=>run(()=>bridge.checkUpdate());$('downloadDesktopUpdate').onclick=()=>run(()=>bridge.downloadUpdate());$('cancelDesktopUpdate').onclick=()=>run(()=>bridge.cancelUpdate());
 $('installDesktopUpdate').onclick=async()=>{if(isBusy()){onError(new Error('当前正在录制或处理素材，请完成后再更新'));return;}if(!await prompts.ask('更新会重启客户端，未保存的编排会丢失。请先保存；已保存素材和目录设置保留。','重启更新','安装更新'))return;await run(()=>bridge.installUpdate(true));};
 bridge.updateState().then(render).catch(onError);
}
