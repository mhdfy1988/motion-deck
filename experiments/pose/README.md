# 旧版手脚拖动快照

`pose-drag.js`为无运行入口的旧版拖动实现，曾自持单步历史，与当前统一工作台不同。源码、对应样式快照`pose-drag.css`和旧测试（`tests/experiments/pose-drag.spec.js`）于2026-10-17归档，旧圆形文字按钮及提示样式从正式CSS移除。

当前身体/手部通过`BodyControls`、`HandControls`调用工作台事务。此快照不进入正式构建、不作为fallback、不自动恢复；整理没有删除共享的`pose-ik.js`或改动其求解算法。
