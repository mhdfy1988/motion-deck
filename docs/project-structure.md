# 项目结构与模块边界

2026-10-17 本轮源码整理已收口。身体/手部交互在`pose/`，工具展示在`ui/`，观察相机与取景在`platform/`；播放、保存、模型切换、时间轴及桌面通信按原用例分层，共享唯一状态、草稿与历史，不保留旧路径转发或隐式回退。合理的业务装配仍在组合入口，不以继续减文件体积为目标。演进记录见[结构审计](references/code-structure-audit.md)，当前验证与性能边界见[验证记录](verification.md)。源码完成不等于新包整体验收或发布完成；`npm.cmd run check:structure`仅静态分析，不启动应用或发布任务。

## 可读性与静态检查

开发依赖锁定ESLint 10.13.0、Prettier 3.9.10、globals 17.13.0，不加入正式运行时依赖图。前者用语法作用域检查替代手写关键词扫描，后者提供统一格式和语法等价自检；globals提供浏览器/Node的标准全局集合，不混合两种环境掩盖错误引用。本次安装新增66个依赖包，成本限于开发安装和基础检查，不引入应用框架。参考[ESLint配置与全局](https://eslint.org/docs/latest/use/configure/language-options)、[Prettier CLI与debug-check](https://prettier.io/docs/cli)。

- `npm.cmd run lint`：检查web/labs/motion与desktop内115个手写JS/CJS文件，未定义变量、未用变量和导入为错误，零警告。生成产物、许可证目录及明确的fullbody/fullbody-rig/free-view实验不检查；scripts、tests和归档实验不在本轮lint范围。保留回调参数、catch占位及对象rest排除字段，不借门禁改变接口。
- `npm.cmd run format:check`：只读检查原四个首批文件、四个workbench内部模块，以及desktop/ipc五个模块，共13个文件。
- `npm.cmd run format`：仅重排上述十三个文件；100字符目标行宽、2空格、单引号、LF，不拆字符串或重命名。后续批次先显式扩展命令及对应测试，不整仓write。

基础CI在build前运行lint和format:check；不自动格式化、不恢复自动重型回归。格式化前后用Prettier debug-check及esbuild压缩结果指纹确认等价，行为仍由原定向测试守护。源码字节/行数因版式增大不是结构退化，也不代表性能变化。

## 组件化与分层约定

整理以职责和依赖为准，不以移动文件或套用模式数量作为完成标准。

桌面主入口保留单实例、目录/服务装配、安全窗口与资源协议、设备权限、草稿/写事务退出和更新前检查；固定通信入口迁入desktop/ipc。register统一校验自有WebContents、主框架和精确页面，再调用window、control、updates、settings四组原处理逻辑。control持有原唯一渲染查询表/就绪标记，主进程导航/退出清理时调用cancel；原控制会话仍由control/server持有。窗口、服务和导出目录经getter/回写能力共享，不新增镜像状态或通道，不改变预加载桥。

`desktop/main.cjs`从19174降至11046字节。新增`desktop:test:source`单独配置先build，再用真实Electron源码与mkdtemp隔离资料验证固定IPC、命令往返/截图、不可信窗口拒绝和关闭/重载；不读取验收包变量、不静默回落源码，也不混入正式包桌面门禁。格式/静态检查不等于新包安装验收。

主工作台内部进一步按职责拆分：workbench-queries派生原模型/骨架/素材/会话查询；workbench-pose-operations协调原取帧、单次手势、约束及草稿保存，仍使用pose-draft的快照/历史；workbench-media-operations协调命令批量取样、截图、视频、GLB导出；workbench-library-operations负责原改名事务，并组合已有AI工作区和素材剪贴板。它们不是新的用户保存、预览媒体或素材界面入口，原UI用例层继续委托同一workbench。

工作台职责提取时，workbench-operations从44541降至12998字节；这是该阶段的体积记录，随后增加了播放轻量校验。主模块保留唯一state、节点映射、指纹/版本、订阅通知、校验及预览事务/采样。四模块只接收所需能力，节点Map和适配器经getter取当前对象，取帧后的resetObservation仍回主入口；对外方法清单不变，内部工具不因拆分暴露。查询仍调用原sync/ready，不是无副作用的纯函数。保存失败保留草稿/素材，媒体失败恢复画面/播放/忙碌，保存后展示失败不伪称磁盘回滚。

连续播放中，仅同一模型根且未传预期版本的瞬态采样跳过完整素材指纹扫描，每帧仍检查关闭、忙碌、草稿和就绪；查询、编辑、显式定位、换根与版本校验继续完整同步。不更新观察基线以吞掉界面原地修改，不新增第二套版本或定时扫描；采样失败仍恢复骨架与预览上下文。可复测基准在`scripts/benchmark-preview.mjs`，不包含渲染或用户资料。

模型切换区分准备、写盘、旧场景释放与新场景安装；开始释放旧场景后失败，清理半初始化资源并撤销就绪状态，不恢复已释放对象，可重新加载保存模型。存储线程意外退出含零退出码均拒绝在途及后续请求，主动关闭先等待服务确认再幂等终止；两者都不静默切回旧实现。

| 层 | 当前职责 | 不应承担 |
| --- | --- | --- |
| ui | 接收展示数据、维护DOM/焦点/监听、回调用户意图 | 读写素材库、复制草稿/历史、直接求解骨架 |
| application | 应用用例、展示数据派生、会话授权与事务协调 | 访问DOM、导入交互控件 |
| core | 编码、采样、时间轴与工作区规则 | 界面、桌面桥或反向依赖上层 |
| pose | 显式分开交互协调、辅助渲染与纯骨架求解 | 第二套素材状态、保存或独立历史 |
| platform / desktop | Three.js、媒体、浏览器/桌面存储、安全IPC适配 | 复制应用用例或放开任意文件/脚本入口 |
| motion.js组合入口 | 创建并连接组件、注入回调与适配器 | 持续内联所有展示和业务实现 |

素材库已按该边界拆分：`application/library-presentation.js`派生分组、筛选和计数，输出不携带姿势快照的展示对象；`ui/library-view.js`只渲染这些数据、保留源按钮、搜索/恢复焦点和转交操作。普通库与AI工作区共用createRow，不再各自创建相同的名称/时长/重命名/删除结构。motion.js只协调原预览、删除、重命名及工作区操作，AI推荐的阶段/版本展示仍复用原ui/ai-workspace.js，归属判断仍复用core/ai-workspace.js。

这里采用展示模型、组件工厂和回调注入：输入是展示值与操作接口，输出是DOM和操作意图；素材变化后由原刷新链重新派生，不把展示值作为另一份可写素材状态。组件自己释放监听和自有DOM，销毁不写库；没有新增框架、全局事件总线或依赖容器。

播放也已按该边界拆分：`application/preview-controller.js`统一播放、重播、定位和帧推进，注入原工作台及采样后的展示回调；`ui/player-view.js`绑定原播放/重播/倍速/进度DOM，只渲染控制器快照并发出用户意图。源动作循环、自定义/编排到尾停止、静态姿势无编排不切源；100毫秒帧上限及倍速计算集中在控制器。原state仍唯一持有playing/time/sourceTime/customTime，采样仍归workbench，不新增计时器、骨架或历史。requestAnimationFrame仍在组合入口，只推进控制器并更新相机、编辑辅助和渲染场景；播放栏销毁只解除自有监听。

保存已拆分为`application/user-save-operations.js`和`ui/save-name-form.js`。前者负责用户覆盖确认、条目ID/AI归属与写盘成功后的内存提交；草稿保存仍委托原workbench.saveDraft，不重建历史或授权。后者绑定两份原弹窗，共用名称校验、提交锁、上下文清理和监听释放，不含编码/重名/存储规则。入口只打开弹窗、报告错误和刷新已保存结果；用户保存与工作台的姿势/编排适配共用persistLibraryEntries，仍由原saveLibrary事务落盘。表单保存失败保持打开，取消清本次待提交上下文；这是表单数据，不是另一份权威素材状态。

用户允许确认覆盖，助手命令仍拒绝重名，两者不是可直接合并的相同用例。用户草稿来源覆盖仍绑定模型/版本，自定义及AI姿势保留ID，动作/默认姿势取帧新建，AI覆盖仍与人工保留标记同笔保存。未新增外部命令或资料格式。

模型切换已拆为四部分：`platform/model-preparation.js`解析候选、沿原算法准备内置动作/姿势及校验，失败释放自身候选；`application/model-lifecycle.js`协调确认、恢复、资料提交和同一state的替换；`platform/model-scene.js`适配原Three.js采样器、场景、骨架辅助及网格范围资源；`ui/model-menu.js`只显示目录和转交选择/文件意图。入口只连接这四者并刷新模型名称、骨骼/姿势选项和原预览。不另建模型缓存、会话或持久库。

候选准备和完整资料写入成功前不释放旧场景；随后刷新菜单，再按原顺序替换场景/会话并恢复预览。磁盘事务与场景提交是不同边界：写盘后菜单失败仍可能已更新磁盘；新模型发布后展示失败不承诺回滚，并提示“新模型已提交，初始化未完成”。不得把“旧视口保留”当作全流程磁盘/界面原子回滚。模型重命名及动作/姿势追加入口仍保留原链路，未顺手重写。

时间轴展示已拆为`application/timeline-presentation.js`与`ui/timeline-view.js`：前者把已编译片段转换为无素材引用的展示字段，后者管理片段DOM复用、选中/播放强调、可见刻度、缩放和播放头跟随。显示比例复用`core/timeline-view.js`，默认100像素/秒，只有主动缩放或适合全部改变；添加/裁剪/窗口变化不自动适配。入口仍编译原sequence、规范化原selection；手势、裁剪/变速、拖放与历史仍走原timeline-controller/timeline-edit，不另存播放时间或编排。

控件状态由`application/control-presentation.js`派生，`ui/workbench-controls.js`只刷新原按钮、动态AI工具、录像状态、源卡与过渡提示。原草稿事件隔离、工作台执行检查保留，派生快照不是另一套权限或应用状态；播放栏/姿势工具仍归原组件。

素材维护由`application/library-management.js`协调重命名目标/版本、普通删除、AI回收及剪贴板目标；`ui/library-interactions.js`绑定右键/快捷键并将DOM身份交回用例，销毁清监听。普通删除先写原存储再提交数组，AI回收/重命名/复制粘贴继续委托工作台。`application/model-library-operations.js`协调模型名称与追加素材，`platform/library-imports.js`准备并释放临时模型，`ui/library-file-inputs.js`只转交文件。模型名称复用原save-name-form第三实例，普通界面不因此恢复动作/姿势导入入口。

取景与录制由`application/preview-media-controller.js`协调：沿原会话选择静态/源/自定义/编排计划，复用工作台采样与平台边界计算；截图/录像/取景仍按原规则设置忙碌、暂停与恢复。`platform/reference-scene.js`提供用户与命令媒体共用的独立渲染工厂，保留原相机/尺寸/地面/骨架选项和同步隐藏辅助物后的恢复。`ui/preview-media-controls.js`只绑定按钮、解析录制指示并还原inert/观察控件状态；编码器探测、逐帧录制、停止/取消仍归原ReferenceCapture，未另造实现。

编辑会话由`application/edit-session.js`协调进入/退出确认、面板投影、原草稿历史、桌面脏标记与时间轴可写判断；草稿只来自原工作台，不另存编辑状态。`application/edit-input-policy.js`接收目标分类与草稿来源，返回放行/阻止/草稿历史意图，不读取DOM。`ui/edit-session-view.js`维护原按钮、面板toggle、捕获输入、离开保护及时间轴快捷键，自有重做按钮和监听随销毁清理。原timeline-edit的指针开始/移动/提交门禁继续使用同一会话判断，不能仅拦click。退出取消保留草稿/选择，保存或切模型结束草稿时关闭面板并清选择；销毁退订不放弃草稿，等待中的确认销毁后不再提交。

基础视口资源归`platform/viewport-scene.js`：创建原渲染器、场景、初始相机、灯光、网格及观察控件；尺寸观察按getCamera读取当前相机，切换固定视角后不误用初始相机。`application/workbench-lifetime.js`只明确原关闭阶段：停视图、停编辑/退订、关工作台、停媒体、停渲染/手势/观察、释放模型/渲染器；幂等防重入，失败显式抛出，不声称失败后仍全部释放。pagehide只处理一次，入口取消待执行RAF，两处展示订阅在关闭工作台前退订。

既有设计继续复用：workbench.subscribe承担观察者通知，pose-draft与timeline-history承担可撤销事务，platform存储/媒体与desktop桥承担适配器边界；不为演示设计模式再包装一套同名能力。入口保留业务模块装配、原采样编译适配、相机切换及时间轴/工作台展示接线。tick继续按播放推进、观察控件、身体辅助、场景渲染顺序运行，没有把“组合入口归零”当目标。

## 当前实现索引

编辑布局：`ui/pose-editor-layout.js`只组织原stage/进度/player和姿势工具的DOM归属。正常入口为顶部编辑按钮+右侧占位面板，保存按钮始终在顶部，编辑按钮同时负责原退出确认流程；右栏只与stage并排，进度与播放栏保持viewport直属、跨全宽。布局模块不创建草稿/历史或复制保存逻辑；PoseTools在poseEditorContent内渲染，手部面板沿原宿主工具元素挂载。编辑中显示“退出编辑”，退出后显示“编辑姿势”；异步保存结束仍用aria-pressed=false作为等待条件，文字断言仅验证文案。

手动摆姿收口（2026-10-17）：`pose/body-controls.js`协调选择、场景和局部/整体旋转事务，工具栏展示在`ui/pose-tools.js`，指针坐标/射线/最近节点分流共用`pose/pose-picking.js`，身体/整体拖动适配在`pose/body-pointer.js`。这些模块只借用原BodyControls状态并调用工作台，不拥有第二份草稿/历史。`pose/hand-controls.js`按近景取景、建三点、选指、拖动和恢复镜头分开组织，复用同一命中工具；骨骼求解与约束同属pose目录。已无运行入口的PoseDrag、专属CSS和旧测试归档到experiments/pose与tests/experiments，不作为fallback；详细流程见[手动摆姿源码索引](references/manual-limb-editing.md)。

观察相机收口：正式`motion.js`只依赖`platform/view-controls.js`的单轨道适配，后者保留稳定camera/target/编辑输入隔离与生命周期接口，不再构造多模式分支或飞行监听。模式下拉及其专属样式移出正式页面；暂停适配/UI源码快照在`experiments/camera/`，对应旧用例在`tests/experiments/camera/`，不进入正式构建或当前测试目录。`free-view.js`仍供独立`fullbody.js`实验使用，未误删共享能力。固定取景、指节/旋转环测试仍留当前测试目录；当前相机定向验收沿observation-camera与camera-observation，不以历史四模式报告替代。

手部直接编辑：`hand-rig.js`负责两模型指骨/掌面/真实末端标定及表面身份，`finger-ik.js:FingerJointDrag`按三点分别登记一根相邻上游骨，`hand-joint-motion.js`共用受限屏幕误差步进及标定控制角，`hand-controls.js`管理选指、三点显示、近景和手势。手部精调环模块和旧两节指尖CCD已移除，无隐藏回退；复用BodyMarkers与原工作台单骨事务，不新增素材格式/命令/依赖。技术证据与边界见[手部编辑](references/hand-editing.md)。

关节约束A1–A4：`joint-limits.js`是只读标定配置与统一四元数投影层，输入骨架绑定矩阵/候选旋转，输出受限姿态及触边信息；`BodyControls`负责模式和反馈，`LimbIK`/躯干CCD/骨盆保脚求解逐段使用同层，应用工作台仍持有唯一草稿、历史、版本及保存。只约束实际旋转项，不顺带重写旧姿势；`pose.setBones`同层投影并返回实际结果。没有第二份可编辑骨架或新素材格式，详见references/joint-constraints.md。

AI工作区：`core/ai-workspace.js`负责归属、索引不变式与保留策略；`application/ai-workspace-operations.js`复用保存事务与版本发布，`ui/ai-workspace.js`只负责任务面板和确认。控制协议新增显式白名单与双授权，命令保存与普通保存按调用来源分流，不复制动作/姿势算法。元数据与原库同笔格式4存储，不另开数据库；旧格式仍按原链路读取，旧素材不自动认领。设计和限制见ai-workspace.md。

素材剪贴板在`application/library-clipboard.js`，由共享工作台注入就绪检查、版本发布和原保存适配；界面只映射素材身份与快捷键/既有右键菜单。源动作复用`encodeAction`，已保存动作和姿势深复制，不新增存储协议或依赖。只保留会话内快照及模型身份，粘贴始终走原素材事务，成功后提交库与版本，失败不提交；不暴露系统剪贴板、任意数据输入或新外部命令。

2026-10-15。Electron客户端与A1–A4沿用统一采样、模型身份及素材事务，扩展连续姿势和格式3/4，保留旧格式读取与原有编排行为，不是整体重写。最终验收与发布状态见verification.md。

动作检查新增`core/review-plan.js`统一范围取样和媒体预算，`platform/control-media.js`把共享采样、蒙皮取景和ReferenceCapture组合成命令媒体适配；草稿取帧和过渡插入仍在既有应用操作层，不另建骨架或时间轴。`desktop/control/operation-policy.cjs`集中区分只读和长操作预算，`capture-files.cjs`负责受控PNG/索引/视频写入，索引使用预编译Ajv校验。命令字段以docs/command-control.md为权威。

`core/root-motion.js`提供整体位移的唯一过滤算法：按首帧世界位置锁定所选方向、经当前父矩阵转回局部，不修改原始快照。工作台的源/编排/自定义预览、批量采样与媒体调用同一输出处理，GLB烘焙也复用该算法；取帧草稿与素材保存继续使用原采样。策略只存会话，导出可显式覆盖，不加入动作存储格式，也没有新增依赖。

自定义库重命名由`ui/library-rename.js`负责输入，通过`workbench-operations.renameLibraryEntry`验证身份/版本、只读/重名/忙碌条件，再调用现有素材存储事务；提交成功后才更新同一库状态。ID与素材内容不变，时间轴仍是独立快照。界面与业务分层，不新增库协议或复制数据库逻辑；外部命令白名单尚未开放重命名。

## 目录与职责

制作技能的仓库源在`skills/motiondeck-director/`，版本独立；`scripts/package-skills.mjs`校验版本、相对引用与协议快照，按显式清单复制到EXE旁，不纳入ASAR。安装器复用免安装目录，不读取开发者个人技能配置。示例、测试证据和个人资料不进入分发包。

```text
desktop/                         Electron窗口、内部资源协议、安全边界
  preload.cjs                    固定业务桌面桥，不暴露任意IPC或文件API
  ipc/register.cjs               原来源校验与统一固定通道注册
  ipc/window.cjs                 原窗口动作，关闭仍委托主进程保护
  ipc/control.cjs                原待响应表、就绪、响应/取消和授权落盘协调
  ipc/updates.cjs                转交原更新控制器，安装前保护不搬走
  ipc/settings.cjs               原素材/目录方法，使用既有存储并回写导出目录
  storage/                       后台工作线程、SQLite事务、哈希原文件与目录服务
  control/                       A2–A4管道、认证、独立授权、命令客户端与受控输出
web/labs/motion/
  core/                          姿势/编排采样、动作编解码、库schema、历史与显示比例
  application/                   单一会话状态、时间轴操作、模型目录与素材库保存
    workbench-operations.js      唯一版本/节点映射/通知/预览事务及公开门面
    workbench-queries.js         原查询与分页投影，共用sync/ready及实时节点映射
    workbench-pose-operations.js 原取帧/手势/限位/历史与草稿保存协调
    workbench-media-operations.js 命令批量取样/截图/视频/GLB协调，原预算与恢复
    workbench-library-operations.js 原改名事务及既有AI工作区/剪贴板装配
    library-presentation.js      无DOM的素材分组/筛选/计数及展示对象
    preview-controller.js        共享会话的播放、重播、定位、帧推进及播放展示快照
    user-save-operations.js      用户覆盖规则及普通素材提交，草稿委托原工作台
    model-lifecycle.js           模型切换确认、恢复、提交与共享会话替换
    timeline-presentation.js     无素材引用的片段身份、标签、源区间与选中展示字段
    control-presentation.js      原控件可用性与录像展示快照
    library-management.js        素材维护、AI回收、剪贴板与重命名目标
    model-library-operations.js  模型名称、动作/姿势追加与持久化协调
    preview-media-controller.js  原取景计划/截图/录像、忙碌及姿势/播放恢复
    edit-session.js / edit-input-policy.js  编辑会话协调与无DOM输入放行规则
    workbench-lifetime.js        固定关闭阶段与幂等防重入，不创建应用资源
  platform/                      Three.js解析、GLB/ZIP、参考录制、网页/桌面存储适配
    view-controls.js             当前人物中心观察相机
    viewport-scene.js            基础场景/灯光/网格/初始相机创建及动态相机尺寸观察
    view-camera.js / view-presets.js / motion-bounds.js  相机投影、固定视图与取景范围
    model-preparation.js         候选解析、内置包准备与校验，不写库或当前场景
    model-scene.js               Three.js采样器/骨架辅助/网格与场景资源适配
    library-imports.js           高级素材追加的临时模型解析、校验与释放
    reference-scene.js           用户与命令共用的独立拍摄相机/渲染器工厂
  pose/                          身体/手指交互、求解、限位与编辑辅助显示
    body-controls.js / hand-controls.js  选择、手势与生命周期协调
    body-pointer.js / pose-picking.js    手势分派与同一命中口径
    pose-ik.js / body-chain-controls.js  四肢/躯干/骨盆求解
    hand-rig.js / finger-ik.js / hand-joint-motion.js  手指标定与逐节求解
    joint-limits.js               统一关节约束，不拥有草稿或保存
    body-markers.js / body-highlight.js  同帧节点和人物强调
    rotation-rings.js / whole-rotation.js  三轴环适配与整体变换
  ui/                            时间轴指针输入、站内确认、导出选择及桌面目录设置
    pose-tools.js / pose-editor-layout.js  姿势工具展示与编辑布局
    library-view.js              普通库/AI共用素材行、搜索、焦点与组件销毁
    player-view.js               原播放栏/倍速/进度DOM绑定与展示，无播放模式分支
    save-name-form.js            姿势保存、动作保存及模型改名共用的表单绑定与清理
    model-menu.js                原模型菜单目录展示、文件选择及监听释放
    timeline-view.js             片段DOM、刻度/缩放、选择/播放头展示与监听释放
    workbench-controls.js        按钮/源卡/过渡/录像状态展示，不执行业务事务
    preview-media-controls.js    拍摄/取景按钮、录制指示、交互锁与文件名展示
    edit-session-view.js         原编辑按钮/面板、捕获输入、离开保护与快捷键生命周期
    library-interactions.js / library-file-inputs.js  菜单、快捷键与文件输入适配
  motion.js                      界面组合入口、展示刷新和剩余应用编排
  index.html / motion*.css        既有正式界面
  styles/base/                   基础、姿势输入、时间轴、布局、素材/播放样式
  styles/theme/                  编辑、控件、工作区、时间轴、素材输入、桌面弹窗、尺度、协作、设置与模式样式
  fullbody.* / free-view.js       独立全身实验，不进入正式工作台依赖图
  pose-import.js                 默认姿势转换仍使用的共享能力，非已开放的用户导入入口
experiments/                     暂停方案源码快照，不作为正式入口或静默回退
fixtures/                        按manifest核对的内置模型与许可
scripts/                         构建、资源校验、桌面打包、本机网页开发服务
tests/web/                       核心与模块边界测试
tests/motion-lab/                 浏览器回归
tests/desktop/                    显式正式包/验收包身份下的真实ASAR产物验收
tests/desktop-source/             独立隐藏源码桌面定向检查，不替代产物验收
output/desktop/                  忽略的本机免安装产物，不是用户素材目录
```

## 状态与调用

Electron主进程→内部`motiondeck://app`资源→原工作台界面→应用操作层→核心/平台模块。

- 渲染进程只有一份会话状态，主进程不复制Three.js场景、骨骼或编排。
- 界面输入调用`application/timeline-controller.js`移动、删除和裁剪/变速；控制层不查DOM，撤销事务与展示刷新仍由组合入口组织。
- `core/action-codec.js`承担已有动作编解码、库校验和姿势形状校验，不访问IndexedDB；素材保存服务继续保证模型记录、目录和最后指针同事务提交。
- `platform/motion-export.js`直接使用核心编解码/采样，不经存储服务；导出仍用克隆模型，不释放可见人偶共享网格。
- 页面关闭沿既有pagehide链路释放录制、控制器、模型和渲染器；Electron随窗口关闭退出，不启动独立HTTP后台。
- `application/action-library.js`保留显式编解码再导出作为公共库接口，不含旧算法fallback。迁移后的调用方和测试路径已更新。

## 源码证据索引

| 位置 | 依据 |
| --- | --- |
| `core/sequence-core.js` | capturePose/applyPose、PoseSampler、compileSequence/sampleSequence保留原计算 |
| `core/action-codec.js` | encodeAction/decodeAction与validateLibrary/validatePoses从存储文件分离 |
| `application/session-state.js` | createSessionState创建组合入口使用的唯一状态对象 |
| `application/timeline-controller.js` | createTimelineController不依赖界面，直接操作同一状态 |
| `application/action-library.js`、`application/model-catalog.js` | 继续通过platform/indexeddb-store提交关联记录 |
| `desktop/resource-policy.cjs` | 内部GET/HEAD资源、主机/path校验与CSP，不是命令接口 |
| `desktop/main.cjs` | 沙箱、上下文隔离、禁用Node、新窗口/导航/权限限制与单实例 |
| `scripts/package-desktop.mjs` | 仅从显式暂存目录打包；manifest资源、ASAR、无开发node_modules |
| `tests/web/module-boundaries.test.mjs` | 核心不反向依赖上层；核心/应用无DOM；导出不依赖存储 |
| `tests/desktop/client.spec.js` | 实际生成物回读与重启恢复，不以窗口启动代替功能验收 |

## 已实现的共享操作层

A1 新增 `application/workbench-operations.js`，提供同一会话的模型/骨架/素材查询、预览取样、保守编辑版本与最小取帧草稿。界面源动作、编排、自定义动作及姿势预览调用这层；保存姿势弹窗取样沿 `captureCurrent`，保持原预览上下文。`tick` 以内部 transient 推进，不逐帧增加编辑版本，草稿期间不推进。

模型节点ID按当前根遍历建立，重名骨骼不合并；查询值不暴露模型对象。A3的 `application/pose-draft.js` 已承担完整节点快照、整批局部旋转和100步姿势历史；取帧/写入失败恢复完整姿势，放弃恢复进入前上下文但不自动播放。保存与高清截图通过应用适配回到既有平台链路，草稿冲突输入/退出有保护。见[技术方案](assistant-control.md)和[当前计划](stages/current-todo.md)。

## 历史体积记录与未覆盖范围

以下首段记录第十一轮目录拆分收口时的边界和格式化前体积；此后第二项可读性整理已增加上文的开发工具依赖，入口因可读排版变为57845字节，不能沿用48754字节当作当前体积。

`motion.js`已抽离素材列表、播放、用户保存、模型切换、时间轴展示、控件状态、素材维护、取景/录制、编辑会话及基础场景创建，入口由约86KB降至48754字节。关闭阶段显式化，合理的模块装配和帧顺序仍在入口，不继续为缩文件拆接线。CSS两个旧入口保留明确顺序的import清单，规则归属15个base/theme文件。目录拆分阶段经合并指纹确认等价；后续去重已删除33条经CSSOM确认、被后续同选择器无条件常量覆盖的旧声明，主要统一尺寸/排版归theme/layout-sizing，末刻度规则归theme/timeline。默认与高级界面多状态全计算属性/伪元素对照一致；规则文本指纹不再要求匹配删除前。变量回退、兼容前缀、响应式及不同状态仍保留，不声称CSS冗余全部清尽，也不承诺由此改善性能。目录与组件分层不等于人体约束、穿模或性能问题已解决；本轮不引入依赖、另一套状态或发布产物。

A2新增 `core/control-schema.js` 与ESM/CJS校验器、`application/control-queries.js`固定映射、`ui/desktop-control.js`固定桥接、`desktop/control/`管道/ACL/认证。A3增加独立姿势权限、写请求串行/版本校验和固定PNG桥。A4增加 `application/timeline-operations.js`适配原时间轴控制器/历史/采样；姿势库草稿与整体根骨变换仍在共享workbench，保存/导出通过motion.js适配原平台链。`desktop/control/cli.cjs`由开发脚本和内置command.cjs共用，验收包的MotionDeck-command.cmd复用Electron运行时；受控GLB与PNG共用固定落盘目录检查。去重限本次会话；两内置模型的自然约束已在开发源码实现，物理跳跃及MCP未实现。助手操作A4与关节约束A4是不同阶段编号，用法/限制见[command-control.md](command-control.md)。

完整磁盘素材库备份、本客户端旧库迁移、NSIS安装和受控自动更新已实现；不迁移Chrome网页或动作工坊库，不备份未保存编排。内部资源协议绝不承担任意代码执行入口。ASAR 仍归档应用代码，仅 ACL 辅助 PS1 明确解包供外部 PowerShell 使用，真实包验收检查完整解包清单。
