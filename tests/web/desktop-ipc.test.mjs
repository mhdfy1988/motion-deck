import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createTrustedRegistrar } = require('../../desktop/ipc/register.cjs');
const { bindWindowIPC } = require('../../desktop/ipc/window.cjs');
const { createControlBridge } = require('../../desktop/ipc/control.cjs');
const { bindUpdateIPC } = require('../../desktop/ipc/updates.cjs');
const { bindDataSettingsIPC } = require('../../desktop/ipc/settings.cjs');
const { timeout } = require('../../desktop/control/operation-policy.cjs');

function fixture(autoControl = false) {
  const handlers = new Map(),
    calls = [],
    timers = new Map();
  let next = 0,
    dirty = false,
    quitting = false,
    exportDirectory = 'initial',
    access = 'pose-write',
    timelineWrite = true,
    pendingWrites = false,
    throttle = true;
  const frame = { url: 'motiondeck://app/labs/motion/index.html' },
    contents = {
      mainFrame: frame,
      isDestroyed: () => false,
      send: (...args) => calls.push(args),
      getBackgroundThrottling: () => throttle,
      setBackgroundThrottling: (value) => {
        throttle = value;
      },
    };
  let window = {
    webContents: contents,
    isDestroyed: () => false,
    isMaximized: () => false,
    minimize: () => calls.push(['minimize']),
    maximize: () => calls.push(['maximize']),
    unmaximize: () => calls.push(['unmaximize']),
    close: () => calls.push(['close']),
  };
  const event = { sender: contents, senderFrame: frame };
  const register = createTrustedRegistrar(
    {
      handle: (name, handler) => {
        assert.equal(handlers.has(name), false);
        handlers.set(name, handler);
      },
    },
    () => window,
  );
  const invoke = (name, ...args) =>
    Promise.resolve().then(() => handlers.get('motiondeck:' + name)(event, ...args));
  const control = {
    state: () => ({ access, timelineWrite }),
    hasPendingWrites: () => pendingWrites,
    setEnabled: (value) => calls.push(['enabled', value]),
    setWriteEnabled: (value) => calls.push(['write', value]),
    setTimelineEnabled: (value) => calls.push(['timeline', value]),
  };
  const bridge = createControlBridge({
    register,
    getWindow: () => window,
    getControl: () => control,
    getExportDirectory: () => exportDirectory,
    isQuitting: () => quitting,
    setDraftDirty: (value) => {
      dirty = value;
    },
    autoControl,
    makeId: () => randomUUID(),
    setTimer: (run, delay) => {
      const id = ++next;
      timers.set(id, { run, delay });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
  });
  bridge.bind();
  bindWindowIPC({ register, getWindow: () => window });
  let storage = {
      call: async (method, args) => {
        calls.push(['storage', method, args]);
        return { exports: 'new-export', personal: 'profile' };
      },
    },
    selected = { canceled: true };
  const shell = {
    openPath: async (path) => {
      calls.push(['path', path]);
      return '';
    },
    openExternal: async (url) => calls.push(['url', url]),
  };
  bindDataSettingsIPC({
    register,
    getWindow: () => window,
    getStorage: () => storage,
    setExportDirectory: (value) => {
      exportDirectory = value;
    },
    shell,
    dialog: { showOpenDialog: async () => selected },
    session: { defaultSession: { clearCache: async () => calls.push(['cache']) } },
  });
  const controller = Object.fromEntries(
    ['get', 'check', 'download', 'cancel', 'apply'].map((name) => [
      name,
      async (value) => {
        calls.push(['update', name, value]);
        return name;
      },
    ]),
  );
  bindUpdateIPC({ register, getUpdates: () => ({ controller }), shell });
  return {
    handlers,
    event,
    invoke,
    bridge,
    calls,
    timers,
    control,
    contents,
    get dirty() {
      return dirty;
    },
    get throttle() {
      return throttle;
    },
    get exportDirectory() {
      return exportDirectory;
    },
    setWindow: (value) => {
      window = value;
    },
    setAccess: (value, write = false) => {
      access = value;
      timelineWrite = write;
    },
    setQuitting: (value) => {
      quitting = value;
    },
    setPending: (value) => {
      pendingWrites = value;
    },
    setSelected: (value) => {
      selected = value;
    },
    setStorage: (value) => {
      storage = value;
    },
  };
}
const query = (operation = 'session.inspect') => ({
  operation,
  requestId: randomUUID(),
  sessionId: randomUUID(),
});
const replyFor = (packet, changes = {}) => ({
  bridgeId: packet.bridgeId,
  reply: {
    requestId: packet.query.requestId,
    sessionId: packet.query.sessionId,
    ok: true,
    revision: 0,
    result: {},
    ...changes,
  },
});
const packet = (f) => f.calls.findLast((item) => item[0] === 'motiondeck:control-query')[1];

test('固定十个通道全部经过来源校验，其他WebContents/子框架/近似URL均无副作用', async () => {
  const f = fixture();
  assert.deepEqual(
    [...f.handlers.keys()].sort(),
    [
      'window',
      'control',
      'control-capture',
      'control-manifest',
      'control-video',
      'control-export',
      'control-reply',
      'update',
      'data',
      'settings',
    ]
      .map((name) => 'motiondeck:' + name)
      .sort(),
  );
  for (const bad of [
    { ...f.event, sender: {} },
    { ...f.event, senderFrame: { url: f.event.senderFrame.url } },
    { ...f.event, senderFrame: { url: 'https://example.com/' } },
  ])
    for (const handler of f.handlers.values())
      await assert.rejects(
        Promise.resolve().then(() => handler(bad, 'state')),
        /不可信/,
      );
  f.event.senderFrame.url += '?fake=1';
  await assert.rejects(f.invoke('window', 'state'), /不可信/);
  assert.deepEqual(f.calls, []);
  f.setWindow(null);
  await assert.rejects(f.invoke('data', 'get', 'x'), /不可信/);
});

test('窗口及更新只接受原固定动作，关闭仍委托窗口事件', async () => {
  const f = fixture();
  assert.deepEqual(await f.invoke('window', 'state'), { maximized: false });
  await f.invoke('window', 'close');
  assert.deepEqual(f.calls, [['close']]);
  await assert.rejects(f.invoke('window', 'destroy'), /不支持/);
  assert.equal(await f.invoke('update', 'install', false), 'apply');
  assert.deepEqual(f.calls.at(-1), ['update', 'apply', false]);
  await f.invoke('update', 'releases');
  assert.equal(f.calls.at(-1)[1], 'https://github.com/mhdfy1988/motion-deck/releases');
  await assert.rejects(f.invoke('update', 'unknown'), /不支持/);
});

test('存储和设置保持白名单、取消不写盘，目录成功后写回同一导出位置', async () => {
  const f = fixture();
  await assert.rejects(f.invoke('data', 'delete', 'x'), /不支持/);
  await assert.rejects(f.invoke('settings', 'choose', 'personal'), /目录类型/);
  assert.deepEqual(f.calls, []);
  assert.equal(await f.invoke('settings', 'choose', 'exports'), null);
  assert.equal(f.exportDirectory, 'initial');
  assert.deepEqual(f.calls, []);
  f.setSelected({ canceled: false, filePaths: ['chosen'] });
  await f.invoke('settings', 'choose', 'exports');
  assert.equal(f.exportDirectory, 'new-export');
  assert.deepEqual(f.calls.at(-1), [
    'storage',
    'setDirectory',
    { kind: 'exports', directory: 'chosen' },
  ]);
  await f.invoke('settings', 'choose', 'library');
  assert.equal(f.calls.at(-1)[1], 'moveLibrary');
  f.setStorage({
    call: async () => {
      throw new Error('disk');
    },
  });
  await assert.rejects(f.invoke('data', 'get', 'x'), /disk/);
  assert.equal(f.exportDirectory, 'new-export');
  await f.invoke('settings', 'clearCache');
  assert.deepEqual(f.calls.at(-1), ['cache']);
});

test('控制就绪/自动授权/草稿/忙碌及退出门槛仍独立检查', async () => {
  const f = fixture(true);
  await assert.rejects(f.invoke('control', 'write', true), /未就绪/);
  await f.invoke('control', 'ready');
  assert.deepEqual(f.calls, [
    ['enabled', true],
    ['write', true],
    ['timeline', true],
  ]);
  await f.invoke('control', 'draft', true);
  assert.equal(f.dirty, true);
  await assert.rejects(f.invoke('control', 'draft', 'yes'), /草稿状态/);
  f.setPending(true);
  await assert.rejects(f.invoke('control', 'enable', false), /执行操作/);
  f.setPending(false);
  f.setQuitting(true);
  await assert.rejects(f.invoke('control', 'timeline', true), /未就绪/);
  const ordinary = fixture();
  await ordinary.invoke('control', 'ready');
  assert.deepEqual(ordinary.calls, []);
});

test('命令桥校验响应身份，完成清理定时器，未知或重复响应不重复提交', async () => {
  const f = fixture();
  await assert.rejects(f.bridge.dispatch(query()), { code: 'NOT_READY' });
  await f.invoke('control', 'ready');
  const pending = f.bridge.dispatch(query()),
    p = packet(f);
  await assert.rejects(
    f.invoke('control-reply', replyFor(p, { requestId: randomUUID() })),
    /不匹配/,
  );
  assert.equal(f.timers.size, 1);
  await assert.rejects(
    f.invoke('control-reply', replyFor(p, { sessionId: randomUUID() })),
    /不匹配/,
  );
  const reply = replyFor(p);
  assert.equal(await f.invoke('control-reply', reply), true);
  assert.deepEqual(await pending, reply.reply);
  assert.equal(f.timers.size, 0);
  assert.equal(await f.invoke('control-reply', reply), false);
});

test('取消使全部在途请求失效并清计时；超时删除请求而不隐式重试', async () => {
  const f = fixture();
  await f.invoke('control', 'ready');
  const p = f.bridge.dispatch(query()),
    cancelled = assert.rejects(p, { code: 'SESSION_CLOSED' });
  f.bridge.cancel();
  f.bridge.cancel();
  await cancelled;
  assert.equal(f.timers.size, 0);
  await assert.rejects(f.bridge.dispatch(query()), { code: 'NOT_READY' });
  await f.invoke('control', 'ready');
  const input = query(),
    pending = f.bridge.dispatch(input),
    timed = assert.rejects(pending, { code: 'RESULT_UNKNOWN' }),
    packetValue = packet(f);
  const [id, timer] = [...f.timers][0];
  assert.equal(timer.delay, timeout(input.operation) - 1000);
  f.timers.delete(id);
  timer.run();
  await timed;
  assert.equal(await f.invoke('control-reply', replyFor(packetValue)), false);
});

test('媒体写入口同时检查在途操作与本次授权，取消后不能继续落盘', async () => {
  const f = fixture();
  await f.invoke('control', 'ready');
  for (const name of ['control-capture', 'control-manifest', 'control-video', 'control-export'])
    await assert.rejects(f.invoke(name, new Uint8Array()), /没有已授权/);
  const pending = f.bridge.dispatch(query('export.video')),
    cancelled = assert.rejects(pending, { code: 'SESSION_CLOSED' });
  assert.equal(f.throttle, false);
  f.setAccess('read-only');
  await assert.rejects(f.invoke('control-video', {}), /没有已授权/);
  f.bridge.cancel();
  await cancelled;
  assert.equal(f.throttle, true);
  await assert.rejects(f.invoke('control-video', {}), /没有已授权/);
});
