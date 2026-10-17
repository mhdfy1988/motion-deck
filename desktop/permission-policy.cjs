const APP_DOCUMENT='motiondeck://app/labs/motion/index.html';

// 锁鼠不是设备访问：只允许自有、可见且聚焦的主页面，其他权限保持默认拒绝。
function allowPointerLock({window,contents,permission,details,requestingOrigin,phase}){
 if(permission!=='pointerLock'||!window||window.isDestroyed()||!contents||contents.isDestroyed()||contents!==window.webContents)return false;
 if(!window.isVisible()||window.isMinimized()||!window.isFocused()||!contents.isFocused()||contents.getURL()!==APP_DOCUMENT)return false;
 if(details?.isMainFrame!==true||details.requestingUrl!==APP_DOCUMENT)return false;
 if(phase==='request')return true;
 if(phase!=='check'||typeof requestingOrigin!=='string')return false;
 return requestingOrigin==='motiondeck://app'||requestingOrigin==='motiondeck://app/';
}
module.exports={allowPointerLock};
