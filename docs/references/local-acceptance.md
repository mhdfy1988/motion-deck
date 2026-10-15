# 完整本地验收

AI工作区增加网页2项与真实包2项用例，当前完整门禁最低网页63项、桌面21项；必须包含`ai-workspace.spec.js`，检查权限、索引/内容事务、收录、保护、回收及SQLite恢复，以及手动覆盖后动态按钮恢复。定向命令回归不能代替全桌面/NSIS。

素材剪贴板网页`library-clipboard.spec.js`及真实包同名桌面用例已纳入上述门禁，定向测试不能代替完整门禁。

2026-10-14按用户决定调整：GitHub自动只执行npm ci、构建、18项素材校验与领域测试。浏览器、录制与真实NSIS升级测试默认不在测试机自动运行；可手动选择full_regression。没有部署云端网页。

2026-10-15基础CI的领域测试显式`--test-concurrency=1`，避免Windows ACL子进程冷启动与其他文件测试竞争资源；不改安全超时、不跳过真实管道测试。[Node测试并发说明](https://nodejs.org/api/cli.html#--test-concurrency)确认该选项控制测试文件子进程数量；与用例内部并发、客户端命令队列无关。CI实测结果见verification.md。

## 运行顺序

1. npm.cmd run desktop:installer：先构建及准备真实客户端/安装器，测试开始后不能再改包。
2. npm.cmd run assets:verify、npm.cmd test。
3. 独立8904运行完整界面测试，指定FFMPEG_BIN为已验证工具目录。
4. 真实桌面回归分别指定正式包MOTIONDECK_PACKAGED_EXE、隔离验收包MOTIONDECK_DEV_PREVIEW_EXE、旧客户端MOTIONDECK_LEGACY_EXE、旧/新安装器MOTIONDECK_TEST_OLD_INSTALLER及MOTIONDECK_TEST_NEW_INSTALLER；个人资料与安装位置由既有测试隔离，不改正式MotionDeck注册或资料。自动授权测试显式核对两种发行身份：正式包必须拒绝自动授权，验收包才可按隔离开发条件开放；不得把同一个EXE混用为两种身份。

生成真实Playwright报告（PowerShell环境变量只影响当前命令窗口）：

```powershell
$env:MOTIONDECK_TEST_PORT='8904'
$env:PLAYWRIGHT_JSON_OUTPUT_NAME='output/acceptance/local-web.json'
npx.cmd playwright test --config playwright.config.js --reporter=list,json
# 配置上述桌面5个路径及FFMPEG_BIN后执行；缺少旧客户端不能称为完整迁移验收。
$env:PLAYWRIGHT_JSON_OUTPUT_NAME='output/acceptance/local-desktop.json'
npx.cmd playwright test --config playwright.desktop.config.js --reporter=list,json
```

## 发布检查

scripts/local-acceptance-gate.mjs复用报告：当前源码网页至少63项、覆盖配置中的全部文件；桌面至少21项，除完整客户端、目录/迁移/更新、顶栏、启动退出、实际分割裁剪外，必须覆盖共享操作层、只读命令、姿势命令、编排命令、开发默认授权、两模型检查/修帧/媒体命令、四模式位移导出以及自定义库重命名、复制粘贴、AI工作区/SQLite恢复测试。失败、重试后才成功、跳过、缺文件均拒绝。实现/测试/包在报告开始后变更也拒绝，需重新验收。报告仅保存在忽略目录，不手填通过标记，不把定向少量测试当成完整门禁。

桌面回归必须串行执行。真实NSIS升级使用与命令验收相同的MotionDeckAcceptance产品名，不能并行启动定向桌面用例或同名预览，以免安装器关闭其他验收进程。未保存草稿的关闭/刷新保护由Electron主进程处理；对应测试应避免Playwright重复处理已经被主进程接管的弹窗，并断言取消后草稿和命令会话仍可查询。

### 标题栏悬浮取证

Electron测试共享Windows桌面，Playwright移入一次后，系统指针事件仍可能使`:hover`失效。`chrome.spec.js`在5秒原预算内每次检查前重新执行真实`locator.hover()`，同时断言`:hover=true`与准确背景色；移开同样断言`:hover=false`和原色。不能通过强制CSS伪类、放宽颜色或忽略失败处理。测试本身会移动指针，运行时避免与人工鼠标操作同时争用。

2026-10-15诊断中，按钮边界不变、颜色已达到rgb(52,59,70)，随后收到窗口下方坐标(452.8,780.8)的pointerout，native焦点丢失，颜色随:hover退出而恢复透明；证据`output/titlebar-hover-diagnostic/proof.json`。这说明该次复现是悬浮前提被打断，不是CSS未生效；无法据此确定是哪个外部窗口或输入源触发。对比也表明showInactive本身不必然失败，单纯改为focus不是充分修复。

接口依据：[Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)明确showInactive不聚焦、show会聚焦；[Playwright Mouse](https://playwright.dev/docs/api/class-mouse)定义页面坐标鼠标输入。诊断只读原生焦点/系统指针、DOM事件和几何；不改业务模型。修改用例后连续10次通过（35.23秒，无失败/跳过/重试），报告`output/titlebar-hover-diagnostic/repeated.json`，不替代一次新的完整桌面报告。

scripts/github-release.mjs仍要求当前提交基础CI通过，同时要求本地完整报告通过。不直接删除发布校验，也不允许仅诊断任务成功代替验收；发布另需用户授权，不能由测试通过自行推断授权。

## 差异审计

对比GitHub排查前5830c84到efe7c96：web、desktop、依赖清单、打包脚本无改动。变化限于测试/CI、运维脚本和记录：拆导出用例但保留断言、原生二进制回传、拖放16步改4步并行取框、独立加载等待、FFmpeg固定准备、预期更新退出处理。鼠标中间事件采样减少，不能把测试模拟改变说成毫无变化；产品功能没有因此被删减。

此前云端模型等待超时记录保留。关闭自动重型回归是验收策略调整，不代表环境问题已修复。
