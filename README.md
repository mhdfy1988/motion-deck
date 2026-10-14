# MotionDeck

3D 动作与姿势编排工具，可录制参考视频供 2D 游戏和 AI 素材制作使用。

从动作工坊的既有工具直接抽取，保留界面、编排协议和功能。现已提供Windows x64 Electron客户端候选，并完成第一轮模块分层；无需Python后端。

## 启动

### 安装客户端

Windows x64 未签名测试版，从[GitHub Releases](https://github.com/mhdfy1988/motion-deck/releases)下载 `MotionDeck-0.1.0-setup-x64.exe`，仅安装到当前用户，可选择安装位置。首次运行可能出现未知发布者或Windows安全提示，请核对来源；没有签名证书，不建议关闭系统安全防护。

右上角“更新”支持检查、下载进度、取消/重试与确认重启安装；普通退出不会偷偷安装。已保存素材与设置保留，更新前请保存编排。安装及验证细节见[安装与更新](docs/install-and-update.md)。

### 免安装客户端

本机打包产物位于`output/desktop/MotionDeck-win32-x64/`，双击其中的`MotionDeck.exe`。保留整个目录，不需要安装Node或另开浏览器，也不使用8901端口。免安装版不支持原位更新，可重新下载完整包。

### 源码启动

使用 Node.js 24（本机验证24.14.0），在本项目目录执行：

已有本机目录可直接从 `npm.cmd ci` 开始；客户端源码的提交与发布进度见文末。

```powershell
git clone https://github.com/mhdfy1988/motion-deck.git
Set-Location motion-deck
npm.cmd ci
npm.cmd run build
npm.cmd start
```

npm start默认打开Electron客户端。网页仅保留为开发/回归入口：执行`npm.cmd run dev`后打开 http://127.0.0.1:8901/ ，服务仅监听本机；端口可通过环境变量PORT显式指定。不要通过双击HTML启动。客户端打包与隔离测试步骤见[桌面运行说明](docs/desktop-runbook.md)。

首次进入直接加载Mesh2Motion白模，不显示模型选择页；通过顶部下拉切换Quaternius或导入其他模型。已有用户恢复上次模型和素材库，不覆盖为默认白模。

更新后若仍看到旧界面，先保存当前编排，再强制刷新页面。不要清除浏览器站点数据或IndexedDB，否则会丢失自定义动作、姿势和已导入模型。

## 当前能力

- Quaternius：117 个动作、99 个姿势；Mesh2Motion：162 个动作、16 个从动作取帧的默认姿势。
- 模型导入与保存、动作/姿势搜索和预览、时间轴拖放、裁剪/变速、主动放置过渡、撤销/重做。
- 素材库、预览和底部编排采用留缝面板；播放栏属于预览区，编排工具栏与时间轴组成独立面板。工具栏始终显示，不可用操作置灰，片段增删不会改变面板高度。
- 时间轴默认每秒100像素，添加片段不缩小原片段；用右侧缩放滑条或加减按钮调整显示，点击“适合全部”才自动取景，长编排横向滚动。缩放不改变动作时长或导出结果。
- 默认库只读，自定义动作作为完整片段保存和再次使用；自定义姿势可保存及删除。
- 横版侧视及其他固定视角、PNG 拍照、高清参考视频录制。
- 当前模型的动作/姿势多选导出：带模型的 GLB 或 ZIP。标准动画为近似重采样，不宣称原曲线无损。

姿势编辑和动作/姿势导入继续隐藏。全身联动试摆仅保留为实验，`npm.cmd run build:experiment` 后访问 `/labs/motion/fullbody.html`，不作为正式能力或好用程度承诺。

## 时间轴操作

- 从左侧拖入动作或姿势；过渡卡拖到片段之间。拖入位置用局部插入线和箭头标识。
- 选择“裁剪”后拖片段边缘，保留部分原动作；选择“变速”后拖边缘，保留完整动作并调整播放时长。姿势和过渡的边缘拖动调整停留或过渡时长。
- 边缘内侧最多20像素为调整区域，短片段自动缩小，光标为双箭头；片段中间用于选择或移动。按住边缘调整期间双箭头保持，Esc取消本次拖动。
- 缩放只改变显示比例，不改变动作速度或实际时长；“适合全部”是一次性取景，之后添加片段仍保持该比例。

## 客户端与命令操作方向

已选Electron并提供本机客户端候选；命令控制、助手摆姿势和MCP仍未实现。核心、应用、平台与界面模块已分层，时间轴操作不依赖DOM，仍使用同一模型状态；组合入口尚未完全拆净，后续按用例推进，不为命令复制另一套编辑逻辑。见[项目结构](docs/project-structure.md)及[架构讨论与当前状态](docs/desktop-architecture.md)。

## 数据边界

MotionDeck 使用独立浏览器数据库 `motion-deck.library.v1`。旧动作工坊代码、文件和旧数据库未修改，旧自定义库不会自动搬到新地址。不同地址/端口也不共享浏览器库。

客户端沿用动作协议，个人设置默认保存于`%APPDATA%\MotionDeck`，磁盘素材库、导出与备份默认放在系统文档目录的MotionDeck下。右上角“设置”可查看/打开目录、迁移素材库、更改导出/备份目录、备份恢复和清理缓存。程序替换不要求清理资料目录；不访问或迁移Chrome、动作工坊库。

客户端启动时将本客户端旧IndexedDB库安全复制、校验并备份到磁盘库后切换，原库保留；损坏或迁移失败显式报错，不静默回落。新库使用SQLite索引和哈希原文件，不是每个动作一个GLB。完整备份包含模型、已保存动作和姿势，不包含未保存编排；恢复会提示并重载页面，旧库保留。网页开发入口仍使用独立IndexedDB。

内置素材在`resources/app.asar`中，只读随包提供。GLB/ZIP、拍照和录像保存对话框默认使用配置的导出目录；这些是素材输出，不等于完整库备份。磁盘缓存与日志单独放置，清理缓存不删素材。详细边界与迁移流程见[数据目录说明](docs/data-directories.md)。

## 目录

```text
desktop/              Electron窗口、内部资源协议和安全边界
web/labs/motion/       页面组合入口、样式；core/application/platform/ui模块
fixtures/             已核对的内置资源与测试资源、哈希清单
scripts/              构建、静态服务和资源校验
tests/                领域测试及浏览器回归
docs/                 抽取边界、参考证据和验收
```

保留原页面入口，内部模块按职责整理；运行与构建不读取原action-forge目录。模型库身份和持久化格式不变，详细职责见[项目结构](docs/project-structure.md)。

## 验证

```powershell
npm.cmd run assets:verify
npm.cmd test
$env:MOTIONDECK_TEST_PORT='8904'
npm.cmd run test:e2e
```

Windows 浏览器回归使用 Chrome，录像验证需 FFmpeg/ffprobe 在 PATH 中，或配置 FFMPEG_BIN。设置`MOTIONDECK_TEST_PORT=8904`使用隔离测试服务，不占用主入口8901；服务随测试自动启动和停止，浏览器上下文不使用已有用户库。门禁只覆盖当前开放功能；旧姿势编辑、第三方动作导入和全身试摆界面用例保留但不混入正式门禁。验证记录见[docs/verification.md](docs/verification.md)。

原有领域依赖沿用抽取时的版本，`.npmrc`固定legacy-peer-deps，避免实验IK包的URDF示例同伴依赖改变安装图；只使用其core求解器。客户端另外引入Electron、Packager及构建期图标转换库，具体版本以package.json和锁文件为准。

## 许可与发布状态

项目自有代码采用 [MIT 许可证](LICENSE)，目标[公开仓库](https://github.com/mhdfy1988/motion-deck)已创建。第三方依赖和资源保留各自许可，见 [来源与许可](THIRD_PARTY_NOTICES.md)。package 的 `private: true` 仅防止误发布到 npm，不限制 GitHub 仓库公开。

2026-10-14：客户端0.1.0未签名预发布版正在收口。数据管理和真实NSIS升级验收已完成，领域55项通过；发布、最终回归与远端状态以[当前任务](docs/stages/current-todo.md)和[验证记录](docs/verification.md)为准。尚无签名、跨平台安装或GitHub Pages部署。

GitHub自动检查仅构建、素材校验及领域测试，不部署网站。完整界面、桌面及真实安装升级回归以本地验收为准；保留手动`full_regression`入口，默认不执行重型回归。发布脚本要求完整本地JSON报告无失败、无跳过，且实现、测试和客户端包未在验收后变化；基础CI仍须通过。具体命令及证据见[本地验收](docs/references/local-acceptance.md)，历史云端失败仍保留在验证记录中，不视为已修复。
