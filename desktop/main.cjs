const { createTrustedRegistrar } = require('./ipc/register.cjs');
const { bindWindowIPC } = require('./ipc/window.cjs');
const { createControlBridge } = require('./ipc/control.cjs');
const { bindUpdateIPC } = require('./ipc/updates.cjs');
const { bindDataSettingsIPC } = require('./ipc/settings.cjs');
const {
  app,
  BrowserWindow,
  protocol,
  session,
  dialog,
  Menu,
  ipcMain,
  shell,
  nativeTheme,
} = require('electron');
const { readFile, mkdir } = require('node:fs/promises');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { resolveResource } = require('./resource-policy.cjs');
const { allowPointerLock } = require('./permission-policy.cjs');
const { createStorageClient } = require('./storage/client.cjs');
const { createUpdates } = require('./updates/runtime.bundle.cjs');
const { createControlServer } = require('./control/server.cjs');
const { shouldAutoEnableControl } = require('./control/dev-policy.cjs');

app.setName('MotionDeck');
// 工作台固定深色，原生窗口与菜单也使用同一主题，避免深色底上的黑色悬浮层。
nativeTheme.themeSource = 'dark';
app.setAppUserModelId('dev.motiondeck.desktop');
const dataDir = process.env.MOTIONDECK_DATA_DIR ?? path.join(app.getPath('appData'), 'MotionDeck');
if (!path.isAbsolute(dataDir)) throw new Error('MOTIONDECK_DATA_DIR必须是绝对路径');
mkdirSync(dataDir, { recursive: true });
app.setPath('userData', dataDir);
const autoControl = shouldAutoEnableControl({
  flag: process.env.MOTIONDECK_DEV_AUTO_CONTROL,
  dataDir: process.env.MOTIONDECK_DATA_DIR,
  packaged: app.isPackaged,
  packageName: require(path.join(app.getAppPath(), 'package.json')).name,
});
const workspace = process.env.MOTIONDECK_DATA_DIR
  ? path.join(dataDir, 'workspace')
  : path.join(app.getPath('documents'), 'MotionDeck');
const local = process.env.MOTIONDECK_DATA_DIR
  ? path.join(dataDir, 'runtime')
  : path.join(process.env.LOCALAPPDATA ?? app.getPath('appData'), 'MotionDeck');
const paths = {
  personal: dataDir,
  library: path.join(workspace, '素材库'),
  exports: path.join(workspace, '导出'),
  backups: path.join(workspace, '备份'),
  cache: path.join(local, 'cache'),
  logs: path.join(local, 'logs'),
};
app.commandLine.appendSwitch('disk-cache-dir', paths.cache);
protocol.registerSchemesAsPrivileged([
  { scheme: 'motiondeck', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let window,
  storage,
  updates,
  control,
  controlBridge,
  exportDirectory = paths.exports,
  quitting = false,
  draftDirty = false;

function cancelControlQueries() {
  controlBridge?.cancel();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window && !process.argv.includes('--smoke-hidden')) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (storage && !quitting) {
      event.preventDefault();
      if (control?.hasPendingWrites()) return;
      if (
        draftDirty &&
        dialog.showMessageBoxSync(window, {
          type: 'warning',
          message: '助手姿势尚未保存，放弃并退出？',
          buttons: ['取消', '放弃并退出'],
          defaultId: 0,
          cancelId: 0,
        }) !== 1
      )
        return;
      quitting = true;
      draftDirty = false;
      cancelControlQueries();
      Promise.resolve(control?.close())
        .then(() => storage.close())
        .then(() => app.quit())
        .catch((error) => {
          console.error('客户端收尾失败', error.code ?? 'ERROR');
          app.quit();
        });
    }
  });
  app
    .whenReady()
    .then(async () => {
      await mkdir(dataDir, { recursive: true });
      storage = createStorageClient();
      const initialInfo = await storage.call('init', paths);
      // 初始化期间主动退出时，不再创建窗口或向已经关闭的数据库发请求。
      if (quitting) return;
      const register = createTrustedRegistrar(ipcMain, () => window);
      bindWindowIPC({ register, getWindow: () => window });
      controlBridge = createControlBridge({
        register,
        getWindow: () => window,
        getControl: () => control,
        getExportDirectory: () => exportDirectory,
        isQuitting: () => quitting,
        setDraftDirty: (value) => {
          draftDirty = value;
        },
        autoControl,
      });
      control = createControlServer({
        personal: dataDir,
        onAssistantChange: (value) => {
          if (window && !window.isDestroyed())
            window.webContents.send('motiondeck:assistant-state', value);
        },
        dispatch: (query) => controlBridge.dispatch(query),
      });
      controlBridge.bind();

      updates = createUpdates({
        paths,
        onChange: (value) => {
          if (window && !window.isDestroyed())
            window.webContents.send('motiondeck:update-state', value);
        },
        prepareInstall: async () => {
          if (draftDirty || control.hasPendingWrites())
            throw new Error('请先保存或放弃助手姿势，再重启更新');
          await storage.call('info');
        },
      });
      bindUpdateIPC({ register, getUpdates: () => updates, shell });
      bindDataSettingsIPC({
        register,
        getStorage: () => storage,
        getWindow: () => window,
        setExportDirectory: (value) => {
          exportDirectory = value;
        },
        dialog,
        shell,
        session,
      });

      protocol.handle('motiondeck', async (request) => {
        const resource = resolveResource(request, app.getAppPath());
        if (resource.status !== 200)
          return new Response('资源请求被拒绝', { status: resource.status });
        try {
          const bytes = await readFile(resource.file);
          return new Response(request.method === 'HEAD' ? null : bytes, {
            headers: resource.headers,
          });
        } catch (error) {
          if (error.code === 'ENOENT') return new Response('资源不存在', { status: 404 });
          console.error('资源读取失败', error);
          return new Response('资源读取失败', { status: 500 });
        }
      });
      // 不暴露Node/文件系统到渲染页面，也不允许新窗口、外部导航或设备权限。
      session.defaultSession.setPermissionRequestHandler(
        (contents, permission, callback, details) =>
          callback(allowPointerLock({ window, contents, permission, details, phase: 'request' })),
      );
      session.defaultSession.setPermissionCheckHandler(
        (contents, permission, requestingOrigin, details) =>
          allowPointerLock({
            window,
            contents,
            permission,
            requestingOrigin,
            details,
            phase: 'check',
          }),
      );
      Menu.setApplicationMenu(null);
      window = new BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 1100,
        minHeight: 680,
        title: 'MotionDeck',
        titleBarStyle: 'hidden',
        titleBarOverlay: false,
        icon: path.join(__dirname, 'assets', 'motiondeck.ico'),
        backgroundColor: '#121416',
        show: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
        },
      });
      const publishWindowState = () =>
        window.webContents.send('motiondeck:window-state', { maximized: window.isMaximized() });
      window.on('maximize', publishWindowState);
      window.on('unmaximize', publishWindowState);
      exportDirectory = initialInfo.exports;
      session.defaultSession.on('will-download', (_event, item) => {
        item.setSaveDialogOptions({
          defaultPath: path.join(exportDirectory, path.basename(item.getFilename())),
        });
        item.once('done', (_event, state) => {
          if (state === 'completed')
            storage
              .call('rememberExport', { directory: path.dirname(item.getSavePath()) })
              .then((directory) => {
                exportDirectory = directory;
              })
              .catch((error) => console.error('记住导出目录失败', error));
        });
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => {
        if (url !== 'motiondeck://app/labs/motion/index.html') event.preventDefault();
      });
      window.webContents.on('will-attach-webview', (event) => event.preventDefault());
      window.on('close', (event) => {
        if (quitting) return;
        if (control.hasPendingWrites()) {
          event.preventDefault();
          return;
        }
        if (draftDirty) {
          event.preventDefault();
          if (
            dialog.showMessageBoxSync(window, {
              type: 'warning',
              message: '助手姿势尚未保存，放弃并关闭？',
              buttons: ['取消', '放弃并关闭'],
              defaultId: 0,
              cancelId: 0,
            }) === 1
          ) {
            draftDirty = false;
            window.destroy();
          }
        }
      });
      window.webContents.on('will-prevent-unload', (event) => {
        if (control.hasPendingWrites()) return;
        if (
          dialog.showMessageBoxSync(window, {
            type: 'warning',
            message: '助手姿势尚未保存，放弃并重新载入？',
            buttons: ['取消', '放弃'],
            defaultId: 0,
            cancelId: 0,
          }) === 1
        ) {
          draftDirty = false;
          event.preventDefault();
        }
      });
      window.webContents.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => {
        if (isMainFrame) {
          cancelControlQueries();
          void control
            .close()
            .catch((error) => console.error('关闭命令控制失败', error.code ?? 'ERROR'));
        }
      });
      window.webContents.on('render-process-gone', () => {
        cancelControlQueries();
        void control
          .close()
          .catch((error) => console.error('关闭命令控制失败', error.code ?? 'ERROR'));
      });
      window.on('closed', () => {
        window = null;
      });
      window.once('ready-to-show', () => {
        if (!process.argv.includes('--smoke-hidden')) window.show();
      });
      await window.loadURL('motiondeck://app/labs/motion/index.html');
      if (quitting) return;
      updates.start();
    })
    .catch((error) => {
      if (quitting) {
        console.info('启动已取消，客户端正在退出');
        return;
      }
      console.error(error);
      dialog.showErrorBox('MotionDeck启动失败', error.message);
      app.quit();
    });
}
