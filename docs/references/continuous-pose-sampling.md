# 连续关键姿势采样（未发布）

## 目标与输入输出

跳跃练习出现每阶段停顿，旧编排的姿势停留和末帧到首帧过渡语义本身没有损坏。连续模式显式允许姿势零停留，并将相邻过渡编译为共享切线曲线；不静默改变旧动作。

输入为姿势快照、进入该姿势的过渡时长、可为0的停留时长，以及`interpolation:"continuous"`。输入来自现有保存姿势和编排操作；输出仍是完整模型节点姿势，预览、合成动作、60Hz GLB烘焙共用sequence-core采样。

例：站立停留0.2秒→用0.4秒到最高点（停留0）→用0.4秒到落地（停留0.2），共1.2秒。最高点高度的速度反向时为零，但没有额外静止时间区间。连续上升的内部关键点共享非零速度；不将每个关键点都作为重新启动的端点。

## 核心实现与边界

- `core/continuous-poses.js`：三次Hermite采样；每分量使用加权调和切线，在方向反转处分量切线为0，限制端点过冲。旋转关键值先统一四元数符号，插值后归一化。该策略不等于SLERP恒角速度，也不承担IK、碰撞或脚底固定。
- `core/sequence-core.js`：只有相邻姿势都显式连续时，进入姿势的过渡才采用连续曲线。真实正时长停留、硬切或普通动作会隔开连续曲线，端点速度归零；旧段继续用位置线性、旋转SLERP。
- `application/timeline-operations.js`：旧姿势和动作仍至少0.05秒；连续姿势可0秒。空编排允许，非空编排总时长必须大于0，不接受动作片段连续标记。
- `core/action-codec.js`与`core/library-schema.js`：标记随动作及嵌套配方保存，含连续模式的库使用版本3；旧版本1/2读写含义保留。旧公开客户端不能读取版本3的新动作资料，因此只在预览/验收资料使用，未升级前不回退旧客户端打开该资料。
- 首版通过命令显式选择连续模式；并非已提供独立的界面关键帧编辑器。姿势停留仍可通过已有拖动调整，真正停留会断开连续速度。

## 外部源码依据

[Khronos glTF 2.0规范](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#interpolation-cubic)规定三次样条的端点、切线及旋转输出归一化；[官方动画教程](https://github.com/KhronosGroup/glTF-Tutorials/blob/main/gltfTutorial/gltfTutorial_007_Animations.md)解释关键点切线。项目采用自己的领域曲线与单调切线估计，不将其描述成原始glTF CUBICSPLINE轨道的直接读写；导出仍沿既有60Hz烘焙。

## 验证

定向测试在`tests/web/continuous-poses.test.mjs`、`tests/web/a4-operations.test.mjs`；真实打包两模型、权限、保存恢复和导出回读在`tests/desktop/timeline-command.spec.js`。具体本轮结果见`docs/verification.md`，不得用数学检查替代实际播放自然度验收。
