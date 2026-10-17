// 仅转交原更新控制器；安装前检查与更新生命周期仍由主进程装配。
function bindUpdateIPC({ register, getUpdates, shell }) {
  register('motiondeck:update', async (method, confirmed) => {
    const controller = getUpdates().controller;
    if (method === 'state') return controller.get();
    if (method === 'check') return controller.check();
    if (method === 'download') return controller.download();
    if (method === 'cancel') return controller.cancel();
    if (method === 'install') return controller.apply(confirmed);
    if (method === 'releases') {
      await shell.openExternal('https://github.com/mhdfy1988/motion-deck/releases');
      return true;
    }
    throw new Error('不支持的更新操作');
  });
}
module.exports = { bindUpdateIPC };
