# 来源与第三方许可

本文件记录直接抽取版本来源。项目自有代码采用 [MIT 许可证](LICENSE)；第三方依赖与素材保留各自许可，不因代码开源而重新授权。

## 内置素材

| 资源 | 来源与许可记录 |
| --- | --- |
| Quaternius 基础人偶 | 免费标准版公开 glTF 镜像；`fixtures/quaternius/LICENSE` |
| Quaternius UAL1/UAL2 | 仅免费 Standard，`fixtures/candidates/ual1`、`ual2` 包内 `License.txt`；CC0 |
| MakeHuman 99 姿势 | Cinevva 整理包，`fixtures/poses/MakeHumanPoses.json` 记录逐素材 CC0 标识、作者和来源 |
| Mesh2Motion 人偶/基础/附加动画 | 官方固定提交 653a9698f5f315523072f1c3ff3496100401317b；`fixtures/candidates/m2m-LICENSE-CC0.MD`，CC0 |
| RobotExpressive 测试模型 | Three.js r186 示例，原准备脚本标明 CC0；不作为第三个正式内置来源 |

文件完整性见 `fixtures/manifest.json`；来源与适配证据见 [原资源记录](docs/references/motion-resource-expansion.md)。当前新增默认姿势中 Mesh2Motion 的16姿势是动作取帧，不是独立下载姿势包。

未复制收费动作包或来源受限动捕包。历史 SambaDancing.fbx 夹具仅在被忽略的 output/test-fixtures 本地保留，许可未独立核对，不纳入 GitHub 提交资源；相关旧导入用例不在正式门禁。

## 第三方代码

- Three.js：MIT，`web/licenses/three.txt`；GLTFExporter、SkeletonUtils、加载器与控制器沿用官方实现。
- Lucide：ISC，`web/licenses/lucide.txt`；图标为原已生成 SVG 集合。
- fflate：随 Three.js 官方附加库使用，原源码头部保留其许可与作者说明，未手写 ZIP。
- closed-chain-ik：Apache-2.0，`web/licenses/closed-chain-ik.txt`；仅用于暂停的独立全身实验，固定原提交。
- gl-matrix、svd-js、linear-solve：实验求解器依赖；对应许可、README 与包元数据在 `web/licenses`。
- Ajv、esbuild、Playwright：构建或测试依赖，使用锁文件固定版本；包许可证随 npm 分发内容保留。

`docs/references` 中的旧工具日期、端口及历史验收仅作为来源证据。当前 MotionDeck 验收与限制以 README、docs/extraction-status.md 为准。
