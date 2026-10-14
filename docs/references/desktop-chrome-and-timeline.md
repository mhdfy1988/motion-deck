# 顶栏、安装目录与时间轴对齐依据

2026-10-14 用户确认的范围：安装选盘保留应用子目录、桌面快捷方式、两条顶栏合并、更新移到设置、片段边缘对齐时间刻度。只改 MotionDeck，现已收口并公开 v0.1.1 未签名测试版，不替换正式安装及个人资料。

## 固定入口与官方依据

- `desktop/main.cjs` 使用 Electron 44.7.0 的 `titleBarStyle:hidden` 和 `titleBarOverlay`，保留原生窗口按钮；`motion-theme.css` 根据标题栏安全区预留窗口按钮空间，顶栏拖动区的控件使用 no-drag。不新增窗口控制 IPC，不放宽沙箱。
- [Electron 自定义标题栏](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar)：原生按钮叠加、安全区与拖动区的官方方案。
- `ui/desktop-settings.js` 先创建设置，再由 `ui/desktop-updates.js` 挂载更新入口；更新控制器、网络下载及安装确认链不复制，更新弹窗关闭后回到设置。
- electron-builder 26.15.3 `templates/nsis/assistedInstaller.nsh` 原来在安装前才补应用名，所以目录页仍显示根路径，且使用字符串包含判断；仅靠旧页面不能保证显示的路径就是实际路径。
- `desktop/installer.nsh` 使用 [NSIS 自带 nsDialogs](https://nsis.sourceforge.io/Docs/nsDialogs/Readme.html) 的官方目录选择器和 FileFunc.GetRoot；构建器关闭标准目录页，由 customPageAfterChangeDir 接入一份自定义页。customHeader 在构建器注册插件与 Modern UI 后展开函数，避免在 include 阶段调用未注册的插件。升级跳过选择页，静默 /D 根路径在 customInit 归一化。
- `scripts/package-installer.mjs` 正式身份创建桌面与开始菜单快捷方式；验收身份不污染用户快捷方式或正式注册。

## 对齐不变式

顶栏与主区共享 --sidebar-width，宽屏 280px、紧凑窗口 232px。分隔线对齐素材栏与预览面板间 8px 间隙的中心，不根据品牌文字宽度估算位置；模型标签及选择框放到右区。最终模型框为 13px 字号、32px 高、176px 宽，保留键盘和切换入口。

零点来自同一轨道左边缘，位置 = 开始秒数 × 每秒像素数，宽度 = 持续秒数 × 每秒像素数。缩放仅改变显示。

此前极短片段的 flex-basis 小于水平 padding 与 border 之和时，浏览器把实际宽度撑大，后续片段累积偏移。默认界面将水平留白转移到子文字，用内阴影画边框，片段盒宽不再受留白撑大。刻度、播放线、拖动比例与采样协议不修改。

同样处理裁剪手柄：3 像素边框会撑大不足 6 像素的片段两端命中区，改为内阴影，宽度仍为向内 20 像素与半片段宽度的较小值。原先短片段不重叠断言保持，不以放宽误差或拉长动作修复。

## 验证入口

### 下拉浮层精修

模型和视角选择保留原 select/value/change 单一接口，只使用 Chromium 自带的可定制选择器（appearance:base-select、::picker、legend、::checkmark）改变显示，不另建同步状态或手写弹层定位。模型为紧凑单列菜单；视角合并为自由视角、平视、斜俯视、等角四组，两列排列，短窗口限制高度并滚动。导入及未保存编排保护仍由原处理器负责。

依据：[Chrome 135 起支持可定制选择器](https://developer.chrome.com/blog/a-customizable-select)、[MDN 分组与样式说明](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select)。本项目固定 Electron/Chrome 运行器实际验证支持；不能因此声称旧浏览器或所有浏览器均有相同效果。新增 dropdown-style.spec.js 验证实际菜单点击、视角分组、窗口边界、Escape/空格键和原模型切换；desktop/chrome.spec.js 验证真实客户端菜单。

### 悬浮与启动取消补充

- 顶栏控件使用明确的浅灰悬浮底色与蓝灰按下底色，规则包含控件 ID，避免被原有模型选择样式覆盖；`tests/desktop/chrome.spec.js` 验证实际 hover 的计算颜色及 nativeTheme 固定深色。
- Electron 44.7.0 [WinCaptionButton 源码](https://github.com/electron/electron/blob/v44.7.0/shell/browser/ui/views/win_caption_button.cc) 的 OnPaintBackground 使用系统前景色绘制最小化/最大化悬浮层，而非 symbolColor；关闭按钮使用红色。因此固定深色 nativeTheme，不重写窗口按钮。
- 系统按钮真实悬浮尚未完成有效自动验证：全局鼠标测试受到缩放坐标及实时鼠标移动影响，直接发送非客户区消息也没有驱动原生 hover 状态。撤销本轮新加的无效测试与模拟脚本，失败截图仍在 output/acceptance/motion-caption-hover-*.png；不能以失败截图声称悬浮已通过，也不恢复这些不稳定测试作为自动门禁。
- 新测试曾在 firstWindow 前读取原生句柄失败，退出与初始化重叠：旧主进程在存储关闭后继续 call(info)，导致 null.prepare，并误弹启动失败。主进程复用 init 返回的目录信息，在 await 后检查 quitting，主动退出不再创建窗口/继续加载；真实初始化错误仍弹出，不换空库兜底。`tests/desktop/startup-shutdown.spec.js` 连续 5 次启动即正常退出验证无启动错误框。

- `tests/motion-lab/timeline-geometry.spec.js` 新增默认界面短动作/过渡在多个缩放下对齐断言（误差小于 0.5 像素），保留原有几何、缩放和工具栏稳定性测试。
- `tests/desktop/chrome.spec.js` 真正 Electron 窗口验证叠加标题栏、控件 no-drag、安全区、最大化恢复及设置内更新入口。
- `scripts/test-installer-directory.ps1` 使用 PowerShell 7（避免 Windows PowerShell 5.1 将 UTF-8 中文控件名称按 GB2312 读取），仅允许 output 内 MotionDeckAcceptance 安装器；打开目录选择器检查 D 盘根目录归一化、具名目录及取消，不执行安装。NSIS 解压启动阶段可能存在多个同路径进程，先按完整可执行路径匹配真正目录窗口；模态按钮使用异步消息，编辑框内容使用 WM_GETTEXT，不用跨进程 GetWindowText 的旧标题缓存判断输入。
- 真实产物回归使用独立资料目录、旧客户端及隔离升级安装器，不能称正式环境已更新；再次发布前必须针对最新产物重新通过完整发布门禁。

## v0.1.1 发布收口补充

- 完整网页检查发现 390px 顶栏溢出，保留原断言，针对小窗口收紧品牌、模型区间距与选择框宽度；正常客户端宽度的对齐不变。
- 目录页测试曾用固定延迟等待文件夹弹窗并依赖主窗口 UI Automation 子树，导致查找失败和测试进程残留。逐项核对真实窗口后，改用已有 EnumWindows 按验收 EXE 的进程 ID 查出文件夹窗口句柄，再 FromHandle 定位控件，带明确超时；不跳过目录断言。依据：[微软 UI Automation 元素获取](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-obtainingelements)。D 盘根目录、具名目录和取消的实际检查重新通过，未安装到根目录。
- `tests/desktop/timeline-controls.spec.js` 真实启动最终客户端，实际点击分割、左右裁剪及撤销并核对时长变化。未选片段、选中姿势/过渡或播放头在动作两端时不可用，是现存规则；选中动作会跳回片段开始，需随后调整播放头，上方刻度目前不能点击定位。这些交互限制未在本版改变，不将独立测试通过扩写为用户每一种历史失效均已复现或修复。
- 首轮完整桌面回归在该新增测试的第二次拖放阶段只得到一个片段，尚未进入按钮操作。测试原先主动激活窗口且没有同步显示后布局；复用既有桌面测试的 showInactive、等待两帧布局，并对首次拖放也断言数量后，连续三个独立资料目录均完成实际分割、左右裁剪与撤销。不修改业务算法或删除原断言，初次失败报告保留为 local-desktop-initial-v011.json；再次完整验收仍必需。
