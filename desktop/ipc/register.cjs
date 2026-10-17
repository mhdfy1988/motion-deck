// 所有固定IPC入口先经过同一来源校验，再转交业务；不暴露任意通道给渲染器。
function createTrustedRegistrar(ipcMain, getWindow) {
  return (channel, handler) =>
    ipcMain.handle(channel, (event, ...args) => {
      const window = getWindow();
      if (
        !window ||
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        event.senderFrame.url !== 'motiondeck://app/labs/motion/index.html'
      )
        throw new Error('拒绝不可信的客户端请求');
      return handler(...args);
    });
}
module.exports = { createTrustedRegistrar };
