# 安装与更新

## 使用方式

`v0.2.0`发布候选：Windows x64安装包`MotionDeck-0.2.0-setup-x64.exe`，包含本机命令、AI工作区及随包技能`0.1.0`，仍未签名。升级前使用设置备份素材库并保存编排。新客户端读取旧格式1/2；新连续姿势或AI工作区写为格式3/4后，不支持用v0.1.1等旧客户端打开，不能通过降级程序实现资料回退。随包技能使用见[说明](../skills/使用说明.md)。实际发布及验收状态以推进板为准，下文v0.1.1/v0.1.0均为历史。

v0.2.0更新区在设置中同排显示当前版本与单个操作按钮；状态用按钮文字表达（检查中/已是最新/下载更新/重试/重启更新），只在下载时额外显示进度。无独立标题、下载页面或常驻说明；免安装/开发包不支持原位更新时按钮禁用，原因放在悬停提示。安装前仍确认未保存内容风险；更新服务、SHA512校验、重试、普通退出不安装等边界不变。以下v0.1.1/v0.1.0界面描述为历史升级参考，不是新版操作入口。

v0.1.1 已公开：使用 NSIS 自带 nsDialogs 目录选择页，浏览磁盘根目录立即显示应用子目录（如 D:\MotionDeck）；手写根路径在离开页面前归一化，已有具名目录不重复追加，浏览取消保留原路径。保留当前用户安装、磁盘空间检查及个人资料隔离。正式包启用桌面快捷方式，验收包仍不创建快捷方式。手动更新移至“设置 → 检查更新”，启动后台检查及下载/确认重启逻辑不变。下文保留 v0.1.0 的历史发布记录。

历史Windows x64安装包 `MotionDeck-0.1.1-setup-x64.exe`及`MotionDeck-0.1.0-setup-x64.exe`仍保留。各版均仅安装到当前用户，可以选择安装位置，不要求管理员权限。安装文件和个人资料是两类目录：卸载或替换程序不删除素材库、个人设置、导出和备份。下载入口为本仓库的 GitHub Releases。

本版没有签名证书，Windows可能显示未知发布者或安全提示。仅在确认文件来自本仓库发布页后运行，不建议关闭系统安全防护。下载校验保证文件与发布元数据一致，不等于验证发布者身份。

v0.1.1 安装版通过“设置 → 检查更新”检查版本（v0.1.0 仍是顶栏“更新”）；启动后也会后台检查一次。发现新版后由用户点击下载，显示进度，可以取消或重试；下载完成且SHA512校验通过后，点击“重启更新”并确认，客户端才退出并安装。普通退出绝不自动安装。未保存编排不自动恢复，安装前需保存。免安装版和开发入口不支持原位更新，可通过“下载页面”获取新包。

第一版全量下载安装器，不启用差分下载，也不承诺断点续传；取消/失败可重新下载，官方缓存复用前仍校验完整性。暂不提供跨平台安装、自动降级、签名更新或静默强制升级。

## 工程边界

- `desktop/updates/controller.cjs`：项目自己的检查、下载、取消、确认安装状态，不实现网络传输或更新文件解析。
- `desktop/updates/runtime.cjs`：固定版本electron-updater 6.8.9 的NSIS适配。关闭 `autoDownload`、`autoInstallOnAppQuit` 和降级；固定公开仓库来源，日志写入个人日志目录，缓存写入配置缓存目录。
- `scripts/package-installer.mjs`：electron-builder 26.15.3辅助安装器，仅当前用户、可选安装位置、不删除个人资料；发布行为为never，构建不会自行上传。
- 预打包输入跳过构建器afterPack，因此按官方配置字段显式生成 `resources/app-update.yml`；不设置虚构的publisherName。
- 测试发行版使用独立应用身份MotionDeckAcceptance，仅在显式隔离资料目录下允许本机127.0.0.1更新源；正式包不允许该覆盖。测试升级不自动重启，以便验收同一资料目录。

## 源码依据索引

以下均以锁文件固定版本为准，不能套用官网v27 NEXT的未发布参数：

| 来源 | 核心行为和落点 |
| --- | --- |
| [v26 自动更新](https://www.electron.build/v26/docs/features/auto-update/) | 使用官方更新器及安装器元数据，不手写下载校验协议 |
| [v26 NSIS](https://www.electron.build/v26/docs/nsis/) | 辅助安装、当前用户、不删除个人资料 |
| `electron-updater/out/AppUpdater.js`构造函数 | 默认构造创建Electron网络执行器，传自定义AppAdapter则不创建；本项目保留默认初始化，仅重定向缓存根目录 |
| `electron-updater/out/BaseUpdater.js` | 关闭退出时安装；明确调用quitAndInstall才开始安装，进程退出仍由原before-quit存储收尾链处理 |
| `electron-updater/out/NsisUpdater.js` | 官方SHA512下载验证及NSIS执行路径；无publisherName时没有证书身份验证 |
| `app-builder-lib/out/publish/PublishManager.js` | afterPack生成app-update.yml，包含provider/owner/repo/updaterCacheDirName；prepackaged需显式补齐 |
| `app-builder-lib/templates/nsis/include/multiUserUi.nsh` | customInstallMode可强制当前用户，避免显示所有用户安装选项 |

## 依赖风险

2026-10-14 npm审计报告7项中等级告警，均是同一sprintf-js漏洞沿安装构建工具依赖链传播，详见[GitHub安全公告](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)。当日无修复版本。构建使用受控配置；客户端打包不复制开发node_modules，更新运行bundle元数据不包含sprintf-js、roarr或global-agent。不能把“未进入运行包”说成npm审计零告警，也不使用强制降级替代调查。

lazy-val 1.0.5的npm包及上游均未附独立许可文件，保留[上游MIT声明和作者](https://github.com/develar/lazy-val/blob/master/package.json)，附明确标注的标准MIT文本。仅此固定版本允许补充，其余许可缺失继续阻止构建。

## 验收状态

2026-10-14 已公开[v0.1.1未签名预发布版](https://github.com/mhdfy1988/motion-deck/releases/tag/v0.1.1)，标签指向 fd16166，基础 CI 38566763480 成功。18素材/55领域/55完整网页/8真实桌面及3项新包实装检查通过；四个附件匿名下载字节与哈希一致，隔离旧客户端通过真实 GitHub 更新源识别 0.1.1 后卸载。正式用户安装及资料未替换，安装包仍 NotSigned。

2026-10-14已公开[v0.1.0未签名预发布版](https://github.com/mhdfy1988/motion-deck/releases/tag/v0.1.0)。本地完整门禁、真实NSIS升级、公开安装包/更新文件匿名下载哈希校验均通过；隔离旧客户端已通过真实GitHub更新源识别0.1.0。正式用户环境未安装或迁移，签名、跨平台与其他暂停能力仍未实现。结果见`docs/verification.md`。
