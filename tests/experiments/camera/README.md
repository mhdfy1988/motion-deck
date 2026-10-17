# 历史相机用例

本目录保存四模式、自由轨迹球和飞行交互的旧用例快照，不在当前Playwright测试目录中，不是通过`skip`掩盖当前产品失败。它们对应的功能已经由用户明确暂停。

当前人物中心观察由`tests/motion-lab/observation-camera.spec.js`、`tests/desktop/camera-observation.spec.js`和`tests/helpers/observe-camera.js`验收。固定视角/录制仍保留在原`view-presets.spec.js`，手指三点/取消/历史/保存仍保留在原`finger-edit.spec.js`，关节三轴环仍由`rotation-modes.spec.js`验收，没有将仍在使用的功能整文件撤出门禁。

源码依据与恢复边界见`experiments/camera/README.md`。重开历史用例须先明确重新开放的功能和对应预览版本，不可直接对当前单模式页面执行。
