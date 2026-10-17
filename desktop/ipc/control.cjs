const { randomUUID } = require('node:crypto');
const { reply: validateControlReply } = require('../control/validators.generated.cjs');
const {
  writeCapture,
  writeExport,
  writeManifest,
  writeVideo,
} = require('../control/capture-files.cjs');
const { timeout: controlTimeout } = require('../control/operation-policy.cjs');

// 持有原来唯一的渲染查询表和就绪标记，控制会话仍由既有server持有。
function createControlBridge({
  register,
  getWindow,
  getControl,
  getExportDirectory,
  isQuitting,
  setDraftDirty,
  autoControl,
  makeId = randomUUID,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let rendererControlReady = false;
  const controlPending = new Map();
  function cancel() {
    rendererControlReady = false;
    for (const pending of controlPending.values()) {
      clearTimer(pending.timer);
      pending.reject(Object.assign(new Error('客户端会话已关闭'), { code: 'SESSION_CLOSED' }));
    }
    controlPending.clear();
  }
  const dispatch = async (query) => {
    const contents = getWindow()?.webContents,
      video = query.operation === 'export.video' && contents && !contents.isDestroyed(),
      throttling = video ? contents.getBackgroundThrottling() : null;
    if (video) contents.setBackgroundThrottling(false);
    try {
      return await new Promise((resolve, reject) => {
        if (!rendererControlReady || !getWindow() || getWindow().isDestroyed())
          return reject(Object.assign(new Error('客户端查询尚未就绪'), { code: 'NOT_READY' }));
        const bridgeId = makeId(),
          timer = setTimer(
            () => {
              controlPending.delete(bridgeId);
              reject(
                Object.assign(new Error('客户端操作超时，请查询请求状态'), {
                  code: 'RESULT_UNKNOWN',
                }),
              );
            },
            controlTimeout(query.operation) - 1000,
          );
        controlPending.set(bridgeId, {
          resolve,
          reject,
          timer,
          requestId: query.requestId,
          sessionId: query.sessionId,
          operation: query.operation,
        });
        getWindow().webContents.send('motiondeck:control-query', { bridgeId, query });
      });
    } finally {
      if (video && !contents.isDestroyed()) contents.setBackgroundThrottling(throttling);
    }
  };
  function bind() {
    register('motiondeck:control', async (method, value) => {
      if (method === 'state') return getControl().state();
      if (method === 'ready') {
        rendererControlReady = true;
        if (autoControl) {
          await getControl().setEnabled(true);
          getControl().setWriteEnabled(true);
          getControl().setTimelineEnabled(true);
        }
        return true;
      }
      if (method === 'draft') {
        if (typeof value !== 'boolean') throw new Error('草稿状态无效');
        setDraftDirty(value);
        return true;
      }
      if (method === 'write' || method === 'timeline') {
        if (isQuitting() || !rendererControlReady) throw new Error('工作台未就绪');
        return method === 'write'
          ? getControl().setWriteEnabled(value)
          : getControl().setTimelineEnabled(value);
      }
      if (method === 'enable') {
        if (isQuitting() || !rendererControlReady || getControl().hasPendingWrites())
          throw new Error('工作台正在执行操作');
        return getControl().setEnabled(value);
      }
      throw new Error('不支持的命令控制操作');
    });
    register('motiondeck:control-capture', async (value) => {
      if (
        ![...controlPending.values()].some((p) =>
          ['view.capture', 'view.captureSequence'].includes(p.operation),
        ) ||
        !(getControl().state().access === 'pose-write' || getControl().state().timelineWrite)
      )
        throw new Error('没有已授权截图请求');
      return writeCapture(getExportDirectory(), value);
    });
    register('motiondeck:control-manifest', async (value) => {
      if (
        ![...controlPending.values()].some((p) => p.operation === 'view.captureSequence') ||
        !(getControl().state().access === 'pose-write' || getControl().state().timelineWrite)
      )
        throw new Error('没有已授权截图索引请求');
      return writeManifest(getExportDirectory(), value);
    });
    register('motiondeck:control-video', async (value) => {
      if (
        ![...controlPending.values()].some((p) => p.operation === 'export.video') ||
        !getControl().state().timelineWrite
      )
        throw new Error('没有已授权视频请求');
      return writeVideo(getExportDirectory(), value);
    });
    register('motiondeck:control-export', async (value) => {
      if (
        ![...controlPending.values()].some((p) => p.operation === 'export.glb') ||
        !getControl().state().timelineWrite
      )
        throw new Error('没有已授权动作导出请求');
      return writeExport(getExportDirectory(), value);
    });
    register('motiondeck:control-reply', (value) => {
      const pending = controlPending.get(value?.bridgeId);
      if (!pending) return false;
      if (
        !validateControlReply(value.reply) ||
        value.reply.requestId !== pending.requestId ||
        value.reply.sessionId !== pending.sessionId
      )
        throw new Error('查询响应不匹配');
      clearTimer(pending.timer);
      controlPending.delete(value.bridgeId);
      pending.resolve(value.reply);
      return true;
    });
  }
  return { dispatch, cancel, bind };
}
module.exports = { createControlBridge };
