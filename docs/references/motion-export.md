# 当前模型素材导出

2026-10-13，入口仍为8900的3D页面；不修改8897、不刷新用户页面、不提交或发布。导入动作/姿势与姿势编辑暂隐藏，模型导入保留；播放器右侧保存当前姿势，库标题右侧导出。全身试验保持暂停。

## 输入与输出

- 输入：当前模型的默认/第三方/自定义动作和姿势。未保存编排须先保存到自定义库，导出不创建保存副本。
- 只选动作：一个GLB，一份模型、骨架、材质及多个独立命名动画。保存的合并动作是一个动画，不重新展开为多个动画。
- 单姿势：一个静态GLB，含当前骨架姿势，没有1秒停留动画。多个姿势各一个GLB，用ZIP打包。
- 混选：一个动作GLB加各姿势GLB，打包ZIP。文件名清理路径与危险字符，同名后缀避让；动画同名加序号，不修改库条目。
- 按钮全选/全不选针对当前页签的搜索结果，跨页签选择保留。取消/Esc不改变模型、素材或编排；导出取消在素材边界及编码返回时检查，不承诺同步单动作采样/编码立即中断。

## 数据流与边界

`getEntries`读取当前库 → 用SkeletonUtils.clone建立独立蒙皮模型 → applyPose使用原采样器初始姿势 → encodeAction/decodeAction按稳定节点索引重绑定到克隆 → compileSequence/sampleSequence按60Hz、源关键时刻和片段边界采样 → 标准位置/四元数/缩放及形变轨道 → 官方GLTFExporter → 下载GLB或fflate ZIP。

静态姿势用完整节点快照应用到克隆，保留原逆绑定矩阵，不销毁共享几何、材质或纹理。导出不触碰可见模型或IndexedDB，导出期间暂停播放/模型操作，结束恢复原播放状态。仅模型树参与导出，不含视口相机、网格、骨架辅助线、控件或背景。内置来源写入GLB版权字段；外部模型权利由用户确认，导出不改变其许可。

第一版采样为近似离散烘焙，不是原始三次插值曲线的无损导出。硬切前加1e-5秒紧邻样本，减少一个采样间隔的跨段拖影，仍不是数学瞬时跳变保证。限64项、每动作180秒及12000采样点、动画数据和最终文件各128MiB，超量报错，不降帧或静默回退。当前无FBX导出、序列帧、批量多模型或自由选择编码参数。

静态姿势GLB经标准GLTFLoader可重新读取，但原项目姿势导入要求动画式单帧，且入口暂隐藏；不宣称该入口已兼容静态输出，也没有改宽骨架兼容性校验。

## 成熟实现与源码证据

- [Three.js GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html)：binary＋animations输出标准GLB，使用trs节点变换。对应本地three 0.186.1 `examples/jsm/exporters/GLTFExporter.js:processAnimation/processSkin`；inverseBindMatrices从骨骼逆绑定矩阵与bindMatrix生成。
- [SkeletonUtils.clone](https://threejs.org/docs/pages/module-SkeletonUtils.html)：正确复制蒙皮骨骼引用，复用几何/材质，不可disposeModel释放共享资源。
- ZIP使用现有three依赖中的`examples/jsm/libs/fflate.module.js`（0.8.2、MIT，原FBXLoader已使用），不新增npm依赖、不手写归档协议；许可注释随构建保留。
- 项目`motion-export.js`是上述库适配层；`motion-export-ui.js`仅管理列表、选择和弹窗；`sequence-core.js`仍是唯一编排采样来源。
- 回读测试须applyPose应用PoseSampler.sample返回的快照后再比较骨骼；Three.js `src/animation/AnimationMixer.js:_deactivateAction`会调用`PropertyMixer.restoreOriginalState`，stopAllAction后直接读模型是在比较绑定姿势，会产生假通过或假失败。先前直接读取、只对一侧应用姿势均不合适；最终两侧明确应用采样快照，覆盖动作段及过渡中点。

## 验证

领域测试覆盖裁剪/调速/姿势/过渡烘焙及超限；Chrome独立上下文实际下载并重新读取GLB/ZIP，检查单动作、多动画、静态姿势、混合包、搜索/取消、两内置骨架、合并动作时长与采样误差、导出前后姿势快照和编排/素材计数。GLTFLoader回读不等价于Blender/所有游戏引擎验收，外部软件尚未实测。界面截图为`output/acceptance/motion-export-dialog.png`。

本轮build:motion-lab通过，领域2项、相关Chrome回归12项通过；补充float32时间去重、导出取消状态和弹窗内错误后重新构建，再跑领域2项与最终Chrome5项通过。git diff --check通过（已有.gitignore行尾警告未改）。没有运行已暂停的姿势编辑体验回归，也没有把该能力重新开放；未提交、推送或发布。

前端设计技能用于黑灰蓝紧凑弹窗、保留文字主操作；文档更新技能同步实现范围、临时隐藏项和未验证边界。可复用规则：模型克隆不能用普通root.clone冒充正确蒙皮复制，导出必须同时验证标准文件回读与原编辑状态不受影响。
