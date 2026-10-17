import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { createRequire } from 'node:module';
import { waitForModel } from '../motion-lab/model-ready-helper.js';
import sharp from 'sharp';
const require = createRequire(import.meta.url),
  executablePath = require('electron');
const { sendQuery } = require('../../desktop/control/client.cjs');

test('源码桌面IPC：真实注册、独立资料、命令往返、不可信窗口拒绝及关闭保护', async () => {
  const root = resolve('.');
  await mkdir(join(root, 'output/desktop-source-tests'), { recursive: true });
  const dataDir = await mkdtemp(join(root, 'output/desktop-source-tests/ipc-'));
  const env = { ...process.env, MOTIONDECK_DATA_DIR: dataDir, MOTIONDECK_DEV_AUTO_CONTROL: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const client = await electron.launch({ executablePath, args: [root, '--smoke-hidden'], env });
  let page;
  try {
    page = await client.firstWindow();
    await waitForModel(page, { actions: 162 });
    // 沿用dev-auto-control已有验收：连接启用和两项写权限是不同就绪阶段。
    await expect
      .poll(() => page.evaluate(() => motionDeckDesktop.controlState()), { timeout: 15000 })
      .toMatchObject({ enabled: true, access: 'pose-write', timelineWrite: true });
    const state = await page.evaluate(async () => ({
      window: await motionDeckDesktop.windowState(),
      settings: await motionDeckDesktop.settings(),
      control: await motionDeckDesktop.controlState(),
      update: await motionDeckDesktop.updateState(),
    }));
    expect(state.window.maximized).toBe(false);
    expect(state.settings.personal).toBe(dataDir);
    expect(state.control.enabled).toBe(true);
    expect(state.control.access).toBe('pose-write');
    expect(typeof state.update.status).toBe('string');
    expect(
      await client.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    ).toBe(false);
    const reply = await sendQuery(dataDir, { operation: 'session.inspect' });
    expect(reply.ok).toBe(true);
    expect(reply.result.status).toBe('ready');
    const capture = await sendQuery(dataDir, {
      operation: 'view.capture',
      modelKey: reply.result.modelKey,
      expectedRevision: reply.result.revision,
      args: { views: ['front'], options: { width: 320, height: 240, framing: 'pose' } },
    });
    expect(capture.ok).toBe(true);
    expect(capture.result.files).toHaveLength(1);
    const image = capture.result.files[0].path;
    expect(image.startsWith(state.settings.exports + sep)).toBe(true);
    expect((await sharp(await readFile(image)).metadata()).width).toBe(320);
    const rejected = await page.evaluate(async () => {
      try {
        await motionDeckDesktop.saveControlVideo({});
        return false;
      } catch (error) {
        return /没有已授权视频请求/.test(error.message);
      }
    });
    expect(rejected).toBe(true);
    // 新窗口使用同一真实preload，但不是主窗口；不能借桥接读取任何业务组。
    const errors = await client.evaluate(
      async ({ BrowserWindow }, preload) => {
        const other = new BrowserWindow({
          show: false,
          webPreferences: {
            preload,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        });
        try {
          await other.loadURL('data:text/html,<title>IPC source test</title>');
          return await other.webContents.executeJavaScript(
            `Promise.all(['windowState','controlState','settings','updateState'].map(async name=>{try{await window.motionDeckDesktop[name]();return 'allowed';}catch(error){return error.message;}}))`,
          );
        } finally {
          other.close();
        }
      },
      join(root, 'desktop/preload.cjs'),
    );
    expect(errors).toHaveLength(4);
    for (const error of errors) expect(error).toContain('拒绝不可信');
    // 只拦截隔离测试进程的确认框，保留产品close事件路径，不向用户桌面弹窗。
    await client.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 0;
    });
    await page.evaluate(() => motionDeckDesktop.controlDraftState(true));
    await page.evaluate(() => motionDeckDesktop.closeWindow());
    expect(page.isClosed()).toBe(false);
    expect(await page.evaluate(() => motionDeckDesktop.windowState())).toEqual({
      maximized: false,
    });
    await page.evaluate(() => motionDeckDesktop.controlDraftState(false));
    await page.reload();
    await waitForModel(page, { actions: 162 });
    await expect
      .poll(() => page.evaluate(() => motionDeckDesktop.controlState()), { timeout: 15000 })
      .toMatchObject({ enabled: true, access: 'pose-write', timelineWrite: true });
    expect((await sendQuery(dataDir, { operation: 'session.inspect' })).ok).toBe(true);
  } finally {
    try {
      if (page && !page.isClosed())
        await page.evaluate(() => motionDeckDesktop.controlDraftState(false));
    } finally {
      await client.close();
    }
  }
});
