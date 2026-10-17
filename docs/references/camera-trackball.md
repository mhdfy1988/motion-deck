# 人物中心观察相机与源码依据

2026-10-17，未发布。用户已确认采用人物中心观察（官方OrbitControls）作为当前方案，其他相机模式暂时关闭，不再以四模式切换作为当前能力。统一适配Three.js 0.186.1官方控件，无新增依赖，不改素材或保存格式；与关节三轴环是独立功能。下方保留暂停方案的源码证据供查阅，不作为自动恢复依据。

## 已选定：人物中心观察（2026-10-17）

用户要求其他方向暂时全关闭，当前仅有orbit人物中心观察。正式motion.js已不导入/实例化FreeView和相机模式UI；无飞行锁鼠/键盘监听及下拉占位，不以空实现或fallback保留旧链路。ViewControls仅适配官方OrbitControls，不再包含模式切换、轨迹球/弧球分支或对应内部字段。公开旧包不因此自动变化。

暂停源码快照在experiments/camera，旧用例在tests/experiments/camera；其恢复边界见各目录README。free-view.js仍被独立fullbody.js实验使用，因此不删除共享模块及其数值测试，但正式bundle不引用。module-boundaries定向用真实esbuild依赖图检查正式bundle没有这些暂停模块，构建图中仅保留OrbitControls。

复用官方OrbitControls：左键ROTATE、中键PAN、右键无动作，滚轮沿相机到观察中心的距离缩放；无惯性，按下即跟随、松手即停。官方横/纵旋转按视口高归一，每高度拖距对应2π，滑鼠实测校验。构造前把camera.up设为世界Y，minPolarAngle=.05、maxPolarAngle=π−.05，避免极点翻转；上轴不是沿用手部手指方向，近景也不侧翻。中键主动平移可改变观察中心，不承诺人物永久居中。

手部继续HandControls原镜头快照/目标切换与返回链路，不另造近景摄像机。BodyControls命中隔离与草稿事务不改。真实表面点击进入手近景、绕手旋转、返回固定视图、腕点拖动不抢镜头均定向验收；测试见tests/helpers/observe-camera.js及网页/桌面入口。原四模式、飞行测试保留为暂停方案历史，不用来宣称当前试用版全量通过。

源码证据：Three.js0.186.1的OrbitControls构造时根据object.up建立_quat轨道轴，因此须在构造前固定世界Y；_handleMouseMoveRotate按element.clientHeight归一转角，update按min/maxPolarAngle限位，enableDamping=false不留旋转尾巴。ViewControls.create复用官方实现，仅配置输入与边界；未引入新依赖，不手写第二套旋转数学。

## 暂停方案历史：操作与状态

- 轨道：空白左拖绕观察中心，保持进入模式时的上方向，不允许连续翻过极点。切换不自动扶正画面；“适合视图”可重新取景。
- 自由轨迹球：空白左拖可连续翻过上下方，上方向随旋转。
- 弧球：用官方虚拟球表面映射鼠标，允许自由旋转；中央和边缘的手感不同。不显示辅助球、不启用双击聚焦或独立惯性动画，避免遮挡和抢身体双击开环。
- 自由飞行：选择后自动聚焦视口，W/S沿真实视线前后、A/D左右平移、Q/E世界上下、Shift加速，不要求按住鼠标。空白左键按住时借官方PointerLockControls隐藏光标并转头，松手恢复光标，按住的移动键仍继续；松键停止。Esc/失焦/切模式/忙碌清键，输入框不移动镜头。此模式播放中也能观察；滚轮不绕目标移动，人物/关节/指节及可见环的编辑输入优先。固定正交预设不支持飞行，尝试左键时明确提示先选透视，不再静默无响应。
- 前三种滚轮缩放，中键或 Shift+左拖平移；弧球缩放固定观察中心，不向鼠标点漂移。人物、关节和手指编辑优先拥有自己的拖动。

自由飞行的滚轮由FreeView.stepFlyWheel单独处理：按像素/行/页归一，向前沿视线靠近、向后远离；相机和观察中心同量平移，不改FOV/zoom、姿势或历史。单次输入有上界，编辑占用相机时不处理；锁鼠转头期间仍可滚动。底层轨迹球noZoom仍关闭，避免两个控件同时处理；不能只打开noZoom，因为飞行本来不执行轨迹球update。滚轮不申请锁鼠。已知反复左键申请锁鼠可能触发浏览器频率限制，尚未在本轮修复。
- 旋转灵敏度沿用原观察相机：视口高度的拖距对应一周。官方轨迹球原生按宽度归一化，适配层每次resize设倍率为π×宽/高；不能直接沿用1.1倍率，宽屏会慢数倍。惯性保持原配置，实际手感待用户试用。
- 固定预设仍锁定旋转；进入手部近景临时解锁，返回恢复原镜头、观察中心及锁定状态。
- 其他模式的编辑右键自由观看保留；自由飞行在非编辑状态也可用，不保留旧右键触发别名。切模式先停观看/清键、清惯性、销毁旧控件再建新控件；保留相机位置/方向/缩放及实际中心，避免多套监听器叠加。忙碌时禁切换，不在拖动中切换。

## 历史源码证据与落点（多模式已归档）

- 自由飞行左键转向：官方`PointerLockControls.js`以每像素0.002弧度乘公开`pointerSpeed`，默认值1导致100像素仅约11.5°。`FreeView.begin`按当前视口高度设`pointerSpeed=π×1000/height`，统一为每像素2π/height；600像素高时100像素约60°。其他模式旧编辑右键仍为1，不改移动或滚轮。实际桌面测试在900/720两种窗口高度累计真实movementX，按当前canvas高度核对实际偏航角，不只断言“发生变化”；未改变锁鼠申请频率。

- 桌面锁鼠许可由`desktop/permission-policy.cjs`统一校验，`desktop/main.cjs`同时注册permission check/request处理。仅pointerLock、自有WebContents、精确本机主页面、主框架、可见/未最小化且双层聚焦时允许，其他来源/窗口/设备权限仍拒绝。不能以“Chrome网页已通过”代替桌面权限验收。
- 官方依据：[Electron Session权限处理](https://www.electronjs.org/docs/latest/api/session#sessetpermissionrequesthandlerhandler)，安装版本44.7.0类型声明提供pointerLock、isMainFrame、requestingUrl。旧主进程统一callback(false)/check=false在真实桌面即使可见且聚焦仍出现“root document ... not valid for pointer lock”；隔离会话仅允许pointerLock后同窗口成功，证明是宿主权限而非左键事件/焦点。产品没有诊断临时放行或静默fallback。

- `node_modules/three/examples/jsm/controls/TrackballControls.js`：类说明允许越过极点；`_rotateCamera`对观察向量和camera.up应用同一四元数。`handleResize`维护指针归一化范围；`update`本身不检查enabled。
- 同目录`OrbitControls.js`：target/enableRotate/enableDamping与官方鼠标映射；`PointerLockControls.js`复用现有FreeView管理锁鼠与移动，不再造一套键盘移动逻辑。
- `ArcballControls.js`：`setCamera`建立相机矩阵快照，`applyTransformMatrix`以绝对四元数乘_upState，`update`实际看向_gizmos.position；内部中心移动后不会自动回写public target。适配将_upState校准为相机局部Y，并在change将实际中心同步回公共target/_currentTarget，否则从倾斜视角进入后再切换会歪画面或跳中心。不是静默fallback。
- 官方指针入口在disabled时直接返回，不能先收到旋转环的pointerdown再禁用，否则可能丢失pointerup收尾。
- `web/labs/motion/platform/view-controls.js`：应用只持有一个稳定入口，内部同时仅一套官方观察控件。统一object/target/enableRotate/enableDamping/resize/sync/dispose；pointerdown先询问BodyControls.hitGizmo，环命中不进入相机。Arcball不挂场景，不污染导出；销毁释放其自有辅助几何/材质。
- `ui/camera-mode.js`复用现有定制选择器风格及value/change链路，disabled跟随固定视角入口；本机命令协议不增加相机模式字段。
- `motion.js`：全身入口、固定预设锁定、尺寸适配；`hand-controls.js`：相机及旋转权限快照/恢复；`free-view.js`：左键飞行与旧编辑右键观看明确分流。键盘聚焦路径临时启用已有移动计算，不伪造isLocked；实际锁鼠仅用于鼠标转头。stop统一清键，左键正常松手显式保留仍按住的键；退出锁鼠前按实际四元数更新camera.up，防交回lookAt重置画面倾斜。

适配层依赖内部Trackball移动/缩放/平移向量、角度与触摸距离，Orbit的_sphericalDelta/_panOffset/_scale，Arcball的_upState/_gizmos/_currentTarget/_onWindowResize，以及各控件指针入口。升级Three.js须核对源码及真实手势；字段不符显式报错，不静默回退其他模式。

## 历史定向验证（不代表当前单模式）

两模型实拖上下翻转，相机up与初始up点积低于−0.8，观察中心、距离及模型姿势保持。检查缩放、平移、尺寸适配、固定预设、手部临时解锁/返回、拖指不动镜头；圆管实拖及右键交接另行定向检查。截图不作为连续翻转的唯一证据。未跑全量或桌面回归，手感待用户试用。
