// 只转交固定窗口动作，关闭继续走主进程原草稿/事务保护。
function bindWindowIPC({ register, getWindow }) {
  register('motiondeck:window', (action) => {
    if (action === 'state') return { maximized: getWindow().isMaximized() };
    if (action === 'minimize') getWindow().minimize();
    else if (action === 'maximize') {
      if (getWindow().isMaximized()) getWindow().unmaximize();
      else getWindow().maximize();
    } else if (action === 'close')
      getWindow().close(); // 复用原关闭事件，保留未保存提醒和命令事务保护。
    else throw new Error('不支持的窗口操作');
    return true;
  });
}
module.exports = { bindWindowIPC };
