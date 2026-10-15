# 本机命令与助手试摆

设置中的三项权限使用固定名称的滑动开关：“命令控制”控制总入口，“姿势操作”“编排操作”分别授权。总入口关闭时下级禁用且撤销现有权限；开启下级仍需站内确认，取消不会改变状态，权限仍仅限本次会话。可用键盘聚焦并按空格切换，界面状态通过role=switch与aria-checked表达，不依赖动态按钮文案。

按实际任务学习，先看[姿势、动作制作与检查手册](motion-authoring-guide.md)：从试摆到编排、过渡修帧、节奏/接触验收，附38条命令的参数示例与隔离实操脚本。本页保持协议、权限与边界的权威说明。

## AI工作区（v0.2.0）

任务索引、整理和兼容性以[AI工作区说明](ai-workspace.md)为准。新增1条只读、5条写入，合计8条只读/30条写入。任务写入需要同时启用姿势和编排授权；其余命令沿原授权类别。

| 操作 | args | 行为 |
| --- | --- | --- |
| `workspace.list` | 可选`offset,limit,query` | 分页返回任务ID/状态/正常、旧版、回收数量及当前任务ID |
| `workspace.create` | `name` | 新建并激活当前模型任务，不认领历史素材 |
| `workspace.activate` | `taskId` | 继续制作，包括重新打开已整理任务 |
| `workspace.update` | `taskId,assetId`；可选`role,stage,iteration,state,protected:true` | role为temporary/key/result，state为active/superseded；iteration为1—10000。不接收protected:false，不改人工保留的标记，不允许接管普通或默认素材 |
| `workspace.cleanup` | `taskId,keep`；可选`confirmed:true` | keep为action/keyframes/all；无确认只返回范围，确认后可恢复回收并归档。确认请求沿用预览时的expectedRevision；用户保留项不回收 |
| `workspace.restore` | `taskId` | 恢复该任务回收素材，不自动激活归档任务 |

`pose.save`与`timeline.saveAction`自动归入AI工作区，可选`taskId,role,stage,iteration`；无任务时自动新建任务并在结果返回taskId。姿势默认temporary、动作默认result；同类名称重复仍拒绝、不覆盖。人工保存普通素材不自动归任务。用户在界面保存助手草稿也按AI来源归任务。

`library.list`新增`scope:all/custom/ai`、`taskId,kind,role,stage,iteration,query,includeTrash`筛选，分页在筛选之后计算。默认不返回回收素材，includeTrash显式查询；返回AI条目带任务/用途/阶段/迭代/保护/状态，不返回整份姿势。整理预览返回总数count、保留数retained、至多100条assets摘要及omitted省略数，确认处理完整候选范围。收录、单项回收及解除用户保护仅提供明确界面操作，不加入命令白名单。

## 整体位移输出（v0.2.0）

`preview.setRootMotion({horizontal:boolean,vertical:boolean})`需编排授权、当前模型/版本，无草稿或进行中的拖动；两个字段均必填。默认true/true，设置返回新版本与策略，`session.inspect.rootMotion`可查询。切换立即更新当前预览帧，但不改素材、片段、保存配方或编排历史；切换模型/重启恢复默认。

horizontal控制世界X/Z，vertical控制世界Y；关闭后唯一骨架根在对应轴固定为整段动作第0秒的位置，不是归零，不抹掉子骨关节运动、根朝向和缩放。预览、sequence.sample、截图、视频与烘焙复用core/root-motion.js，源动作/自定义动作也支持预览过滤。多根或不可逆父矩阵在需要过滤时返回UNSUPPORTED_RIG；保留全部不要求单根。

`export.glb`可选`rootMotion:{horizontal,vertical}`，省略继承当前策略；显式覆盖仅本次导出，不改预览，返回结果包含实际策略。普通素材导出弹窗提供同样开关，多个动作分别以自己的第0秒为基准。静态姿势不做位移过滤；pose.fromClip/fromSequence与保存姿势仍使用原始取样，避免反写素材。该功能不包含游戏高度控制、触地约束或提取外部位移曲线。

A1–A4纳入v0.2.0，实际发布状态见当前计划；旧v0.1.1不包含命令入口。客户端提供MotionDeck-command.cmd，复用内置运行时；开发脚本仍可使用Node.js24。无需MCP或云端服务，不包含人体约束、脚底固定或物理跳跃轨迹。

## 动作检查与过渡修帧（v0.2.0）

以下命令复用同一姿势快照、编排事务、采样器和参考捕获。除`sequence.sample`为只读授权外，其余依既有姿势/编排权限执行。新命令均绑定`modelKey`、`expectedRevision`；不能用旧发布客户端调用。

| 操作 | args | 结果与边界 |
| --- | --- | --- |
| `pose.fromSequence` | `time` | 将当前编排任意合法时刻（含过渡、组合动作）完整取成草稿，保留局部位置、旋转、缩放及形态权重；不写库、不清时间轴。放弃恢复取帧前可见姿势与预览上下文，并暂停播放 |
| `timeline.insertPoseAt` | `time,poseId` | 只接受过渡内部时刻，新增零停留连续姿势并拆分原过渡；总时长不变，一步撤销/重做；不在停留、动作内部或过渡端点插入，不自动改变原邻接片段的插值模式 |
| `sequence.sample` | `boneIds`，以及取样时间 | 返回逐时刻骨骼世界位置和四元数；最多600时刻、64骨骼，二者乘积不超过2048。未知骨骼、越界、非递增时间拒绝；不改变播放头、编辑版本或最终可见姿势 |
| `view.captureSequence` | `views`，取样时间，可选`options` | 每个时刻按指定视角输出PNG，图片带秒数和视角标签；返回文件信息与JSON索引路径（模型、版本、时间、视角、参数、摘要）。最多24张图；结束恢复姿势、播放状态与镜头 |
| `export.video` | `name,confirmed:true,start,end`，可选`view,options` | 录制当前编排指定范围，默认front-right视角、1倍速，最多30秒；沿现有编码预检选MP4或WebM，结果返回实际格式、文件路径、字节、SHA256和取样帧数。仅画布，无系统屏幕、摄像头或麦克风权限；录像期间暂时关闭窗口后台节流，完成或失败后恢复，取样不足明确报错 |
| `view.capture` 扩展 | `views,options?` | 单帧截图也支持统一取景参数；已有仅传views的调用仍可用 |

取样时间有两种写法，不能混用：`times:[0.2,0.6,1.0]`；或`start:0,end:1,step:0.1`。范围包含终点，若步长不能整除，末尾单独补终点；时刻必须在当前编排范围内。大批量检查先粗后细，避免一次输出大量相似图片。

`options`可设置`width`（320—1920，默认1280）、`height`（240—1080，默认720）、`ground`（地面网格，默认false）、`skeleton`（骨架，默认false）及`framing`：

- `motion`：默认。对采样范围计算动作包围盒，每个视角固定一台输出相机，整个批次镜头不跟随人物。单帧编排截图按整段编排适配；草稿/源动作单帧按当前姿势适配。
- `pose`：每张图片按当前姿势全身适配；视频在起始姿势取景后保持固定，不能保证后续极端姿势全身入镜。
- `current`：使用当前预览镜头的副本及指定输出尺寸，不重新取景；仍通过命令捕获画布。多个views在此模式下都使用当前镜头，建议只传一个。

动作包围盒复用30Hz及蒙皮网格边界计算，最多2400取景时刻；过长范围显式拒绝，改用较短检查范围或pose/current。固定取景改善裁切，仍须看真实输出；地面网格只提供参照，不具备碰撞、地面约束或穿透检测功能。

例如修正0.4秒过渡：先`pose.fromSequence({time:0.4})`，再`pose.setBones`，用`view.capture`检查后`pose.save`。拿新姿势ID执行`timeline.insertPoseAt({time:0.4,poseId})`，最后以`view.captureSequence`检查前后区间。每一步使用前一步返回的新版本，不猜版本。

```json
{"operation":"view.captureSequence","modelKey":"<模型哈希>","expectedRevision":12,"args":{"start":0.2,"end":0.6,"step":0.1,"views":["right","front-right"],"options":{"width":1280,"height":720,"framing":"motion","ground":true,"skeleton":true}}}
```

媒体过程固定模型和编排版本，忙碌状态拦住编辑。输出在配置导出目录的“助手预览”（PNG及索引）或“助手导出”（视频），使用随机名，不接受任意路径、不覆盖旧文件。索引只引用受控目录中真实PNG并核对SHA256。批量中途失败保留已生成图片，不承诺磁盘文件整批回滚；请求编号去重可查结果，勿换号重发导出。

录像调度依据[Electron后台节流接口](https://www.electronjs.org/docs/latest/api/web-contents#contentssetbackgroundthrottlingallowed)：后台节流影响动画、计时器和页面可见性。`desktop/main.cjs`仅在`export.video`请求期间保存/关闭/恢复该开关；`platform/control-media.js`复用`ReferenceCapture.record`，命令明确选择计时调度，普通界面仍使用重绘回调。仅关闭节流未解决最小化窗口重绘暂停，因此不保留已失败的重绘路径作为命令兜底；行为依据[requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)及[requestFrame](https://developer.mozilla.org/en-US/docs/Web/API/CanvasCaptureMediaStreamTrack/requestFrame)。以真实时间捕获画布（目标30fps），额外拒绝低于8次/秒的命令取样。不保证固定30fps编码，最终帧数与时长需用真实媒体回读验证。

## 启用与查询

1. 打开包含 A3 的客户端，等待模型加载完成。
2. 正式客户端在“设置 → 本机命令 · 仅查询”点击“启用命令控制”。正式客户端启动默认关闭，关闭、刷新或重启后需重新启用；开发预览的例外见下文。
3. 用设置中显示的**个人数据目录**明确选择实例；不要把素材库/导出目录当个人目录，也不要猜最近窗口。

在仓库根目录运行（下面目录是正式产品默认位置，隔离预览应替换成实际个人目录）：

```powershell
node scripts/motion-command.mjs --data-dir "$env:APPDATA\MotionDeck" --operation session.inspect
node scripts/motion-command.mjs --data-dir "$env:APPDATA\MotionDeck" --operation model.inspect
node scripts/motion-command.mjs --data-dir "$env:APPDATA\MotionDeck" --operation rig.list --offset 0 --limit 20
node scripts/motion-command.mjs --data-dir "$env:APPDATA\MotionDeck" --operation library.list --limit 20
```

只读授权开放 `session.inspect`、`model.inspect`、`rig.list`、`library.list`、`request.status`、`timeline.inspect`、`sequence.sample`。返回一条 JSON；成功退出码 0，失败退出码 1。查询包含会话、模型身份和编辑版本，骨架/素材分页最多 100 项；不会返回可写模型对象，也不会持久改变姿势。

复杂请求使用 `--request <UTF-8 JSON文件>`，文件包含 `operation`、`args`、可选 `requestId`；写操作另需 `modelKey`、`expectedRevision`。例如查询某次请求：

```json
{"operation":"request.status","args":{"requestId":"previous-request-id"},"requestId":"status-query-id"}
```

令牌、会话和协议版本由脚本从受限发现文件附入，不需手写，不要把发现文件发送给助手或提交仓库。`--operation` 与 `--request` 二选一；帮助入口 `node scripts/motion-command.mjs --help`。

## 生命周期与错误

- 未启用/已退出：`NO_INSTANCE`。脚本不自动新开空客户端。
- 权限或认证不符：`AUTH_FAILED`；旧会话 `SESSION_CLOSED`。
- 操作非白名单、未知字段或非法分页：`INVALID_ARGUMENT`。姿势与编排写入分别需要授权，否则 `WRITE_DISABLED`。
- 模型加载/工作台占用：`NOT_READY` 或 `BUSY`；会话查询可报告 loading/busy，但骨架/素材不读取半完成状态。
- 只读查询10秒、姿势/截图30秒内未获结果：`RESULT_UNKNOWN`，保留原请求编号先查状态，不换编号盲目重试。主进程等待上限对应9/29秒；超时不保证回滚，迟到结果不覆盖已结束请求。必要时重新读取草稿与素材，不盲目再次保存。
- 批量截图和视频是受限长操作，单独采用90秒请求预算（主进程89秒），原查询和写入预算不变；视频最多30秒，批量最多24张。`request.status`由主进程直接响应，可查询pending/done；长操作期间其他渲染请求会排队，不要反复发送新请求。
- 去重缓存为本次启用会话最多 256 条；相同编号/内容复用结果，内容改变返回 `REQUEST_ID_CONFLICT`。缓存过期状态为 unknown，不保证跨重启恰好一次。

切换模型不重建服务，但未保存试摆先确认放弃；刷新/退出有未保存提示，保存/截图请求执行中拒绝关闭或更新。禁用控制/刷新/重启使令牌和写授权失效；禁用不会默默丢弃草稿，仍可用界面保存/放弃。正式客户端的授权不持久化，不随启动打开。

### 开发预览默认授权

`npm start` 和 `npm run desktop:dev` 使用开发启动脚本；未显式指定资料目录时，脚本将其隔离到 `output/dev-preview/personal`，并启用本机命令、姿势操作和编排操作，便于反复试摆。指定 `MOTIONDECK_DATA_DIR` 时沿用该明确目录。单独启动验收包也可设置 `MOTIONDECK_DEV_AUTO_CONTROL=1`，但必须同时明确指定隔离的 `MOTIONDECK_DATA_DIR`，且包名必须为 `motiondeck-acceptance`；正式 `motion-deck` 包即使收到这些环境变量也不会自动授权。开发预览刷新或重启后会重新开启三项授权；本次会话仍可手动关闭。此例外不改变令牌校验、操作白名单、模型身份和编辑版本核对，不能用于正式个人资料目录。

## 助手试摆闭环（A3）

设置中启用只读控制后，点击“允许姿势操作”并确认。仅当前会话有效，随时可在没有执行中请求时撤销；不要向不可信本机程序提供个人目录/凭据。

| 操作 | args | 行为 |
| --- | --- | --- |
| `pose.fromClip` | `clipId`, `time`（秒） | 从当前模型动作取帧，暂停播放并建立完整草稿；不清编排 |
| `pose.setBones` | `changes:[{id,quaternion,position?}]` | 1–256根骨骼局部绝对旋转，四元数 `[x,y,z,w]`，单位长度误差≤1e-5；可选局部位置 `[x,y,z]`（模型单位，各分量绝对值≤100），用于保留动画采样的骨盆位移；重复/未知骨骼或任一非法数整批拒绝。不自动固定脚底 |
| `pose.undo` / `pose.redo` | `{}` | 一次批量修改对应一步深拷贝姿势历史，最多100步 |
| `pose.discard` | `{}` | 放弃草稿，恢复进入前姿势/预览上下文，不自动播放 |
| `pose.save` | `name`, `confirmed:true` | 通过原库事务追加姿势，最多80字；同名自定义拒绝，不覆盖默认库；失败草稿/历史保留 |
| `view.capture` | `views:["front","right","front-right"]` | 最多3张固定视角，另支持back/left/front-left；复用高清PNG输出并恢复镜头，不接收路径 |

每个请求都带当前查询结果的 `modelKey` 和 `expectedRevision`。例如取帧请求文件（实际身份、版本、动作ID必须从当前查询获取）：

```json
{"operation":"pose.fromClip","modelKey":"<当前64位模型哈希>","expectedRevision":12,"requestId":"pose-start-01","args":{"clipId":"<当前动作ID>","time":0.2}}
```

写请求在服务和渲染层串行执行，执行时核对版本；失败不增加编辑版本。`pose.setBones` 成功版本加一；用响应的新版本继续，不依赖猜测。原界面保守版本可能增不止一次，因此任意界面切换后先重新查询。ID都受模型/会话作用域限制，不跨模型套用。

草稿期间视口出现“助手试摆”操作条，提供撤销/重做/保存/放弃；冲突的源动作播放、素材预览和时间轴编辑会被拦住。用户切模型先确认放弃，普通保存按钮也走同一草稿保存逻辑。未保存时关闭/刷新提示；更新重启要求先结束草稿。不是自动保存工程，应用崩溃/强制杀进程不会恢复未保存草稿。

截图返回实际文件路径、尺寸、字节数、SHA256，写到已配置导出目录的“助手预览”子目录，文件名随机且不覆盖。不把图片base64送入命令结果，不访问任意输出路径。部分截图写入成功后后续视角失败，已生成文件保留，不承诺多文件原子输出。

过程示例：第1轮查询并取近似动作帧；第2轮批量调整并看版本/错误；第3轮获取多视角图检查落脚、穿插、重心，再微调；第4轮按用户授权确认保存，或整步撤销/放弃。合法数值不等于自然姿势，本轮无人体约束、IK或自然语言骨架映射。

## 安全与打包边界

个人目录的 `control/instance.json` 包含本次令牌。服务启用前收紧 `control/` 的 Windows DACL，命令客户端每次连接前核对目录/文件所有者及许可：只接受当前用户与 SYSTEM，拒绝链接、继承宽权限、其他主体或缺少当前用户权限。系统管理员/同用户恶意进程不在隔离保证内。

脚本只接受本机 `\\.\pipe\motiondeck-<随机ID>` 端点，没有 TCP/HTTP 服务。不声称 Node 管道天然拒绝 SMB 远程连接：Node24.14.0的libuv无 `PIPE_REJECT_REMOTE_CLIENTS`。A3延续私有凭据、认证和固定白名单，另增加用户明确授权，拒绝任意代码/路径/编排写入；未改变系统SMB/防火墙，也未做跨机器渗透审计。若令牌被同用户恶意程序或管理员窃取，本次姿势权限可被滥用，这不是强系统隔离；不要在不可信共用账号环境开启。

主进程不持有第二份骨架，固定 IPC 只转发白名单查询/姿势操作，渲染调用共享操作层。令牌不进入渲染页面、结果或日志；固定截图落盘桥仅在已授权截图请求期间接收受限PNG字节。不暴露任意脚本、IPC、文件路径读写，沙箱/隔离/来源校验保持。

ACL 辅助脚本通过 Windows 自带 `icacls` 写 DACL、再独立读取校验；子进程删除继承的 PSModulePath，让 Windows PowerShell 5.1 使用自己的模块。仅为此子进程使用执行策略参数，不更改系统/用户策略。打包仅将 `desktop/control/protect-directory.ps1` 放到 `app.asar.unpacked`，外部 PowerShell 使用明确解包路径，不静默回落其他脚本。

提权进程可能默认以管理员组而非账号SID创建对象。服务初始化的`protect`仅处理控制目录，`seal-file`仅处理服务以`wx`新建的随机临时凭据，并先严格校验私有父目录；只有当前进程确实提权且原所有者为内置管理员组时，才通过`icacls /setowner`明确改为当前账号。随后仍逐项校验所有者和DACL，失败中止。客户端的`verify`始终只读，发现管理员组所有者也拒绝，不替外部路径修复权限，不接受其他账号。没有放宽最终安全条件。

源码依据：[微软新对象所有者规则](https://learn.microsoft.com/en-us/windows/win32/secauthz/owner-of-a-new-object)说明默认所有者来自创建进程令牌，不保证等于用户SID；[icacls文档](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls)定义`/setowner`。落点为`desktop/control/protect-directory.ps1`及`server.cjs`，真实回归为`tests/web/control-protocol.test.mjs`；提权用例需由GitHub Windows运行器实际覆盖，普通本地账号不能冒充已验过该分支。

技术方案见 [assistant-control.md](assistant-control.md)，验证记录见 [verification.md](verification.md)。

### 连续关键姿势（v0.2.0）

`timeline.append`可增加`interpolation:"continuous"`，仅用于姿势素材；其`duration`可为0（无停留），过渡时长仍由`transition`提供。`timeline.resize`也允许连续姿势停留设为0；普通姿势/动作仍至少0.05秒，非空编排总时长须大于0。只有相邻姿势都标记连续时，两者间采用共享切线曲线；正时长停留、硬切和普通动作会分开连续段。保存为资料格式3，不能用旧公开客户端打开该资料。具体算法和例子见[连续采样](references/continuous-pose-sampling.md)。

## A4 编排与整体变换（v0.2.0）

设置中“允许编排操作”是独立的本次会话授权，允许时间轴修改、播放、保存新动作和导出；正式客户端不自动授予姿势权限。两类权限可分别撤销，关闭/刷新/重启全部失效，开发预览的自动重开例外见上文；只有姿势权限不能修改编排，只有编排权限不能改骨骼。截图允许其中任一写权限。保存需confirmed:true且同名拒绝，不覆盖已有素材；删除只移除当前时间轴片段，不删除姿势库。

| 操作 | args | 行为 |
| --- | --- | --- |
| pose.fromLibrary | poseId | 从当前模型保存的姿势建立新草稿，已有草稿未结束时拒绝 |
| pose.setRootTransform | position:[x,y,z], quaternion:[x,y,z,w] | 唯一骨架根的世界位置与朝向，整笔进入姿势历史 |
| timeline.inspect | {} | 片段ID、停留/播放时长、过渡、源范围、时间跨度、播放与历史状态，只读 |
| timeline.append | assetId,duration,transition? | 加入姿势/源动作/自定义动作，最多256片段；不清当前编排 |
| timeline.move | id,targetId,after? | 移到目标前/后；首片段过渡归零 |
| timeline.remove | ids:[片段ID] | 一次删除当前片段，未知/重复ID整笔拒绝 |
| timeline.resize | id,duration | 姿势停留或动作播放时长；动作保留源范围，相当于变速 |
| timeline.trim | id,in,out,duration | 动作源范围和播放时长，姿势不支持裁剪 |
| timeline.transition | id,duration | 设置进入该非首片段的过渡，0秒为硬切，最大5秒 |
| timeline.undo / timeline.redo | {} | 复用界面同一编排历史，不属于姿势历史 |
| preview.sequence | time,playing | 定位并播放/暂停当前编排，时间必须处于总时长内 |
| timeline.saveAction | name,confirmed:true | 新增保存完整编排；失败保留当前编排，不覆盖同名动作 |
| export.glb | name,confirmed:true | 复用原烘焙导出，固定写配置导出目录/助手导出随机GLB，不接受外部路径 |

除timeline.inspect外均要求modelKey和expectedRevision；验证失败不写历史。姿势草稿存在时，编排编辑/播放/保存/导出拒绝，必须明确保存或放弃草稿。正常界面仍使用原入口，命令操作不另建时间轴状态。

整体坐标使用当前工作台的右手世界坐标（Y向上），单位沿模型与导入缩放，不能把任意模型单位都叫米；position为绝对值，各分量限制±100。先从model.inspect.rootTransform读取当前根节点、位置和四元数，再修改。必须存在唯一顶层骨骼；多根骨架及非均匀/反向父级缩放显式拒绝。不修改glTF场景外壳或缩放，位置转换到根骨局部保存，便于已有GLB烘焙保留位移。

原地跳：水平根位置不变，设置不同Y高度姿势。带位移跳：同时设置水平位置与Y高度。两者共用姿势/过渡；没有抛物线自动生成或触地约束。GLB默认保留全部整体位移；需要游戏控制位置时，可显式关闭对应方向的输出位移（见本文“整体位移输出”），不静默删除轨道，也不输出游戏控制器或独立位移曲线。

候选包命令入口位于EXE旁，参数与开发脚本相同，ASCII/CRLF批处理仅设置当前子进程ELECTRON_RUN_AS_NODE，调用ASAR内固定command.cjs，不初始化GUI或素材库。未启用的实例明确拒绝，不自动开新窗口。方案依据[Electron环境变量](https://www.electronjs.org/docs/latest/api/environment-variables#electron_run_as_node)与[运行模式开关](https://www.electronjs.org/docs/latest/tutorial/fuses#runasnode)；当前依赖runAsNode可用，未来禁用该开关时必须先替换命令运行时，不能保留失效启动器。
