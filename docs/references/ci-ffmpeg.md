# CI视频校验工具准备

2026-10-14，b32f168桌面任务115748426886的Chocolatey源返回HTTP406，实际安装0个包却继续执行；录制视频下载后，测试调用ffprobe报spawnSync ENOENT。升级、目录及备份恢复通过，不是安装包损坏。网页另有1项模型等待超时，不能以本轮FFmpeg修复称所有门禁通过。

## 固定入口

- scripts/prepare-ci-ffmpeg.ps1由网页与桌面两个正式任务共同调用，不再依赖Chocolatey动态latest。
- 固定GyanD/codexffmpeg的8.1.2 essentials_build ZIP；GitHub发布资产SHA256：db580001caa24ac104c8cb856cd113a87b0a443f7bdf47d8c12b1d740584a2ec。升级需显式更新URL、版本和哈希并验证。
- 下载HTTP错误/超时、哈希不符、解压失败、缺少任一工具、执行失败或版本不符都立即终止准备步骤。不得静默回退系统PATH或旧Chocolatey链路。
- 在RUNNER_TEMP独立新目录准备；验证后通过GITHUB_ENV写FFMPEG_BIN，复用现有网页/桌面测试入口。不改机器PATH、不全局安装、不加入客户端包。

## 本地证据

真实下载109,728,040字节，SHA256匹配，ffmpeg及ffprobe均报告8.1.2；读取现有reference-h264.mp4得到1920×852并实际解码首帧成功。模拟GITHUB_ENV输出与原Node测试的无扩展名ffprobe调用成功；错误文件作为压缩包输入时，在解压和执行前被哈希校验拒绝。未重新跑整套业务测试，云端新准备步骤尚待验证。

## 来源

- [FFmpeg官方Windows构建来源](https://ffmpeg.org/download.html)：官方仅提供源码，列出Gyan作为Windows构建提供方。
- [固定Windows构建发布](https://github.com/GyanD/codexffmpeg/releases/tag/8.1.2)：版本、文件与GitHub发布资产digest来源。

二进制及输出仅留在忽略的output/临时目录，保留上游压缩包中的许可，不随MotionDeck分发。
