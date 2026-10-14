# 项目结构与模块边界

2026-10-14，Electron客户端化第一轮结构整理。原算法、模型身份、库格式和界面保持；不是整体重写，也不是已完成AI命令控制。

## 目录与职责

```text
desktop/                         Electron窗口、内部资源协议、安全边界
  preload.cjs                    固定业务桌面桥，不暴露任意IPC或文件API
  storage/                       后台工作线程、SQLite事务、哈希原文件与目录服务
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

## 本轮没有做的事

`motion.js`仍保留播放、库列表刷新、保存表单及模型切换等组合逻辑，未一次拆净；下一步按明确用例提取，不引入另一套状态管理框架。暂停的实验仍留在原目录，不把目录分层误写成人体约束问题已解决。

命令入口、请求版本/去重、助手摆姿势、MCP、磁盘工程备份、浏览器旧库迁移、自动更新均未实现。未来命令应调用同一应用操作层，不模拟点击界面、不复制业务逻辑；内部资源协议绝不承担任意代码执行入口。
