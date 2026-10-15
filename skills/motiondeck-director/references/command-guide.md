# 命令接入说明

## 连接用户当前客户端

请用户提供实际安装目录，以及设置中“个人数据”的完整目录。客户端必须正在运行，并开启命令控制。姿势、编排分别授权；任务管理写入需要两项授权。不要修改凭据文件，也不向用户索要令牌。

PowerShell调用示例（将占位路径替换为实际路径）：

```powershell
& "<安装目录>\MotionDeck-command.cmd" --data-dir "<个人数据绝对目录>" --operation session.inspect
& "<安装目录>\MotionDeck-command.cmd" --data-dir "<个人数据绝对目录>" --operation model.inspect
& "<安装目录>\MotionDeck-command.cmd" --data-dir "<个人数据绝对目录>" --operation rig.list --offset 0 --limit 100
```

启动器复用Electron内置运行时，不需要单独安装Node；它只发送命令，不启动GUI。不把安装目录误当个人数据目录。所有命令返回JSON；`ok:false`或非零退出码不能算成功。

复杂参数保存为UTF-8 JSON，通过`--request "<请求文件绝对路径>"`发送；与`--operation`二选一。请求文件只接受`operation`、`args`、可选`requestId`、`modelKey`、`expectedRevision`。启动器自动处理会话和认证，不能手填`token/sessionId/protocolVersion`。

例如从当前编排取帧，JSON如下，其中模型与版本必须替换为刚查询到的值：

```json
{"operation":"pose.fromSequence","modelKey":"<当前模型64位标识>","expectedRevision":0,"args":{"time":0.6}}
```

写入后使用响应的新版本，冲突时重新查询，不能盲目重放。结果未知时使用原请求编号查`request.status`；连接失效先重新发现会话。

## 查参数，不猜参数

[command-schema.json](command-schema.json)由当前客户端协议生成：`operations`分组列出查询/写入命令；`query.allOf`按操作名列出`args`字段、必填项和范围。其中`query`是启动器补齐会话后的内部查询结构，不应整份复制到`--request`文件。只读取当前要用的操作段。

- 连接与素材：`session.inspect`、`model.inspect`、`rig.list`、`library.list`、`workspace.list`、`timeline.inspect`；分页读取`total`，使用真实ID。
- 试摆：`pose.fromClip/fromLibrary/fromSequence` → `pose.setBones/setRootTransform` → 检查 → `pose.save`；`pose.undo/redo/discard`仅作用于草稿。骨骼四元数是局部绝对值，不是增量。
- 编排：`timeline.append/move/remove/resize/trim/transition`，修帧用`timeline.insertPoseAt`，撤销/重做用`timeline.undo/redo`，成品用`timeline.saveAction`保存。
- 检查：`preview.sequence`定位；`sequence.sample`查轨迹；`view.capture/captureSequence`保存带时间和视角的图片；`export.video`看连续节奏，`export.glb`导出模型动画。截图/导出需要写入权限，不能只因不会改姿势就当成只读命令。
- 位移策略：`preview.setRootMotion`分别控制水平/纵向整体位移，默认全保留；取姿势仍是原始制作源。
- AI素材：`workspace.create/activate/update/cleanup/restore`；试验默认`temporary`，检查后少量姿势标`key`、成品标`result`。不因用户要求制作就自动清理旧成果。

完整流程以主技能为准。连续姿势的零停留需要显式`continuous`，不能用旧模式强塞零时长。图像/轨迹的组合预算还受客户端约束；参数快照并非保证其他构建具备相同能力。未知操作、格式不兼容或预算错误应明确报告，不能改走旧路径掩盖失败。

## 制作记录与参考案例

记录当前模型、姿势ID、时间轴配方、位移策略、检查文件和剩余问题；不记录令牌。不把某台电脑的路径或旧请求编号当可复用配置。附带实践记录中的`output/...`等路径只是历史证据名称，不随技能分发，不能声称新用户本机已有这些文件。
