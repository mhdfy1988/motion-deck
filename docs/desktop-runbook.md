# 桌面客户端运行与打包

2026-10-17。Windows x64，Electron44.7.0；客户端`0.3.0`未签名测试版及随包技能`0.2.1`已公开发布。304领域/138网页/31真实桌面验收、当前发布提交CI、匿名附件哈希及真实GitHub更新源检查通过。正式安装未自动替换，状态与证据见当前计划及验证记录。

## 使用免安装目录

运行`output/desktop/MotionDeck-win32-x64/MotionDeck.exe`。整个目录须一起保留，不能只复制exe。不需要另装Node、Python，不需要浏览器或8901服务；内置模型随程序提供。

程序使用内部`motiondeck://app/labs/motion/index.html`地址，只加载自有打包资源，不开公网端口。再次启动复用已有窗口。

个人设置默认位于`%APPDATA%\MotionDeck`，不是exe旁边的目录；素材存储为SQLite索引与哈希原文件，默认在系统文档目录的MotionDeck/素材库。右上角设置提供目录、搬迁、备份恢复和清缓存。程序替换与数据分开；不要删除个人设置或素材库。`MOTIONDECK_DATA_DIR`指定绝对路径时工作区与运行缓存一并隔离，测试前后必须一致。详细格式见[数据目录说明](data-directories.md)。

本客户端旧IndexedDB库会经过复制、校验和完整备份后切换到磁盘库，原IndexedDB保留；Chrome或动作工坊旧库不会迁入。GLB/ZIP是素材输出；完整素材库另用设置中的备份/恢复。未保存编排不跨重启恢复，也不进入素材库备份，不默认清理旧库。

## 源码开发

Node24，在仓库根执行：

```powershell
npm.cmd ci
npm.cmd start
```

start自动先构建，再启动Electron。`npm.cmd run desktop:dev`为同等开发入口。Electron44按首次使用准备开发运行文件；若需提前准备，可执行`node -e "console.log(require('electron'))"`。不能假定npm ci后固定的dist/electron.exe必然已存在；首次准备需联网，准备完成后客户端加载本地资源。

旧本机网页仅保留为开发/回归入口：`npm.cmd run dev`，地址8901。它不与客户端共享库，不能用网页数据验证客户端恢复。

## 打包与验收

### 随包技能

仓库`skills/motiondeck-director/`是技能权威源，不在构建时读取开发者的个人技能目录。打包将显式清单复制到EXE旁的`skills/`，不放进ASAR；安装器沿用该完整目录。`skills/使用说明.md`说明整目录复制方法，`skills/manifest.json`记录技能版本及每个文件的SHA-256。不会自动安装到用户的AI工具中。

技能独立使用语义化版本，唯一版本源为`SKILL.md`的`metadata.version`；当前源码为`0.2.1`，不随客户端版本机械递增。后续技能行为、工作流或命令参考改变时检查并调整技能版本；仅打包器改动无需升技能版本。协议变化后运行`node scripts/package-skills.mjs --refresh-schema`，审查生成差异及使用说明，再同步已安装的开发技能。打包发现失效引用、本机绝对路径、非法版本或命令快照过期会失败，不静默分发旧内容。

分发验收需检查免安装目录及隔离NSIS实际安装目录中的技能、版本和文件哈希；只检查暂存目录不能证明安装包包含技能。安装目录随程序升级替换，用户复制到AI工具的技能由用户自行更新。源文件测试为`node --test tests/web/skill-distribution.test.mjs`，不替代发布前完整本地回归。自客户端v0.2.0随包提供，实际发布状态见当前计划。

```powershell
npm.cmd run desktop:pack
npm.cmd test
$env:MOTIONDECK_PACKAGED_EXE = (Resolve-Path 'output/desktop/MotionDeck-win32-x64/MotionDeck.exe').Path
npm.cmd run desktop:test
```

打包先构建和核对18份资源。Packager20使用命名导出packager；只复制显式运行文件与manifest资源到独立暂存目录，不向打包输入复制开发node_modules、测试、缓存或用户资料。源代码和资源进入ASAR，暂存目录保留在忽略的output/desktop/stage-*内，不自动清理用户资料或其他输出。再次打包前关闭该目录启动的客户端。

Electron下载校验使用已安装官方`electron`包的`checksums.json`传给`@electron/get`的`checksums`选项，先确认已安装版本与锁定版本一致，再确认目标校验值有效。缓存ZIP仍由下载器进行SHA256验证，不设置`unsafelyDisableChecksums`。依据为固定依赖`@electron/get/dist/index.js`的`validateArtifact`及`@electron/packager/dist/download.js`的选项透传；这避免仅因每次强制联网重取SHASUMS清单而阻断离线缓存构建，不改变版本或安装更新校验。

桌面测试用独立临时数据目录，会显示不抢焦点的测试窗口进行真实录制。测试指定另存为目的地，但不伪造下载内容；核对Electron DownloadItem完成状态和磁盘文件，GLB/PNG回读、视频FFmpeg解码。导出视频保持当前视口比例，不承诺固定1920×1080。

## 桌面图标

`npm.cmd run build:desktop-icons`复用web/icons-data.js中的Lucide胶片标识，生成desktop/assets下的SVG、256像素PNG和多尺寸ICO。打包自动重新生成，窗口配置与EXE打包配置使用同一ICO，不仅修改网页标题栏。Sharp/png-to-ico仅为构建依赖，不进入应用归档。

图标验收读取包内ICO，并用打包器已有的resedit解析EXE，逐项比较九种尺寸的图标资源原始字节；另外通过Windows实际提取EXE图标，保存在隔离资料目录的exe-icon.png供视觉核对。不要直接比较不同尺寸重采样后的像素，那会因抗锯齿差异误报。来源：[Electron图像格式](https://www.electronjs.org/docs/latest/api/native-image)、[Sharp图像输出](https://sharp.pixelplumbing.com/api-output/)、[png-to-ico官方实现](https://github.com/steambap/png-to-ico)；Packager的icon选项及资源解析调用以固定版本dist/types.d.ts、dist/resedit.js为依据。

## 安全与发布边界

- nodeIntegration关闭、contextIsolation和sandbox开启；仅提供固定业务桌面桥，校验主帧来源，不提供任意脚本、IPC或文件读写。
- 内部资源只允许GET/HEAD，拒绝目录穿越、其他主机和外部窗口/导航；CSP保持，不绕过浏览器安全限制。
- 不请求摄像头、麦克风等设备权限，录像沿用自有Canvas捕获。
- 鼠标锁定仅为自有本机主窗口的聚焦主页面开放pointerLock，主进程check/request均走permission-policy.cjs；子框架、其他WebContents、其他来源、未聚焦/隐藏窗口及所有设备权限继续拒绝。相机锁鼠须用真实桌面包检查，不以网页通过代替；证据见references/camera-trackball.md。
- 首版提供当前用户NSIS安装器、GitHub更新源和受控更新，保留免安装包；无代码签名。`npm.cmd run desktop:installer`只构建不上传，正式发布需版本、许可、实际安装升级与远端门禁。详见[安装与更新](install-and-update.md)。
- 打包/本地测试通过不等于发布完成。按用户决定，当前 GitHub 自动只跑构建、素材和领域检查；完整网页、真实客户端及 NSIS 升级以本地报告门禁为准，重型 CI 仅手动触发，不部署云端网页。发布前仍须当前提交基础 CI 成功。

## 复盘

最初套用默认导入不适用于Packager20，改为官方命名导出后打包成功；写死开发exe路径不适用于Electron44首次准备流程，改用包的正式路径获取。网页download事件不等于Electron原生下载，验收改用DownloadItem并回读落盘内容。最后收敛为正式API与真实产物验收，未关闭沙箱或用旧网页服务fallback。
