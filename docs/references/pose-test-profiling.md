# 姿势库云端超时诊断

2026-10-14，5cc5a07对应Actions运行38499941253：四项导出测试均通过（8.8～14秒）；网页47项通过，姿势库混排测试在点击撤销时触发整项60秒超时。桌面门禁通过。不能据此认定撤销函数本身执行了60秒。

## 诊断入口与边界

- tests/motion-lab/pose-library.spec.js：每个关键阶段使用test.step及开始/结束耗时；记录主机、Chrome版本、实际图形驱动及主线程长任务累计。失败保留Playwright执行轨迹，不重试、不放宽60秒预算、不删除断言。
- .github/workflows/verify.yml：普通推送保持完整网页/桌面门禁，失败上传test-results。手动pose_diagnostics入口只诊断姿势库，不能替代完整发布门禁。
- scripts/github-release.mjs：发布检查必须核对同一次运行的verify和desktop均成功；诊断成功但这两个任务跳过时仍拒绝发布。
- web/labs/motion/motion.js：撤销调用history.undo；tick在暂停时仍每帧渲染。这是需要对照实际渲染环境的调查线索，尚不是已证实的云端根因。

## 本地对照

独立8904服务与Chrome上下文，不改用户客户端、8901服务或数据库。

- 正常图形驱动：Intel UHD Graphics，首项6.5秒；撤销51毫秒；三个拖放阶段分别326、349、332毫秒。两项姿势库测试通过（12.4秒含启动）。
- 显式SwiftShader CPU软件渲染：首项10.6秒；撤销109毫秒；三个拖放阶段分别869、801、868毫秒。首项通过（12.9秒含启动）。此对照只改变图形驱动，不代表云端CPU性能完全一致。

软件渲染会放大拖放耗时，但上述结果未复现60秒失败。下一步读取云端阶段耗时和失败轨迹，区分前序累计耗时、可点击性检查、浏览器长任务及渲染调度，不能继续仅凭失败行号改代码。

加入诊断后，完整本地网页48项通过（2.7分钟），领域55项通过；发布门禁判定额外核对完整成功、网页失败、仅诊断成功三个样例。定向云端结果待核对，不称为已修复。

## 第一轮云端实测

诊断运行38502916205：4核AMD EPYC、16GiB、Chrome155.0.8059.80；实际SwiftShader渲染，gpu_compositing/rasterization均disabled_software。本地正常GPU使用硬件合成，本地显式SwiftShader对照仍启用了合成，因此不能简单把本地软件渲染耗时等同于云端。

默认加载/切换7.15秒、选择与保存4.13秒、预览1.29秒；三次拖放6.06/7.02/6.13秒；撤销1.08秒且成功，撤销重做断言0.68秒；拖入待机6.68秒、保存3.98秒、刷新/拖入10.5秒，随后整项预算用尽。第一次拖放单次mouse.move（16步）约2.6秒，取框及滚动等请求也累计数秒。不是撤销函数卡死，而是浏览器操作普遍慢、累计预算耗尽；具体驱动配置影响还需同一云端对照。

下一轮仅在显式诊断开关下使用官方SwANGLE驱动参数，正常门禁与客户端不变。失败轨迹已上传为pose-diagnostic-traces，不能因诊断成功而直接发布。

## 官方证据

- [Playwright超时规则](https://playwright.dev/docs/test-timeouts)：测试函数、夹具及beforeEach共享整项预算。
- [执行轨迹](https://playwright.dev/docs/trace-viewer)：可逐动作检查耗时、可点击性日志与页面状态；无重试时使用retain-on-failure。
- [同类GitHub Actions超时问题](https://github.com/microsoft/playwright/issues/17874)：维护者建议核对执行轨迹，云端慢不是通用根因结论。
- [Chromium SwiftShader配置](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)：CPU软件实现及显式图形驱动开关，仅用于隔离诊断，不改变客户端配置。
