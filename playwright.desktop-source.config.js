import { defineConfig } from '@playwright/test';

// 明确的源码链路定向检查，不替代正式包/验收包的桌面门禁。
export default defineConfig({
  testDir: './tests/desktop-source',
  timeout: 60000,
  workers: 1,
  reporter: 'list',
  outputDir: 'output/desktop-source-tests',
});
