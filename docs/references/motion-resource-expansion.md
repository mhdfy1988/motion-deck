# 内置资源扩充与源码证据

2026-10-13。当前模型原文件和内容哈希不变，Quaternius53骨骼、Mesh2Motion66骨骼；不增第三个人偶、不替换白模。8900主入口不变，8897不重启；独立Chrome测试，未操作用户当前页面，未提交/推送/发布。姿势编辑仍暂停。

## 已接入

| 模型 | 原资源 | 本轮新增 | 当前数量 |
| --- | --- | --- | --- |
| Quaternius | 89动作、99姿势 | UAL1根位移10个＋UAL2根位移18个 | 117动作、99姿势 |
| Mesh2Motion | 87动作、无默认姿势 | 官方附加75动作＋取帧16姿势 | 162动作、16姿势 |

新增根位移是对应原地动作的移动版本，不宣称28种全新动作；先比较root位置/旋转轨道差异，未变化的T形、待机等不重复收录。Mesh2Motion75动作与原87无同名或完整轨道精确重复。新增内容在默认库，只读；已有自定义库不移动、不覆盖。中文为展示映射，旧clip名字不改。

简版已去掉“附加库/动作库①②”显示前缀，根位移标记保留；同一模型中文显示名重复时为后续动作加②等编号。例如Consume/Consume Item原名不同但都译为使用物品，Yes/Head Nod都译为点头；仅按原名去重不能发现这些显示碰撞。列表、播放器、源时间轴片段与导出复用同一显示名称表，来源仍在悬浮原名里，自定义名称不处理。高级验证页仍显示原始标识。

16个姿势是明确选定附加动作时间点的快照，包括格斗、拉弓、冥想、睡眠、攀边、攀梯、滑翔、飞行、后空翻、落地、疲惫跪姿、庆祝、砸地、双手释放和跑步。它们不是网上新找到的独立姿势包。Quaternius独立99姿势仍沿用已核对包，本轮未发现可直接接入的新独立姿势包。

## 官方来源与许可

- [Quaternius UAL1](https://quaternius.com/packs/universalanimationlibrary.html)、[UAL2](https://quaternius.com/packs/universalanimationlibrary2.html)：仅免费Standard，包内License.txt为CC0；不把宣传的120+/130+完整收费版本当成免费内容。
- [Mesh2Motion人体附加文件](https://github.com/Mesh2Motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/static/animations/human-addon-animations.glb)、[许可](https://github.com/Mesh2Motion/mesh2motion-app/blob/653a9698f5f315523072f1c3ff3496100401317b/LICENSE-CC0.MD)：官方资源CC0。当前main核对仍为固定提交653a9698f5f315523072f1c3ff3496100401317b，重新下载官方附加文件与本地逐字节相同。
- [Mesh2Motion源艺术仓库](https://github.com/Mesh2Motion/mesh2motion-assets)：主要是Blend源码，不当作现成可直接追加的GLB姿势库；本轮不安装Blender。
- [RancidMilk动捕库](https://rancidmilk.itch.io/free-character-animations)、[CMU原始说明](http://mocap.cs.cmu.edu/)：大量动捕但有禁止直接转售数据等限制，且需要重定向；官方应用的CarnegieMellonAnimations/readme.txt指向此来源。没有因为上层仓库CC0说明就将这些来源受限内容标成CC0；本轮不下载其大包、不内置human-mocap。

## 兼容性处理

首次严格检查Mesh2Motion基础/附加包失败：spine_01位置差约0.0342、63个节点默认变换有差、inverseBind矩阵最大元素差约2.879。故“同名66骨骼直接套原轨道”不合适。

已查官方固定提交源码：

- `src/lib/RigConfig.ts`：Human配置包含base/addon/mocap三文件，位置追踪骨骼pelvis。
- `src/lib/processes/animations-listing/AnimationLoader.ts:process_loaded_animations`：深复制clip，然后调用clean_track_data，再做骨架缩放；不直接使用来源模型的四肢位置。
- `AnimationUtility.ts:clean_track_data/is_rotation_or_position_tracking_track`：旋转＋pelvis位置；动作名末尾RM才保留root位置；丢弃其他位置及缩放。
- 本项目`builtin-expansion.js:mesh2motionAddonActions`只为固定官方66骨骼家族实施这一处理，名字/父子层级及轨道绑定检查不通过即失败；不启用通用重定向、不将旧路径保留为fallback、不改原87动作。
- Quaternius复用default-poses已核对的53/65骨骼映射，不增加猜测匹配。根位移追加通过quaterniusRootMotionActions，与同包标准版对照，阈值1e-5；第一包标准版只用于对照，不把43个标准动作再次全部添加。
- mesh2motionAddonPoses复用PoseSampler；生成后finally恢复节点快照。稳定builtin身份并入现有库事务，跨刷新去重，自定义条目不删除。

## 固定资源

| 文件 | SHA256 |
| --- | --- |
| UAL1-Standard.zip | cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724 |
| UAL1_Standard.glb | 69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997 |
| UAL1_Standard_RM.glb | be684571ed655a1b892c2c07e6e2aeca053b606c442d34004adaf1d944090d01 |
| UAL2_Standard_RM.glb | 814eee878f82934992d3ea746c539df25e981487109c591f5efbb8dd03286f99 |
| m2m-human-addon-animations.glb | a0d64d555e0d492026b72d58bf8e16c5e86779295f9093e376dcc001915c2c95 |

准备资源复用`node scripts/prepare-motion-candidates.mjs`，第一包追加参数`--library-one`；全部只走作者免费标准版路径。浏览器对新资源做SHA校验，文件变化或缺失显式错误，不回退旧库。`node scripts/audit-motion-expansion.mjs`输出骨架差异、去重和计数。

## 验证边界

真实75附加动作在0/25/50/75/100%采样验证有限值、骨骼缩放不变、除pelvis/root外局部位移不变；错误名称/层级拒绝，16姿势生成不改当前模型。Chrome检查新增库、中文名、样例预览、默认不可删除、拖入混排、保存刷新、模型切换及GLB/ZIP导出；俯卧撑和冥想截图已查看。未宣称所有75动作的人体穿插、脚滑或外部引擎表现完美，用户仍需按用途预览选取。

本轮build:motion-lab、领域3项及最终Chrome17项通过，git diff --check通过（仅已有.gitignore行尾提示），8900 HTTP200。更新了因资源数量变化而失效的固定计数测试；暂停的编辑体验测试没有运行。未刷新用户页面、未提交或发布。

游戏素材技能用于资源合同与交付核对，不调用付费生成；文档更新技能同步当前数量、来源及边界。可复用经验：同名同数量不等于绑定兼容，先查作者加载轨道规则；无新姿势包时可明确标注取帧来源，不冒充新的外部资产。
