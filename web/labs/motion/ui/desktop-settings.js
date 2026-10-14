import {icons} from '../../../icons-data.js';

export function bindDesktopSettings({prompts,onError,isBusy}){
 const bridge=globalThis.motionDeckDesktop;if(!bridge)return;
 document.body.classList.add('desktop-client');
 const button=document.createElement('button');button.id='desktopSettings';button.type='button';button.className='icon-button';button.innerHTML=icons.settings;button.title='设置';button.setAttribute('aria-label','设置');document.querySelector('.top').append(button);
 const dialog=document.createElement('dialog');dialog.id='desktopSettingsDialog';dialog.setAttribute('aria-labelledby','desktopSettingsTitle');
 dialog.innerHTML='<div class="dialog-head"><h2 id="desktopSettingsTitle">设置</h2><button id="closeDesktopSettings" type="button" aria-label="关闭">×</button></div><div class="directory-list"></div><div class="data-actions"><button id="backupLibrary">备份素材库</button><button id="restoreLibrary">恢复备份</button><button id="clearDesktopCache">清理缓存</button></div><p id="desktopSettingsStatus" role="status"></p><div class="settings-update"></div>';
 document.body.append(dialog);let busy=false,recovery=false;
 const status=dialog.querySelector('#desktopSettingsStatus');
 function disable(value){busy=value;for(const control of dialog.querySelectorAll('button'))control.disabled=value||control.dataset.unavailable==='true';}
 async function run(operation){if(busy||isBusy())return;disable(true);try{await operation();}catch(error){status.textContent=error.message;status.classList.add('error');onError(error);}finally{disable(false);}}
 async function render(){const info=await bridge.settings(),list=dialog.querySelector('.directory-list');list.replaceChildren();recovery=!!info.recoveryRequired;dialog.querySelector('#backupLibrary').dataset.unavailable=String(recovery);if(recovery){status.textContent='素材库不可用：'+info.recoveryRequired+'。请选择完整备份恢复。';status.classList.add('error');}
  for(const [kind,label,change] of [['personal','个人数据',false],['library','素材库',true],['exports','导出',true],['backups','备份',true],['cache','缓存',false],['logs','日志',false]]){
   const row=document.createElement('div');row.className='directory-row';const name=document.createElement('strong'),value=document.createElement('span'),open=document.createElement('button');name.textContent=label;value.textContent=info[kind];value.title=info[kind];open.textContent='打开';open.setAttribute('aria-label','打开'+label+'目录');open.onclick=()=>run(()=>bridge.openDirectory(kind));row.append(name,value,open);
   if(change){const choose=document.createElement('button');choose.textContent=kind==='library'?'迁移':'更改';choose.dataset.unavailable=String(kind==='library'&&recovery);choose.setAttribute('aria-label',choose.textContent+label+'目录');choose.onclick=()=>run(async()=>{if(kind==='library'&&!await prompts.ask('将完整素材库复制到空目录，校验后切换。原目录保留，不覆盖已有文件。','选择目录','迁移素材库'))return;const result=await bridge.chooseDirectory(kind);if(result){await render();status.textContent=kind==='library'?'迁移完成，原素材库已保留':'目录已更新';}});row.append(choose);}list.append(row);
  }
 }
 button.onclick=()=>run(async()=>{status.textContent='';status.classList.remove('error');await render();dialog.showModal();});
 dialog.querySelector('#closeDesktopSettings').onclick=()=>dialog.close();dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 dialog.querySelector('#backupLibrary').onclick=()=>run(async()=>{status.textContent='正在备份…';const result=await bridge.backup();status.textContent='备份完成：'+result.directory;});
 dialog.querySelector('#restoreLibrary').onclick=()=>run(async()=>{if(!await prompts.ask(recovery?'当前库无法读取，原目录保留。从完整备份恢复后重新载入页面。':'恢复会切换到备份内容并重新载入页面，未保存编排会丢失。当前素材库将先自动备份并原样保留。','选择备份','恢复素材库'))return;status.textContent='正在校验并恢复…';const result=await bridge.restore();if(result)location.reload();else status.textContent='已取消恢复';});
 dialog.querySelector('#clearDesktopCache').onclick=()=>run(async()=>{await bridge.clearCache();status.textContent='缓存已清理，素材与设置保留';});
}
