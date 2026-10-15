# 助手操作层：技术方案

AI工作区扩展：助手命令保存按制作任务记录来源，任务索引与动作/姿势同笔保存，不复制模型或编排逻辑；38条命令中包含6条任务管理入口。收录由用户界面确认，整理以版本绑定的候选预览和可恢复回收为边界，不删除历史自定义素材。任务管理写命令需姿势/编排双授权。实现结构与数据格式4见[AI工作区](ai-workspace.md)，当前验收状态以verification.md为准。

2026-10-15。A1–A4及检查/工作区能力纳入v0.2.0发布范围，技能独立版本0.1.0；本文说明实现边界，不以源码具备推断版本已发布。实时发布状态见[当前计划](stages/current-todo.md)，当前用法见[命令说明](command-control.md)。

## 目标与范围

用户描述想要的姿势或动作，助手通过本机命令修改用户正在看的模型，取多视角图检查，确认后保存，再复用现有编排与导出。第一版先打通可控、可撤销的闭环，不承诺一句话自动生成自然动作。

现已在Windows Electron源码中支持两个内置模型、查询骨架/素材、动作及编排取帧、骨骼修改、截图、撤销、保存姿势、编排与导出；另有批量轨迹/图片检查和命令视频。共享连续关键姿势采样已接入；人体约束、逆向运动学（IK）和MCP仍为后续增强。各项实际验收与发布状态见verification.md，公开v0.1.1未含命令能力。

不部署云端、不内置大模型、不重写编辑器、不恢复暂停的实验入口。网页开发界面复用操作层，但第一版不增加网页远程控制服务。

## 技术选择与调用链

| 环节 | 选择 | 理由与成本 |
| --- | --- | --- |
| 外部入口 | 开发Node.js24脚本与验收包内置MotionDeck-command.cmd，JSON文件输入/简短JSON输出 | 共用CLI解析和协议客户端；包内入口复用Electron官方Node模式，不要求用户另装Node |
| 本机连接 | Node `net` 的 Windows 命名管道 | 不新增 HTTP 端口或服务框架；跨平台套接字后续验收 |
| 桌面桥接 | 固定 Electron IPC 通道和 preload 方法 | 保留沙箱、上下文隔离及来源校验，不暴露任意 IPC/脚本执行 |
| 参数校验 | 复用已有 Ajv，构建期生成独立校验器 | 已有 schema 构建链可复用，不新增依赖，不手写完整校验器 |
| 编辑执行 | 渲染进程内统一应用操作层 | 一份模型状态，命令修改就是用户看到的修改，不模拟鼠标点击 |
| 保存/输出 | 现有素材库事务、后台 SQLite、截图与导出适配 | 不另造库协议、不直接写数据库；失败显式返回 |

```text
助手 → 命令脚本 → 本机管道 → 主进程认证/路由
                                  ↓ 固定 IPC
界面操作 ─────────────────→ 渲染进程应用操作层
                                  ↓
                       唯一会话 / 姿势草稿 / 编排
                                  ↓
                      既有采样、保存与导出模块
```

主进程不维护第二份骨架，只负责连接、认证、生命周期和受控文件能力。切模型、取帧、改姿势、改编排、撤销/重做等界面写入必须走同一事务入口；未适配的操作先使命令失败，不允许绕过版本计数。播放帧和相机移动不逐帧增加编辑版本，姿势写入前暂停播放。

`application/workbench-operations.js`负责共享查询/取样/草稿事务；`application/pose-draft.js`已新增完整节点快照、批量旋转与100步历史。`core/control-schema.js`、`application/control-queries.js`采用固定协议与映射，A3扩展授权操作，不动态索引工作台方法。`desktop/control/`管理管道、认证、去重与截图文件，`scripts/motion-command.mjs`为外部入口。

A1 内部 API 为 `inspect/modelInspect/rigList/libraryList`、`source/sequence/pose/custom`、`fromClip/discardDraft/captureCurrent`。它们不是已可执行的命令协议；预览函数保留界面兼容语义，`fromClip` 才需要模型身份与版本。源动作 ID 当前为模型/会话内的索引加原名（第三方动作优先已有 libraryId），不能当跨模型全局 ID；A2 协议必须保留模型与会话作用域。

编辑版本是保守失效标记：界面元数据变化在刷新/查询前检测，播放内部推进不逐帧失效；复杂界面动作可能增加不止一次版本。写命令在管道层/渲染层串行，实际执行时再次验证模型与版本。草稿期间冲突界面入口和时间轴拖动被阻止，Ctrl+Z/Y转为姿势历史；切模型、关闭、刷新保护未保存草稿。A4编排预验证候选片段再提交，共用界面历史；界面拖动事务未结束时命令拒绝，刷新失败恢复状态和历史观察。仍不宣称现有界面大组合入口已完全拆净。

## 连接、安全与生命周期

1. 设置中主动启用命令控制，默认关闭；只接本机管道，不监听 TCP。
2. 每次启动生成随机会话 ID、管道名和令牌，发现文件放个人目录 `control/` 下，包含协议版本、会话、PID、端点与凭据，不含素材。令牌不得进入日志或标准输出。
3. 脚本使用明确资料目录发现实例；管道名/PID 不证明身份，连接必须认证会话与令牌。Windows 命名管道不等于当前用户专属权限；必须实际验证发现文件 ACL 和用户访问权限，未通过不得开放。同用户恶意进程不在隔离保证内。
4. 复用已有单实例；正式与验收身份/资料分开。无实例、加载中、过期发现文件显式失败，不猜最近窗口、不自动新开空客户端。
5. 状态为关闭控制 → 启用/等待模型 → ready → busy → ready；退出进入 closing。加载、迁移、录制、导出期间拒绝冲突写入，只读不得返回半完成骨架。
6. 禁用控制撤销凭据、关闭连接；退出/更新先停止接入再收尾已提交事务。页面重载生成新会话、失效旧请求，不承诺恢复未保存草稿。

A2默认只读，A3另需用户确认本次会话的姿势权限；关闭/刷新/退出后禁用，验收不开放正式资料。Node管道不是强制远程拒绝机制，DACL、令牌与明确授权是当前边界；同用户/管理员令牌窃取及SMB强隔离不作保证，详见命令说明。

## 请求协议与失败语义

第一版采用简单 JSON 信封，不手写 JSON-RPC/MCP。UTF-8 JSON 行，每连接一请求一响应；缓冲后按换行解码，覆盖分片、合包、背压。请求上限 256 KiB，骨骼修改最多 256 项；拒绝未知字段、超限及非有限数。二进制文件不走文本回传。

请求字段：`protocolVersion`、`requestId`、`sessionId`、`operation`、`args`；写操作还要求 `modelKey` 和 `expectedRevision`。脚本从发现文件附入令牌，不要求助手手抄。响应含请求编号、`ok`、新版本及精简结果/稳定错误码。

- 查询返回模型身份、编辑版本、状态与能力列表；骨架/素材分页，默认不回传完整姿势。
- 骨骼 ID 绑定当前模型节点索引，名称仅用于显示；重名不得合并。素材用稳定 ID，不用名称或列表位置猜目标。
- 姿势写入串行，在实际执行时再次核对版本、模型、占用。一次批量旋转成功版本加一，失败不加；截图不增加版本；保存和复杂界面刷新后以返回/重新查询版本为准。
- 相同编号/内容返回记录结果，编号相同内容不同返回 `REQUEST_ID_CONFLICT`。去重仅本次会话最近 256 条，不跨重启保证恰好一次。
- 查询等待10秒，普通截图/保存30秒；批量截图和最多30秒的视频有独立90秒请求预算，集中在operation-policy.cjs。超时表示结果未知，不等于回滚；先用原请求编号查询状态，禁止换编号盲目重试。记录过期或会话结束则重新查询状态，由调用者决定，不能自动覆盖。
- 错误码至少为 `NOT_READY`、`BUSY`、`AUTH_FAILED`、`MODEL_MISMATCH`、`REVISION_CONFLICT`、`INVALID_ARGUMENT`、`REQUEST_ID_CONFLICT`、`SESSION_CLOSED`、`RESULT_UNKNOWN`。

## 姿势事务与坐标约定

现有 `capturePose/applyPose` 按模型**全部节点遍历顺序**保存位置、四元数、缩放和形变；不能把骨骼数组直接当完整姿势。建立节点/骨骼映射并绑定模型身份。

取帧 → 克隆完整姿势 → 暂停播放并进入草稿 → 修改候选快照 → 校验全部修改 → 一次应用与刷新 → 记录历史。失败恢复完整快照及模式，不能只回滚部分骨骼；`tick` 在草稿模式不能再次源动作采样覆盖结果。

骨骼批量修改只允许**局部绝对旋转**，右手坐标、四元数 `[x,y,z,w]`，有限、非零且归一化；非法项整批拒绝，不静默截断，不接受未定义顺序欧拉角或逐骨平移/缩放。A4整体变换单独作用于唯一骨架根骨，接受世界绝对位置/朝向，转换成根骨局部快照并进入同一姿势历史；多根骨架及非均匀父级缩放拒绝，模型单位不默认等于米。局部轴不等于人体或脸部朝向，头颈试摆应基于绑定姿态补偿，而非把骨骼轴直接对齐世界坐标。详见命令坐标约定。

现有时间轴历史只比较编排元数据，不能用于骨骼深拷贝撤销。建立姿势草稿历史，批量修改记一条；界面明确当前草稿上下文，撤销/重做作用于草稿。切模型、离开草稿和退出前确认保存/放弃，不自动丢弃编排。

保存复用 `saveLibrary` 及现有校验/事务，追加自定义姿势，不覆盖默认素材；成功返回素材 ID，失败保留草稿。保存并非跨进程自动备份未保存工程。

## 操作批次与示例

第一批：`session.inspect`、`model.inspect`、`rig.list`、`library.list`、`request.status`。

第二批：`pose.fromClip`、`pose.setBones`、`pose.undo`、`pose.redo`、`pose.discard`、`pose.save`、`view.capture`。固定视角截图最多 3 张，返回受控输出目录中的路径、尺寸和哈希；不输出 base64，不覆盖已有文件，不开放任意路径写入。

第三批A4（2026-10-15）：姿势库草稿、整体世界变换、编排查询/添加/排序/删除/时长/裁剪/过渡/历史、播放定位、确认保存和固定GLB导出纳入v0.2.0。编排独立授权，不由姿势授权扩大；内置命令入口复用Electron运行时和同一CLI解析。字段及坐标边界见command-control.md，旧v0.1.1不具备这些功能；当前验收与发布状态见推进板。

以准备起跑为例：第 1 轮查询模型/动作，从接近目标的动作取帧，得到草稿和版本；第 2 轮批量调整骨骼，返回摘要/错误；第 3 轮看正面、侧面和斜侧面，检查落脚、穿插、重心，再微调；第 4 轮用户确认保存，或整步撤销/放弃。用户已明确授权成品保存时可直接执行，否则临时试摆只改草稿。后续加入时间轴、过渡、保存动作并导出。

MCP 以后只包装这些操作，不另写业务逻辑。命令也会消耗上下文；默认摘要、分页、批量修改及按需截图减少无效回传，不承诺固定节省多少 token。

## 验收与后续增强

检查扩展复用同一工作台：`pose.fromSequence`完整取样为草稿，`timeline.insertPoseAt`在原事务中拆过渡，`sequence.sample`同步读轨迹并恢复模型，`view.captureSequence`与`export.video`复用ReferenceCapture及受控输出桥。媒体异步期间busy拦编辑，批次固定模型/版本并恢复姿势、播放和镜头；输出索引由Ajv校验且只引用真实受控截图。具体数量/取景/授权约定在[命令说明](command-control.md)，不在本文复制字段表。命令录像使用计时取样及临时关闭后台节流，最小化窗口的真实解码帧数须验收。

- 协议/状态测试：错误认证、超限、分片合包、版本冲突、重复请求、切模型、重载、超时查询、忙碌拒绝、批量回滚和保存失败。
- 实际打包 EXE 使用隔离资料，由外部命令连接；两个模型分别取帧、修改、截图、撤销、保存、重启恢复。画面骨骼与查询一致，不用测试页直调 API 冒充命令链通过。
- 实际多视角图交给用户确认效果；数值合法不等于姿势自然。后续人体映射、支撑点/关节约束、自然语义模板需独立效果门禁，未知骨架显式拒绝。
- 保留完整本地领域/网页/桌面验收并补命令测试，不恢复自动 GitHub 重型回归，不复用 v0.1.1 报告证明新功能。

## 源码与官方依据

复用基线：`application/session-state.js` 创建会话；`application/timeline-controller.js` 已有无 DOM 移动/删除/调整；`core/sequence-core.js` 提供完整捕获/应用/采样；`application/action-library.js` 提供哈希身份和关联保存。A1–A3在此基础上增加共享操作层、姿势草稿和固定命令桥；`motion.js` 仍含播放/刷新组合逻辑，尚未完成A4编排入口抽取。

- [Node.js 24.14.0 net](https://nodejs.org/download/release/v24.14.0/docs/api/net.html#ipc-support)：命名管道传输，认证另行设计。
- [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc)与[安全建议](https://www.electronjs.org/docs/latest/tutorial/security/)：固定桥接和来源校验。
- [Ajv schema 管理](https://ajv.js.org/guide/managing-schemas.html)：预编译校验；本仓 `scripts/build-motion-lab.mjs` 已生成独立校验器。

官方资料只支持工程方案，不代表本仓安全和功能验收已完成。

A2 工程依据补充：[icacls DACL 命令](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls)、[PowerShell 模块路径与中间进程继承](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_psmodulepath?view=powershell-7.5)、[Node 24.14.0 libuv Windows管道创建源码](https://github.com/nodejs/node/blob/v24.14.0/deps/uv/src/win/pipe.c#L505)。固定版本源码证明管道并非天然本机用户隔离；此结论在开放写命令前继续沿用。

A3工程依据：[Three.js四元数约定](https://threejs.org/docs/pages/Quaternion.html)用于局部旋转的xyzw顺序和单位长度校验，落点为pose-draft.js；[Electron离开页面事件](https://www.electronjs.org/docs/latest/api/web-contents#event-will-prevent-unload)用于主进程的草稿取消保护，落点为desktop/main.cjs；[Playwright弹窗处理](https://playwright.dev/docs/dialogs)说明默认自动关闭行为，对Electron已接管的离开确认需避免二次处理，落点为pose-command.spec.js。验收必须同时核对提示触发和取消后草稿仍存在，不能仅取消驱动处理后就宣称保护通过。

A4源码索引：timeline-operations.js复用timeline-controller.js、timeline-history.js和sequence-core.js，在候选编排验证后使用同一历史提交；workbench的根骨世界变换转换到局部快照，position轨道由motion-export.js既有bakeExportAction烘焙，不使用不可导出的场景容器运动；motion.js的sequenceControls同时服务界面与命令定位的名称/播放头刷新。cli.cjs由开发脚本与ASAR内command.cjs共用，package-desktop.mjs生成客户端旁的ASCII/CRLF启动器；官方运行模式与开关依据及限制见command-control.md。真实产物通过timeline-command.spec.js由内置运行时发请求、标准GLTFLoader回读根骨位置，不能只看动画条目数量证明位移保留。
