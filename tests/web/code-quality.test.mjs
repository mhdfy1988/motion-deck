import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ESLint } from 'eslint';
import { check, resolveConfig } from 'prettier';

const eslint = new ESLint();
const browserPath = 'web/labs/motion/__lint_probe__.js';
const desktopPath = 'desktop/__lint_probe__.cjs';
const rulesFor = async (source, filePath = browserPath) => {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.map((message) => message.ruleId);
};

test('静态检查拒绝未执行回调中的未定义引用与未使用导入', async () => {
  assert.deepEqual(await rulesFor('export const run = () => missingCallback();'), ['no-undef']);
  assert.deepEqual(await rulesFor("import { sampleSequence } from './core/sequence-core.js';"), [
    'no-unused-vars',
  ]);
});

test('浏览器与桌面全局分别声明，不靠混合环境放过错误引用', async () => {
  assert.deepEqual(await rulesFor('document.title = window.location.href;'), []);
  assert.deepEqual(
    await rulesFor("const path = require('node:path'); module.exports = path;", desktopPath),
    [],
  );
  assert.deepEqual(await rulesFor('process.exitCode = 1;'), ['no-undef']);
  assert.deepEqual(await rulesFor('document.title = "desktop";', desktopPath), ['no-undef']);
});

test('生成产物与明确暂停的实验源码不进入本轮静态门禁', async () => {
  for (const path of [
    'web/labs/motion/motion.bundle.js',
    'desktop/control/validators.generated.cjs',
    'web/labs/motion/fullbody.js',
  ]) {
    assert.equal(await eslint.isPathIgnored(path), true, path);
  }
});

test('基础CI执行静态和格式门禁，不自动开启重型回归', async () => {
  const workflow = await readFile('.github/workflows/verify.yml', 'utf8');
  assert.match(workflow, /- run: npm run lint/);
  assert.match(workflow, /- run: npm run format:check/);
  assert.match(workflow, /- run: npm run test:e2e\s+if: \$\{\{ inputs\.full_regression \}\}/);
});

test('已整理的入口与工作台模块保持统一格式，格式化范围不扩散', async () => {
  const paths = [
    'web/labs/motion/motion.js',
    'web/labs/motion/application/workbench-operations.js',
    'web/labs/motion/pose/body-controls.js',
    'desktop/main.cjs',
    'web/labs/motion/application/workbench-queries.js',
    'web/labs/motion/application/workbench-pose-operations.js',
    'web/labs/motion/application/workbench-media-operations.js',
    'web/labs/motion/application/workbench-library-operations.js',
    'desktop/ipc/register.cjs',
    'desktop/ipc/window.cjs',
    'desktop/ipc/control.cjs',
    'desktop/ipc/updates.cjs',
    'desktop/ipc/settings.cjs',
  ];
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.scripts['format:check'], 'prettier --check ' + paths.join(' '));
  assert.equal(pkg.scripts.format, 'prettier --write ' + paths.join(' '));
  for (const path of paths) {
    assert.equal(
      await check(await readFile(path, 'utf8'), { ...(await resolveConfig(path)), filepath: path }),
      true,
      path,
    );
  }
});
