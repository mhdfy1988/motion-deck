// 仅负责窗口按钮；关闭仍走主进程既有草稿/事务保护，不另造退出流程。
export function bindDesktopChrome({onError}){
 const bridge=globalThis.motionDeckDesktop;if(!bridge)return;
 const controls=document.createElement('div');controls.className='window-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','窗口控制');
 const shapes={minimize:'<path d="M3 8h10"/>',maximize:'<rect x="3.5" y="3.5" width="9" height="9"/>',restore:'<path d="M5.5 3.5h7v7M3.5 5.5h7v7h-7z"/>',close:'<path d="m4 4 8 8m0-8-8 8"/>'};
 const svg=kind=>'<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">'+shapes[kind]+'</svg>';
 function add(id,label,kind,action){const button=document.createElement('button');button.id=id;button.type='button';button.title=label;button.setAttribute('aria-label',label);button.innerHTML=svg(kind);button.onclick=()=>action().catch(onError);controls.append(button);return button;}
 add('windowMinimize','最小化','minimize',()=>bridge.minimizeWindow());
 const maximize=add('windowMaximize','最大化','maximize',()=>bridge.toggleMaximizeWindow());
 add('windowClose','关闭','close',()=>bridge.closeWindow());
 document.querySelector('.top').append(controls);
 let received=false;const render=state=>{const label=state.maximized?'还原':'最大化';maximize.title=label;maximize.setAttribute('aria-label',label);maximize.innerHTML=svg(state.maximized?'restore':'maximize');};
 const unsubscribe=bridge.onWindowState(state=>{received=true;render(state);});
 bridge.windowState().then(state=>{if(!received)render(state);}).catch(onError);
 window.addEventListener('pagehide',unsubscribe,{once:true});
}
