# 数据目录与安全迁移

2026-10-14，客户端候选已实现；正式用户资料未在测试中迁移。网页开发入口继续使用原IndexedDB，不共享客户端磁盘库。

## 目录

| 内容 | 正式默认位置 | 是否可在设置中改变 |
| --- | --- | --- |
| 个人设置与旧客户端会话 | `%APPDATA%/MotionDeck` | 固定，提供打开入口 |
| 磁盘素材库 | 系统文档目录下`MotionDeck/素材库` | 迁移到空目录 |
| 导出文件 | 系统文档目录下`MotionDeck/导出` | 可以，另存为仍可选其他路径 |
| 完整库备份 | 系统文档目录下`MotionDeck/备份` | 可以 |
| 磁盘HTTP缓存 | `%LOCALAPPDATA%/MotionDeck/cache` | 固定，可清理 |
| 存储日志 | `%LOCALAPPDATA%/MotionDeck/logs` | 固定，提供打开入口 |
| 内置素材 | 程序`resources/app.asar` | 随包只读，不混入个人文件 |

实际路径以右上角“设置”为准，尊重系统文档目录位置。`MOTIONDECK_DATA_DIR`显式指定时，默认工作区、缓存和日志全部隔离在该目录下；改变此变量不是自动迁移方式。

个人设置为settings.sqlite，素材库包含library.json身份标记、library.sqlite事务索引、objects内容哈希原文件。文件名、类型和原始字节可完整还原；不是把每个动作保存为一个同名GLB，通用素材文件仍通过导出获得。记录协议、模型身份和既有动作编解码保持不变，仅改变客户端存储适配。不得手动改索引或删除objects。

旧IndexedDB保留在客户端会话目录，Chrome/动作工坊库不访问。Chromium部分GPU缓存等仍可能在会话目录，不能把整个个人数据目录当作缓存删除。“清理缓存”只调用Electron缓存接口，不清设置、IndexedDB或磁盘素材库。

## 操作流程与不变式

1. 首次升级：只读当前客户端旧库，序列化原File/Blob与记录，写入新候选库；校验索引和每个文件SHA256，生成完整迁移备份，最后事务提交新库位置。原IndexedDB及旧空候选目录保留。失败不切换、不回落旧实现；重试以旧库为来源重新创建候选。
2. 搬迁：选空目录，后台SQLite备份加引用文件复制，验证后切换设置指针，原库原样保留。不覆盖或合并已有目录，不允许目标与个人资料、缓存、日志或当前库重叠。
3. 备份：在配置的备份目录创建独立子目录，包含SQLite一致性快照和全部引用文件；必须整体保留。无需把实时WAL文件生硬复制，使用SQLite官方backup接口。
4. 恢复：只读校验备份，先备份当前库，再复制到独立恢复库；验证后切换。旧库保留。用户确认后重载页面，未保存编排会丢失，界面提前提醒；备份不包含未保存编排。
5. 导出：生成内容仍走原导出器，保存对话框默认进入配置目录；成功另存为后记住实际保存目录，取消或失败不改变目录。设置中更改目录会重设下次默认位置，不修改素材本身。

设置、迁移、备份和写事务在后台工作线程串行执行；渲染进程不获得任意文件读写或IPC入口。元数据通过SQLite事务提交，原文件先写临时文件并同步，再原子改名；中断可能留下未引用候选或临时文件，不自动删除它们。跨实例使用固定参数目录锁，锁失效立即拒绝后续操作。

磁盘库损坏、丢失、不可写或被占用时显式停止素材读写，不新建空库冒充恢复成功；设置入口仍可选择完整备份恢复。无法读取的原库不进行伪成功备份、不修改其文件，恢复到独立新库。当前数据未加密；备份需用户自行妥善保管。目录管理与备份不是云同步。

## 源码与官方依据

- `desktop/storage/library.cjs`：SQLite记录事务、SHA256文件验证、一致性快照、跨实例锁。
- `desktop/storage/service.cjs`：设置指针、旧库迁移、搬迁、备份和恢复。
- `desktop/storage/worker.cjs`/`client.cjs`：后台队列与固定RPC，构建为worker.bundle.cjs；不复制开发node_modules。
- `desktop/preload.cjs`：原固定桌面桥；`desktop/ipc/register.cjs`/`settings.cjs`：主帧来源校验、受控目录/素材操作；`desktop/main.cjs`保留服务生命周期和唯一导出默认目录，新模块通过getter与回写共享它。
- `web/labs/motion/platform/desktop-store.js`：File/Blob编解码、当前来源的旧IndexedDB只读迁移。
- `web/labs/motion/ui/desktop-settings.js`：目录界面、危险操作复用站内确认。
- [Node24 SQLite](https://nodejs.org/download/release/v24.14.0/docs/api/sqlite.html)：DatabaseSync与backup。Node24中驱动仍标记experimental，API隔离在适配层，固定运行时并通过实际Electron产物验收；未来替换驱动不能改变领域协议。
- [Electron进程通信](https://www.electronjs.org/docs/latest/tutorial/ipc)、[安全桌面桥](https://www.electronjs.org/docs/latest/api/context-bridge)：仅暴露固定业务方法，保留sandbox/contextIsolation和来源检查。
- [proper-lockfile](https://github.com/moxystudio/node-proper-lockfile)：成熟跨进程目录锁，统一stale/update策略，不手写进程锁。

当前用户安装、受控更新及数据保留已完成隔离真实验收，见[安装与更新](install-and-update.md)；发布状态仍以当前任务和远端发布页为准，不以本地验收冒充已上传。
