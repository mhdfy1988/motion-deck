// 素材与目录设置只调用原存储服务；导出目录写回主进程唯一状态。
function bindDataSettingsIPC({
  register,
  getStorage,
  getWindow,
  setExportDirectory,
  dialog,
  shell,
  session,
}) {
  register('motiondeck:data', async (method, args) => {
    if (!['get', 'put', 'info', 'migrate'].includes(method)) throw new Error('不支持的素材操作');
    return getStorage().call(method, args);
  });
  register('motiondeck:settings', async (method, kind) => {
    if (method === 'info') return getStorage().call('info');
    if (method === 'open') {
      if (!['personal', 'library', 'exports', 'backups', 'cache', 'logs'].includes(kind))
        throw new Error('目录类型无效');
      const info = await getStorage().call('info'),
        error = await shell.openPath(info[kind]);
      if (error) throw new Error(error);
      return true;
    }
    if (method === 'choose') {
      if (!['library', 'exports', 'backups'].includes(kind)) throw new Error('目录类型无效');
      const selected = await dialog.showOpenDialog(getWindow(), {
        title: kind === 'library' ? '迁移素材库到空目录' : '选择目录',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (selected.canceled) return null;
      const info = await getStorage().call(kind === 'library' ? 'moveLibrary' : 'setDirectory', {
        kind,
        directory: selected.filePaths[0],
      });
      setExportDirectory(info.exports);
      return info;
    }
    if (method === 'backup') return getStorage().call('makeBackup');
    if (method === 'restore') {
      const selected = await dialog.showOpenDialog(getWindow(), {
        title: '选择完整MotionDeck备份目录',
        properties: ['openDirectory'],
      });
      if (selected.canceled) return null;
      return getStorage().call('restore', { directory: selected.filePaths[0] });
    }
    if (method === 'clearCache') {
      await session.defaultSession.clearCache();
      return true;
    }
    throw new Error('不支持的目录操作');
  });
}
module.exports = { bindDataSettingsIPC };
