# 项目结构与模块边界

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
  storage/                       后台工作线程、SQLite事务、哈希原文件与目录服务
  control/                       A2–A4管道、认证、独立授权、命令客户端与受控输出
web/labs/motion/
  core/                          姿势/编排采样、动作编解码、库schema、历史与显示比例
  application/                   单一会话状态、时间轴操作、模型目录与素材库保存
  platform/                      Three.js解析、GLB/ZIP、参考录制、网页/桌面存储适配
  ui/                            时间轴指针输入、站内确认、导出选择及桌面目录设置
  motion.js                      界面组合入口、展示刷新和剩余应用编排
  index.html / motion*.css        既有正式界面
  fullbody.* / pose-*             保留的姿势/全身实验，不重新开放
fixtures/                        按manifest核对的内置模型与许可
scripts/                         构建、资源校验、桌面打包、本机网页开发服务
tests/web/                       核心与模块边界测试
tests/motion-lab/                 浏览器回归
tests/desktop/                    源码与真实ASAR产物验收
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

## 后续助手操作层

A1 新增 `application/workbench-operations.js`，提供同一会话的模型/骨架/素材查询、预览取样、保守编辑版本与最小取帧草稿。界面源动作、编排、自定义动作及姿势预览调用这层；保存姿势弹窗取样沿 `captureCurrent`，保持原预览上下文。`tick` 以内部 transient 推进，不逐帧增加编辑版本，草稿期间不推进。

模型节点ID按当前根遍历建立，重名骨骼不合并；查询值不暴露模型对象。A3的 `application/pose-draft.js` 已承担完整节点快照、整批局部旋转和100步姿势历史；取帧/写入失败恢复完整姿势，放弃恢复进入前上下文但不自动播放。保存与高清截图通过应用适配回到既有平台链路，草稿冲突输入/退出有保护。见[技术方案](assistant-control.md)和[当前计划](stages/current-todo.md)。

## 本轮没有做的事

`motion.js`仍保留播放、库列表刷新、保存表单及模型切换等组合逻辑，未一次拆净；下一步按明确用例提取，不引入另一套状态管理框架。暂停的实验仍留在原目录，不把目录分层误写成人体约束问题已解决。

A2新增 `core/control-schema.js` 与ESM/CJS校验器、`application/control-queries.js`固定映射、`ui/desktop-control.js`固定桥接、`desktop/control/`管道/ACL/认证。A3增加独立姿势权限、写请求串行/版本校验和固定PNG桥。A4增加 `application/timeline-operations.js`适配原时间轴控制器/历史/采样；姿势库草稿与整体根骨变换仍在共享workbench，保存/导出通过motion.js适配原平台链。`desktop/control/cli.cjs`由开发脚本和内置command.cjs共用，验收包的MotionDeck-command.cmd复用Electron运行时；受控GLB与PNG共用固定落盘目录检查。去重限本次会话；人体语义映射/自然约束、物理跳跃及MCP未实现。A4本地工程验收完成，用法/限制见[command-control.md](command-control.md)。

完整磁盘素材库备份、本客户端旧库迁移、NSIS安装和受控自动更新已实现；不迁移Chrome网页或动作工坊库，不备份未保存编排。内部资源协议绝不承担任意代码执行入口。ASAR 仍归档应用代码，仅 ACL 辅助 PS1 明确解包供外部 PowerShell 使用，真实包验收检查完整解包清单。
