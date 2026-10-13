# MotionDeck

3D 动作与姿势编排工具，可录制参考视频供 2D 游戏和 AI 素材制作使用。

从动作工坊的既有工具直接抽取，保留界面、编排协议和功能，没有重新实现。无需 Python 后端。

## 启动

使用 Node.js 24（本机验证24.14.0），在本项目目录执行：

```powershell
git clone https://github.com/mhdfy1988/motion-deck.git
Set-Location motion-deck
npm.cmd ci
npm.cmd run build
npm.cmd start
```

打开 http://127.0.0.1:8901/ 。服务仅监听本机；端口可通过环境变量 PORT 显式指定。不要通过双击 HTML 启动。

## 当前能力

- Quaternius：117 个动作、99 个姿势；Mesh2Motion：162 个动作、16 个从动作取帧的默认姿势。
- 模型导入与保存、动作/姿势搜索和预览、时间轴拖放、裁剪/变速、主动放置过渡、撤销/重做。
- 默认库只读，自定义动作作为完整片段保存和再次使用；自定义姿势可保存及删除。
- 横版侧视及其他固定视角、PNG 拍照、高清参考视频录制。
- 当前模型的动作/姿势多选导出：带模型的 GLB 或 ZIP。标准动画为近似重采样，不宣称原曲线无损。

姿势编辑和动作/姿势导入继续隐藏。全身联动试摆仅保留为实验，`npm.cmd run build:experiment` 后访问 `/labs/motion/fullbody.html`，不作为正式能力或好用程度承诺。

## 数据边界

MotionDeck 使用独立浏览器数据库 `motion-deck.library.v1`。旧动作工坊代码、文件和旧数据库未修改，旧自定义库不会自动搬到新地址。不同地址/端口也不共享浏览器库。

库数据仍保存在浏览器内，不是磁盘工程。当前 GLB/ZIP 导出是模型素材导出，不是可恢复整个库的工程备份；清空浏览器站点数据会丢失自定义内容。旧库迁移尚未实施，启动原工具并使用原地址可继续访问旧数据，不要清理旧数据库。

## 目录

```text
web/labs/motion/       原工具源码、页面和样式
web/motion-store.js    独立存储入口
fixtures/             已核对的内置资源与测试资源、哈希清单
scripts/              构建、静态服务和资源校验
tests/                领域测试及浏览器回归
docs/                 抽取边界、参考证据和验收
```

保留原目录结构以减少迁移风险；运行与构建不读取原 action-forge 目录。

## 验证

```powershell
npm.cmd run assets:verify
npm.cmd test
$env:MOTIONDECK_TEST_PORT='8904'
npm.cmd run test:e2e
```

Windows 浏览器回归使用 Chrome，录像验证需 FFmpeg/ffprobe 在 PATH 中，或配置 FFMPEG_BIN。设置`MOTIONDECK_TEST_PORT=8904`使用隔离测试服务，不占用主入口8901；服务随测试自动启动和停止，浏览器上下文不使用已有用户库。门禁只覆盖当前开放功能；旧姿势编辑、第三方动作导入和全身试摆界面用例保留但不混入正式门禁。验证记录见[docs/verification.md](docs/verification.md)。

复制的依赖锁沿用原树，`.npmrc` 固定 legacy-peer-deps，避免实验 IK 包的 URDF 示例同伴依赖改变安装图；本项目只使用其 core 求解器。所有依赖版本与原工具保持一致。

## 许可与发布状态

项目自有代码采用 [MIT 许可证](LICENSE)，以[公开仓库](https://github.com/mhdfy1988/motion-deck)提供源码。第三方依赖和资源保留各自许可，见 [来源与许可](THIRD_PARTY_NOTICES.md)。package 的 `private: true` 仅防止误发布到 npm，不限制 GitHub 仓库公开。

GitHub 自动验证配置随源码提供，其运行结果需在仓库 Actions 页面核对，不能用本地通过代替远端通过。当前未创建版本标签、GitHub Release或安装包，也没有部署 GitHub Pages；服务与资源路径用于本机运行。
