# 关节活动范围约束：研究与候选方案

2026-10-17研究快照。下方“已有能力/建议顺序”保留为实现前背景；A1–A4后续已进入开发源码，当前行为与范围以[关节约束实现](joint-constraints.md)和[验证记录](../verification.md)为准。未新增依赖、不改历史素材或原动作采样、不重启现用预览。

## 已有能力与缺口

- `web/labs/motion/pose/body-controls.js`：旋转环与单段拖动入口，整体调整是根变换，不应套人体关节限位。
- `web/labs/motion/pose/pose-ik.js`：moveEnd/moveJoint不是整臂位置IK；solve的弯曲范围只覆盖部分解析求解，不是统一关节约束。
- `web/labs/motion/pose/body-chain-controls.js`：躯干使用Three.js CCD；骨盆联动双腿。单次转角预算不是相对绑定姿态的绝对活动范围。
- `web/labs/motion/core/sequence-core.js`：过渡插值不做全身约束/碰撞求解；合法端点不能代替整段检查。
- 仓库已有固定提交`1132da3dc3ac774426e9af503e4915bc04ca413b`的closed-chain-ik-js（0.0.7），仅独立`fullbody-rig.js`实验使用，见motion-fullbody-trial.md；正式编辑器未接入。不能把依赖存在当作能力完成。

## 外部源码证据

| 来源 | 已确认行为 | 对本项目的用途/限制 |
| --- | --- | --- |
| [Three.js CCDIKSolver](https://threejs.org/docs/pages/CCDIKSolver.html)；本地0.186.1 `examples/jsm/animation/CCDIKSolver.js` | limitation投影到轴，rotationMin/Max按Euler范围截取，存在blendFactor | 已有依赖，可用于简单链约束；不是人体关节标定或完整肩腕约束，也不自动覆盖手动旋转入口 |
| [Jolt SwingTwistConstraintPart.h](https://github.com/jrouwe/JoltPhysics/blob/master/Jolt/Physics/Constraints/ConstraintPart/SwingTwistConstraintPart.h) | 约束空间分解swing/twist；SetLimits、ClampSwingTwist；cone/pyramid摆动限制与扭转上下限 | 借鉴球关节约束数学。它属于物理引擎，不是Three骨骼编辑器插件；不能直接当现成的人体系统。MIT，复制/移植前固定提交并保留署名、对照测试 |
| [Fullik/FIK](https://github.com/lo-th/fullik)；`src/core/Joint3D.js` | FABRIK实现，球关节及局部/全局铰链约束 | JavaScript候选/参考，MIT；仍需骨架映射、姿态朝向与编辑事务适配，未验证与本项目Three版本兼容 |
| [closed-chain-ik-js](https://github.com/gkjohnson/closed-chain-ik-js) | 自由度、min/max、目标/参考姿势、多闭环DLS求解与收敛状态 | 本仓已在隔离试验使用；Apache-2.0，不是MIT。没有自动提供人体活动范围、骨轴映射和防穿模；沿原适配边界评估，不直接替换正式编辑器 |

本地CCDIKSolver源码已确认limitation及Euler限位操作；网页文档的字段类型展示不能替代实际Vector3源码语义。当前Three.IK README自称work in progress并列出轴向/API问题，不作为本轮优先接入对象。

## 论文方向

- [Akhter & Black，CVPR 2015：Pose-Conditioned Joint Angle Limits for 3D Human Pose Reconstruction](https://www.cv-foundation.org/openaccess/content_cvpr_2015/html/Akhter_Pose-Conditioned_Joint_Angle_2015_CVPR_paper.html)：学习随姿势变化的关节范围，而非各轴固定独立角度；适合后续研究，论文/数据的研究用途声明不等于开源商业许可。
- [Jiang & Liu，2017：Data-Driven Approach to Simulating Realistic Human Joint Constraints](https://arxiv.org/abs/1709.08685)：数据驱动的姿势相关人体关节约束方向；不是开箱即用的Three.js前端方案。
- [Aristidou等：Extending FABRIK with model constraints](https://onlinelibrary.wiley.com/doi/abs/10.1002/cav.1630)：带模型约束的FABRIK扩展，供受限目标求解参考；替换求解算法本身不能补齐模型解剖映射。

## 建议落地顺序（未实现）

1. **两模型标定 + 肘膝小样**：从绑定姿态/专门校准姿态建立关节坐标系，明确弯曲轴、正方向、参考旋转和扭转轴；不能把当前动作当零位或对两模型原始XYZ共用角度表。肘弯曲与前臂旋转分开建模，不把前臂旋转全塞进腕关节；手肘位置仍固定，不擅自改回整臂IK。无映射/退化轴明确提示未标定，不猜轴。
2. **统一约束投影层**：输入候选四元数及模型关节配置，输出受限姿态和触边信息；环、拖动、命令制作沿同一层。肘膝以铰链/受控扭转为主，肩髋用摆动区域+扭转范围，腕踝/颈用各自配置；不是全身统一Euler截断。FK预览同帧受限，IK在迭代中施加并重算目标误差。不可达时保持合法姿态并报告残差，不拉骨长或静默解除约束。
3. **接入现有事务与交互反馈**：一次手势仍一步历史，取消恢复；自然约束/自由编辑显式切换。命令反馈实际应用结果和触边，不悄悄更改请求。整体调整不套关节限位。旧素材/导入动作不在加载时自动重写；已有不合规姿态先报告并明确选择修正或自由编辑。
4. **后续再补**：前臂扭转分配（取决于模型是否有twist骨与蒙皮支持）、姿势相关范围、碰撞/距离检测、过渡逐帧检查及明确选择的修复。关节合法不等于网格不穿插；不能承诺仅有限位就消除穿模。预览/检查/导出若引入修正，应共用同一采样策略，不能各自修正。

通用求解优先复用已有Three/隔离库；项目自己掌握模型标定、语义配置、统一入口和事务。第一轮不同时新增全身IK和物理引擎。候选外部代码尚未实际移植，数值、性能、授权与发布体积需单独验证。

## 验收要点

- 两模型左右肘膝方向正确；自然约束下不反折/侧折，前臂扭转通道不被误杀。
- 环与拖动走相同规则；到边界反向拖立即恢复，不卡死、不突跳。
- 四元数跨±180°、q/-q等价、直臂退化、父级旋转/等比缩放有数值测试。
- 到不可达目标保持有限误差，不拉长骨骼；撤销/重做/取消/保存/回读一致。
- 原有动作不被静默重写，未标定模型明确区分；碰撞和连续过渡另验。

以上为工程建议，不是医学活动范围标准，也不是已完成的人体约束能力。
