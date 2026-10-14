# 导出测试超时的本地分段诊断

2026-10-14，基于提交e05be8d及Playwright 1.63.0。初始诊断阶段不修改业务导出算法、正式测试或安装包；用户随后授权修正测试，实施与验证状态见文末。

## 现象与边界

GitHub检查38491771000：桌面通过，网页46通过、2项超过整项60秒。Quaternius失败位置是导出完成后的page.evaluate姿势回读对比，并非安装器执行。此前仅拆开复合用例没有消除问题，不能据此宣布根因已修复。

本地已确认的主要瓶颈是测试把下载文件通过Array.from展开为逐字节数字数组，再作为page.evaluate参数跨进程传递。正式用户导出流程不包含这一回传：平台模块生成Blob，应用入口调用downloadReference下载。诊断不等于宣称所有云端环境差异均已解释或远端检查已通过。

## 实测

用真实界面导出Mesh2Motion两个动作GLB及Quaternius两个姿势ZIP，保存真实文件；同一文件依次通过数字数组、原生Uint8Array、Base64回传并解析。每种方式核对SHA256、骨骼数量和动画数量，Quaternius再读取原库、加载原模型并比较姿势。

| 模型 | 文件字节 | 数字数组回读 | 原生Uint8Array回读 | Base64回读 |
| --- | ---: | ---: | ---: | ---: |
| Mesh2Motion，正常速度 | 1,318,148 | 4.728秒 | 0.148秒 | 0.131秒 |
| Quaternius，正常速度 | 1,244,142 | 4.773秒 | 0.193秒 | 0.195秒 |
| Mesh2Motion，浏览器CPU减速4倍 | 1,318,148 | 5.936秒 | 0.249秒 | 0.470秒 |
| Quaternius，浏览器CPU减速4倍 | 1,244,142 | 6.180秒 | 0.589秒 | 0.830秒 |

正常速度下，数字数组的总耗时减去浏览器内部执行时长为4.58～4.60秒；包括参数序列化、协议传输、还原及调度，不是用户文件网络下载耗时。Quaternius原模型加载约50毫秒，导出文件解析约9毫秒，骨骼比较约0.4毫秒；姿势误差5.1619e-8，小于原断言0.001。三种传法在每轮的SHA256完全相同。

数字数组首轮含冷模块导入约106～114毫秒，后续为热导入；已单独记录导入时间。这个缓存差异不能解释约4.6秒的跨进程额外耗时。减速只控制本地浏览器CPU，不声称复现了GitHub机器的全部环境。

证据：忽略目录output/export-profile-1/report.json、output/export-profile-4/report.json及对应GLB/ZIP；诊断脚本output/export-profile.mjs。脚本自管8904只读临时服务、独立Chrome上下文，结束关闭自己创建的浏览器和服务，不清理正式数据库或启动正式客户端。

## 源码证据索引与后续落点

- tests/motion-lab/motion-export.spec.js：getDownload使用Array.from；inspect、合并动作比较及姿势比较多次传入整个数字数组。
- Playwright固定版本node_modules/playwright-core/lib/coreBundle.js：serializeValue/innerSerializeValue中，数字包装成`{ n: value }`，数组逐元素递归；serializeArgument沿用此路径。约130万字节因此产生约130万个包装对象。
- 同一实现对Uint8Array使用`{ ta: { b: Buffer, k: kind } }`专用路径，不必逐字节包装。诊断已验证浏览器收到的字节、模型与姿势一致，不需另写生产编码器或增加依赖。
- web/labs/motion/platform/motion-export.js及motion.js的runExport：实际导出与下载不包含测试参数回传；本轮没有修改这些文件。
- [Playwright跨进程求值和参数说明](https://playwright.dev/docs/evaluating)、[浏览器CPU减速接口](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setCPUThrottlingRate)。固定版本源码与本地实际执行共同作为依据，不依赖旧版接口印象。

用户随后授权修改：测试getDownload已改为原生Uint8Array，并保留Buffer的byteOffset/byteLength；复用现有解析与全部业务断言，不添加手写编码器、不增加依赖、不修改60秒超时。四项本地导出回归通过，总耗时12.9秒（此前38.8秒）；领域55项、完整网页48项通过（2.7分钟）。GitHub验证仍需单独确认。原安装包不需要因测试传输调整而重做，远端通过前保持发布未完成。
