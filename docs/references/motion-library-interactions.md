# 3D素材菜单、确认与整体动作

## 最新交互调整（2026-10-13）

刷新入口restoreLastSaved只导入上次模型并读取其库，不调用展开编排函数；时间轴和撤销历史为空，标题为未命名动作，保存按钮禁用。已删除无调用方的openCustom旧入口，未删除或迁移保存数据。custom-library/prompts-composite等回归覆盖刷新空轴、库条目保留及再次拖入一个具名整体；只保存姿势仍可查看素材，不自动插入时间轴。

下方菜单和双击打开说明为先前实现记录，现已替换：自定义素材右侧悬浮显示垃圾桶，键盘聚焦也可见，默认素材不显示；无右键菜单，删除仍通过deleteLibraryEntry统一确认与事务。自定义动作双击不展开原编排，拖入始终作为完整动作使用。搜索匹配素材主按钮并同步隐藏整行，垃圾桶不参与计数、搜索与拖放。源码入口为motion.js:deletableLibraryRow，样式为motion-theme.css的library-entry/library-delete。

2026-10-13。目标仓库action-forge，入口仍为8900的`/labs/motion/index.html`。用户要求修改素材右键直接删除、系统确认和合并动作拖入仍展开的问题。未改保存素材，未提交/推送/发布，8897未重启；全身姿势试验保持暂停。

## 已改变的交互

- 右键素材只打开菜单：预览、编辑、删除。默认动作/姿势的删除禁用；自定义素材选择删除后才确认。Delete仍复用同一删除入口。
- 6处原confirm调用（删除、同名姿势覆盖、打开动作替换、清空、同名动作覆盖、模型切换）统一为HTML dialog站内确认。默认聚焦取消，取消/关闭/Esc均返回false；事务只在肯定后执行。不是浏览器系统弹窗。
- 单击自定义素材仍只预览；拖入生成一个具名整体片段，而不是立即展开内部动作。拖入空轴的新草稿带入名称，但不绑定原素材ID；追加到已有编排不改其标题。保存同名副本仍需覆盖确认，不偷偷覆盖原素材。
- 双击素材/菜单“编辑动作”沿原openCustom路径打开内部编排，替换已有内容须确认。时间轴整体保留原裁剪、变速、分割与撤销路径；内部片段不在时间轴卡片双击展开。

## 输入 → 保存 → 复用

`prepareInsert`读取旧保存动作、decodeAction恢复源动作和姿势 → `makeCompositeClip`包装内部recipeItems及总时长 → 时间轴存一个action片段 → PoseSampler识别recipeItems并通过原compileSequence/sampleSequence在内部采样。没有生成插值帧文件、烘焙GLB或按固定帧率重采样。

整体裁剪/变速先将外部时间映射到整体源时间，再由内部编排映射到原clip时间。取景关键时刻通过clipKeyTimes递归映射，保留内部动作关键时刻和过渡边界。整体缓存归当前PoseSampler，源片段只读，不随时间轴手势修改。

再次保存时encodeAction在clip JSON中保存recipe，包含内部clips/items；decodeAction递归恢复，并核对外部时长与内部时长。嵌套最多8层，超量或损坏显式失败。含整体片段的库格式显式为版本2；现版本读1/2，普通旧库与原文件身份仍保留。版本1中夹带recipe拒绝，旧程序应因版本不支持而失败，不能忽略recipe成为空动画。素材库原命名空间不变，仍走同一IndexedDB事务。

## 源码证据索引

- `motion-prompts.js:createMotionPrompts/showMotionMenu`：统一异步确认、取消默认、菜单与退出事件清理。
- `motion.js:deleteLibraryEntry/openCustom/resetAction/allowModelSwitch`及保存表单：await确认；模型文件、内置模型、已导入模型各入口均await。
- `motion.js:prepareInsert/insertRecipe`：具名整体片段、空轴标题、独立草稿身份，一笔历史事务。
- `sequence-core.js:makeCompositeClip/PoseSampler.sample/clipKeyTimes`：包装、递归原采样和关键时刻，不改原动画。
- `action-library.js:encodeAction/decodeAction/validateLibrary`与`library-schema.js`：嵌入数据、格式版本、递归与时长校验。生成校验器随build:motion-lab重建。

## 验证与限制

`motion-composite.test.mjs`验证普通动作/姿势/过渡混合、整体采样一致（仅允许1e-9浮点舍入差）、裁剪变速、关键时刻映射、版本2保存恢复与时长损坏拒绝。`prompts-composite.spec.js`实际覆盖6类站内确认、取消/关闭/Esc保护、右键不直接弹删除确认、整体再保存刷新仍一段，并断言没有浏览器dialog事件。`library-delete.spec.js`保留默认素材保护、删除失败回滚、删除不动片段；旧浏览器confirm测试同步改为操作站内确认。

完整3D浏览器回归59项通过；最终保存格式补充后再跑定向10项。领域回归39项通过，构建与静态confirm/alert/prompt调用检查通过。截图`output/acceptance/motion-confirm-dark.png`已审阅。现有窗口需要重新载入新bundle；不要擅自刷新用户未保存编排，应先保存再刷新或新开页面。

本次用前端设计技能统一黑灰蓝弹窗和最少菜单项，用文档更新技能区分旧编排与新整体复用。可复用规则：同步确认改异步时必须检查所有调用方，整体动作“视觉合并”必须同时验证采样和再次保存，不能只看卡片数量。
