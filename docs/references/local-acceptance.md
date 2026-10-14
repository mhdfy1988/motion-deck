# 完整本地验收

2026-10-14按用户决定调整：GitHub自动只执行npm ci、构建、18项素材校验与领域测试。浏览器、录制与真实NSIS升级测试默认不在测试机自动运行；可手动选择full_regression。没有部署云端网页。

## 运行顺序

1. npm.cmd run desktop:installer：先构建及准备真实客户端/安装器，测试开始后不能再改包。
2. npm.cmd run assets:verify、npm.cmd test。
3. 独立8904运行完整界面测试，指定FFMPEG_BIN为已验证工具目录。
4. 真实桌面回归指定MOTIONDECK_PACKAGED_EXE、MOTIONDECK_LEGACY_EXE、MOTIONDECK_TEST_OLD_INSTALLER及MOTIONDECK_TEST_NEW_INSTALLER；个人资料与安装位置由既有测试隔离，不改正式MotionDeck注册或资料。

生成真实Playwright报告（PowerShell环境变量只影响当前命令窗口）：

```powershell
$env:MOTIONDECK_TEST_PORT='8904'
$env:PLAYWRIGHT_JSON_OUTPUT_NAME='output/acceptance/local-web.json'
npx.cmd playwright test --config playwright.config.js --reporter=list,json
# 配置上述桌面4个路径及FFMPEG_BIN后执行；缺少旧客户端不能称为完整迁移验收。
$env:PLAYWRIGHT_JSON_OUTPUT_NAME='output/acceptance/local-desktop.json'
npx.cmd playwright test --config playwright.desktop.config.js --reporter=list,json
```

## 发布检查

scripts/local-acceptance-gate.mjs复用报告：网页至少51项、覆盖配置中的全部文件；桌面至少5项、含迁移/目录/更新文件；失败、重试后才成功、跳过、缺文件均拒绝。实现/测试/包在报告开始后变更也拒绝，需重新验收。报告仅保存在忽略目录，不手填通过标记，不把定向少量测试当成完整门禁。

scripts/github-release.mjs仍要求当前提交基础CI通过，同时要求本地完整报告通过。不直接删除发布校验，也不允许仅诊断任务成功代替验收。本轮不自动发布。

## 差异审计

对比GitHub排查前5830c84到efe7c96：web、desktop、依赖清单、打包脚本无改动。变化限于测试/CI、运维脚本和记录：拆导出用例但保留断言、原生二进制回传、拖放16步改4步并行取框、独立加载等待、FFmpeg固定准备、预期更新退出处理。鼠标中间事件采样减少，不能把测试模拟改变说成毫无变化；产品功能没有因此被删减。

此前云端模型等待超时记录保留。关闭自动重型回归是验收策略调整，不代表环境问题已修复。
