import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {auditModuleStructure} from '../../scripts/audit-module-structure.mjs';

test('桌面固定IPC统一来源注册，入口保留窗口安全/关闭保护与唯一控制会话',async()=>{
 const main=await readFile(resolve('desktop/main.cjs'),'utf8');
 assert.doesNotMatch(main,/ipcMain\.handle\(|const controlPending|rendererControlReady/);
 for(const factory of ['createTrustedRegistrar','bindWindowIPC','createControlBridge','bindUpdateIPC','bindDataSettingsIPC'])assert.match(main,new RegExp(factory+'\\('));
 for(const [name,value] of [['nodeIntegration','false'],['contextIsolation','true'],['sandbox','true'],['webSecurity','true']])assert.match(main,new RegExp(name+':\\s*'+value));
 assert.match(main,/app\.on\('before-quit'/);assert.match(main,/window\.on\('close'/);assert.match(main,/hasPendingWrites\(\)/);assert.match(main,/draftDirty \|\| control\.hasPendingWrites/);assert.match(main,/cancelControlQueries\(\)/);
 for(const file of ['register','window','control','updates','settings']){
  const source=await readFile(resolve('desktop/ipc/'+file+'.cjs'),'utf8');
  assert.doesNotMatch(source,/require\(['"]electron['"]\)|createControlServer|createStorageClient|new BrowserWindow|readFile\(/,file+'不创建另一实例或任意文件入口');
  if(file!=='register')assert.doesNotMatch(source,/ipcMain\.handle\(/,file+'不能绕过统一来源校验');
 }
});

test('工作台按查询、姿势、媒体、素材维护委托，唯一状态/版本与预览留在主入口',async()=>{
 const root=resolve('web/labs/motion/application'),main=await readFile(resolve(root,'workbench-operations.js'),'utf8');
 for(const [file,factory] of [['workbench-queries','createWorkbenchQueries'],['workbench-pose-operations','createWorkbenchPoseOperations'],['workbench-media-operations','createWorkbenchMediaOperations'],['workbench-library-operations','createWorkbenchLibraryOperations']]){
  const source=await readFile(resolve(root,file+'.js'),'utf8');
  assert.match(main,new RegExp(factory+'\\('));
  assert.doesNotMatch(source,/\b(?:document|window)\s*\.|from\s+['"][^'"]*(?:platform|ui)\//,file+'不控制UI或存储平台');
  assert.doesNotMatch(source,/createSessionState|createTimelineHistory|function fingerprint|state\.revision\s*(?:\+\+|=)|new Map\(/,file+'不创建第二份会话/历史/映射/版本');
 }
 assert.doesNotMatch(main,/function (?:inspect|modelInspect|rigList|libraryList|fromClip|fromLibrary|fromSequence|saveDraft|captureViews|reviewMedia|renameLibraryEntry)\(/);
 assert.match(main,/function fingerprint\(/);assert.match(main,/function atomic\(/);assert.match(main,/function source\(/);assert.match(main,/function sync\(/);
 assert.match(main,/getNodeMap\s*=\s*\(\)\s*=>\s*nodeMap/);assert.match(main,/getAdapters\s*=\s*\(\)\s*=>\s*adapters/);
 const library=await readFile(resolve(root,'workbench-library-operations.js'),'utf8');
 assert.match(library,/createAIWorkspaceOperations\(/);assert.match(library,/createLibraryClipboard\(/);
});

test('正式观察入口不装载暂停相机及飞行监听，独立全身实验仍保留原依赖',async()=>{
 const root=resolve('web/labs/motion'),main=await readFile(resolve(root,'motion.js'),'utf8'),controls=await readFile(resolve(root,'platform/view-controls.js'),'utf8'),fullbody=await readFile(resolve(root,'fullbody.js'),'utf8');
 assert.doesNotMatch(main,/FreeView|freeView|bindCameraMode|disposeCameraMode/);
 assert.match(controls,/import \{OrbitControls\}/);
 assert.doesNotMatch(controls,/TrackballControls|ArcballControls|PointerLockControls|setMode\(/);
 assert.match(fullbody,/import \{FreeView\} from '\.\/free-view.js'/);
 const graph=await build({entryPoints:[resolve(root,'motion.js')],bundle:true,format:'esm',platform:'browser',write:false,metafile:true}),inputs=Object.keys(graph.metafile.inputs).map(path=>path.replaceAll('\\','/'));
 assert.ok(inputs.some(path=>path.endsWith('/controls/OrbitControls.js')));
 assert.ok(!inputs.some(path=>/experiments\/camera\/|\/(?:free-view|camera-mode)\.js$|\/(?:TrackballControls|ArcballControls|PointerLockControls)\.js$/.test(path)),'正式依赖图不应装载已暂停相机');
});
test('核心与应用操作不读取DOM，导出生成不依赖素材存储',async()=>{
 const root=resolve('web/labs/motion');
 for(const layer of ['core','application'])for(const file of await readdir(resolve(root,layer))){
  if(!file.endsWith('.js')||file.endsWith('.generated.js'))continue;
  const text=await readFile(resolve(root,layer,file),'utf8');
  assert.doesNotMatch(text,/\b(?:document|window)\s*\./,`${layer}/${file}不应控制界面`);
  if(layer==='core')assert.doesNotMatch(text,/from\s+['"][^'"]*(?:application|platform|ui|pose)\//,`${file}不应反向依赖上层`);
 }
 const exporter=await readFile(resolve(root,'platform/motion-export.js'),'utf8');assert.doesNotMatch(exporter,/action-library|indexeddb-store/);
});

test('手动摆姿模块按工具展示、命中、手势分工，不再引入旧独立历史',async()=>{
 const root=resolve('web/labs/motion');
 const tools=await readFile(resolve(root,'ui/pose-tools.js'),'utf8'),picking=await readFile(resolve(root,'pose/pose-picking.js'),'utf8'),pointer=await readFile(resolve(root,'pose/body-pointer.js'),'utf8');
 assert.doesNotMatch(tools,/capturePose|applyPose|beginUserPoseGesture|\.quaternion|\.onBegin\(/);
 assert.doesNotMatch(picking,/createElement|capturePose|applyPose|\.onBegin\(/);
 assert.doesNotMatch(pointer,/createElement|capturePose|applyPose|undo\s*[:=]|redo\s*[:=]/);
 const graph=await build({entryPoints:[resolve(root,'motion.js')],bundle:true,format:'esm',platform:'browser',write:false,metafile:true}),inputs=Object.keys(graph.metafile.inputs).map(path=>path.replaceAll('\\','/'));
 for(const name of ['body-controls','body-pointer','pose-tools','pose-picking','hand-controls'])assert.ok(inputs.some(path=>path.endsWith('/'+name+'.js')),name+'应接入正式摆姿入口');
 assert.ok(!inputs.some(path=>/\/pose-drag\.js$|experiments\/pose\//.test(path)),'旧PoseDrag不得作为隐藏回退');
});

test('姿势求解无DOM或应用依赖，工具展示不反向拥有求解与历史',async()=>{
 const root=resolve('web/labs/motion');
 for(const file of ['pose-ik','body-chain-controls','finger-ik','hand-joint-motion','hand-rig','joint-limits','whole-rotation']){
  const source=await readFile(resolve(root,'pose',file+'.js'),'utf8');
  assert.doesNotMatch(source,/\b(?:document|window)\s*\.|from\s+['"][^'"]*(?:application|ui)\//,file+'只处理骨架/数学，不拥有界面或工作台');
 }
 const tools=await readFile(resolve(root,'ui/pose-tools.js'),'utf8');
 assert.doesNotMatch(tools,/from\s+['"][^'"]*pose\/|\.quaternion|capturePose|applyPose/);
 const app=await readFile(resolve(root,'application/workbench-operations.js'),'utf8');
 assert.doesNotMatch(app,/from\s+['"][^'"]*(?:body-controls|hand-controls|pose-tools)\.js/,'应用层不得反向引入交互控制器');
});

test('工作台、实验、桌面运行时入口与工程脚本均无静态循环依赖',async()=>{
 const report=await auditModuleStructure();
 for(const [name,graph] of Object.entries(report.graphs)){
  assert.ok(graph.modules>0,name+'必须解析真实源码');
  assert.deepEqual(graph.cycles,[],name+'不能含循环依赖');
 }
 assert.ok(report.graphs.desktop.entries.includes('desktop/storage/worker.cjs'));
 assert.ok(report.inventory.files>100);
});

test('素材库组件仅负责展示，展示模型不反向依赖界面或存储',async()=>{
 const root=resolve('web/labs/motion');
 const view=await readFile(resolve(root,'ui/library-view.js'),'utf8');
 assert.doesNotMatch(view,/from\s+['"]|saveLibrary|decodeAction|compileSequence|capturePose|poseDraft|\.quaternion/);
 const model=await readFile(resolve(root,'application/library-presentation.js'),'utf8');
 assert.doesNotMatch(model,/\b(?:document|window)\s*\.|from\s+['"][^'"]*(?:ui|platform|pose)\//);
 const main=await readFile(resolve(root,'motion.js'),'utf8');
 assert.match(main,/createLibraryView\(/);assert.match(main,/createLibraryPresentation\(/);
 assert.doesNotMatch(main,/function (?:applyLibrarySearch|deletableLibraryRow)\(/,'已抽离的展示和行操作不得再复制回入口');
});

test('播放控制与播放栏分离，不复制采样/历史或把模式分支留在渲染循环',async()=>{
 const root=resolve('web/labs/motion');
 const controller=await readFile(resolve(root,'application/preview-controller.js'),'utf8');
 assert.doesNotMatch(controller,/\b(?:document|window)\s*\.|capturePose|applyPose|sampleSequence|new .*Sampler|requestAnimationFrame/);
 const view=await readFile(resolve(root,'ui/player-view.js'),'utf8');
 assert.doesNotMatch(view,/from\s+['"]|workbench|poseDraft|\.mode\s*===|capturePose|applyPose/);
 const main=await readFile(resolve(root,'motion.js'),'utf8'),tickStart=main.search(/function tick\(now\)\s*\{/),tick=main.slice(tickStart,main.indexOf('restoreLastSaved();',tickStart));
 assert.ok(tickStart>=0,'必须存在原帧循环入口');
 assert.match(tick,/previewController\.advance/);assert.doesNotMatch(tick,/state\.mode|workbench\.source|state\.playing\s*=/);
 assert.doesNotMatch(main,/\$\('(?:play|restart|previewSeek)'\)\.on(?:click|input)\s*=/);
});

test('保存表单与用户保存用例分离，草稿仍委托唯一工作台事务',async()=>{
 const root=resolve('web/labs/motion');
 const form=await readFile(resolve(root,'ui/save-name-form.js'),'utf8');
 assert.doesNotMatch(form,/from\s+['"]|workbench|encodeAction|saveLibrary|overwritePoseId/);
 const operations=await readFile(resolve(root,'application/user-save-operations.js'),'utf8');
 assert.doesNotMatch(operations,/\b(?:document|window)\s*\.|showModal|capturePose|applyPose|from\s+['"][^'"]*(?:platform|ui)\//);
 assert.match(operations,/workbench\.saveDraft\(/);
 const main=await readFile(resolve(root,'motion.js'),'utf8');
 assert.doesNotMatch(main,/let pendingPose|\$\('(?:savePoseForm|saveActionForm)'\)\.onsubmit|protectWorkspaceEntry/);
 assert.match(main,/saveLibraryEntries:\s*persistLibraryEntries/);
});

test('控件和素材交互只展示/转交意图，维护层不依赖DOM或存储平台',async()=>{
 const root=resolve('web/labs/motion');
 for(const path of ['ui/workbench-controls.js','ui/library-interactions.js','ui/library-file-inputs.js']){
  const text=await readFile(resolve(root,path),'utf8');assert.doesNotMatch(text,/saveLibrary|workbench\.|compileSequence|capturePose|state\./);
 }
 for(const path of ['application/control-presentation.js','application/library-management.js','application/model-library-operations.js']){
  const text=await readFile(resolve(root,path),'utf8');assert.doesNotMatch(text,/\b(?:document|window)\s*\.|from\s+['"][^'"]*(?:platform|ui)\//);
 }
 const main=await readFile(resolve(root,'motion.js'),'utf8');assert.doesNotMatch(main,/\$\('clips'\)\.addEventListener\('(?:contextmenu|keydown)'/);assert.match(main,/libraryInteractions\.dispose\(/);
 assert.doesNotMatch(main,/\$\('(?:animationFiles|poseFiles)'\)\.onchange|renameModelForm'\)\.onsubmit/);
 const prepare=await readFile(resolve(root,'platform/library-imports.js'),'utf8');assert.doesNotMatch(prepare,/saveLibrary|readLibrary|from\s+['"][^'"]*(?:application|ui)\//);
});

test('场景创建不管理应用，会话关闭阶段不导入DOM和Three.js，入口保留帧装配',async()=>{
 const root=resolve('web/labs/motion'),scene=await readFile(resolve(root,'platform/viewport-scene.js'),'utf8'),lifetime=await readFile(resolve(root,'application/workbench-lifetime.js'),'utf8'),main=await readFile(resolve(root,'motion.js'),'utf8');
 assert.doesNotMatch(scene,/workbench|poseDraft|requestAnimationFrame|saveLibrary/);assert.match(scene,/resizeView\(getCamera\(\)/);
 assert.doesNotMatch(lifetime,/from\s+['"]|\b(?:document|window)\s*\.|new .*Renderer/);
 assert.doesNotMatch(main,/new THREE\.(?:WebGLRenderer|Scene|HemisphereLight|DirectionalLight|GridHelper)|new ResizeObserver/);
 assert.match(main,/cancelAnimationFrame\(animationFrame\)/);assert.match(main,/unsubscribeRootMotion\(\);\s*unsubscribePresentation\(\)/);assert.match(main,/lifetime\.dispose\(\),\s*\{\s*once:\s*true\s*\}/);
});

test('编辑会话复用唯一草稿/历史，输入策略无DOM，监听有统一销毁',async()=>{
 const root=resolve('web/labs/motion'),session=await readFile(resolve(root,'application/edit-session.js'),'utf8'),policy=await readFile(resolve(root,'application/edit-input-policy.js'),'utf8'),view=await readFile(resolve(root,'ui/edit-session-view.js'),'utf8');
 assert.doesNotMatch(session,/\b(?:document|window)\s*\.|capturePose|applyPose|saveLibrary|poseDraft\s*=/);assert.match(session,/workbench\.discardDraft/);assert.match(session,/unsubscribe\(\)/);
 assert.doesNotMatch(policy,/\b(?:document|window)\s*\.|workbench|\.closest\(|\.matches\(/);
 assert.doesNotMatch(view,/workbench|poseDraft|capturePose|saveLibrary/);assert.match(view,/removeEventListener/);
 const main=await readFile(resolve(root,'motion.js'),'utf8');assert.doesNotMatch(main,/function (?:guardDraftInput|refreshDraftTools)\(|\$\('editPose'\)\.onclick|window\.addEventListener\('beforeunload'/);assert.match(main,/editSession\.canEditTimeline\(\)/);assert.match(main,/editView\.dispose\(\);\s*editSession\.dispose\(\);\s*bodyControls\.dispose\(\)/);
});

test('取景录制协调不依赖DOM/编码器，拍摄场景不依赖应用存储',async()=>{
 const root=resolve('web/labs/motion');
 const controller=await readFile(resolve(root,'application/preview-media-controller.js'),'utf8'),view=await readFile(resolve(root,'ui/preview-media-controls.js'),'utf8'),scene=await readFile(resolve(root,'platform/reference-scene.js'),'utf8');
 assert.doesNotMatch(controller,/\b(?:document|window)\s*\.|WebGLRenderer|MediaRecorder|saveLibrary|new .*Sampler/);
 assert.doesNotMatch(view,/workbench|state\.|sampleSequence|ReferenceCapture|WebGLRenderer/);
 assert.doesNotMatch(scene,/saveLibrary|from\s+['"][^'"]*(?:application|ui)\//);
 const main=await readFile(resolve(root,'motion.js'),'utf8');
 assert.doesNotMatch(main,/let referenceRecording|function (?:currentFramingPlan|fitCurrentMotion|createReferenceCapture|referenceName)\(|\$\('(?:takePhoto|recordVideo|fit)'\)\.onclick/);
 assert.match(main,/createCapture:\s*createReferenceCapture/);assert.match(main,/mediaController\.dispose\(/);assert.match(main,/mediaView\.dispose\(/);
});

test('时间轴展示复用原比例算法，不接管采样、历史及编排状态',async()=>{
 const root=resolve('web/labs/motion');
 const view=await readFile(resolve(root,'ui/timeline-view.js'),'utf8'),model=await readFile(resolve(root,'application/timeline-presentation.js'),'utf8');
 assert.doesNotMatch(view,/workbench|saveLibrary|compileSequence|sampleSequence|createTimelineHistory|state\./);
 assert.match(view,/from '..\/core\/timeline-view.js'/);
 assert.doesNotMatch(model,/\b(?:document|window)\s*\.|from\s+['"]|capturePose|sampleSequence/);
 const main=await readFile(resolve(root,'motion.js'),'utf8');
 assert.doesNotMatch(main,/let timelinePixels|function (?:renderTimelineRuler|updatePlayhead|setTimelineZoom)\(|const zoomTools=|button\.style\.flexBasis/);
 assert.match(main,/createTimelinePresentation\(/);assert.match(main,/timelineView\.dispose\(/);
});

test('模型准备/场景/菜单/生命周期分工，入口不再内联资源包与切换事务',async()=>{
 const root=resolve('web/labs/motion');
 const lifecycle=await readFile(resolve(root,'application/model-lifecycle.js'),'utf8'),prepare=await readFile(resolve(root,'platform/model-preparation.js'),'utf8'),scene=await readFile(resolve(root,'platform/model-scene.js'),'utf8'),menu=await readFile(resolve(root,'ui/model-menu.js'),'utf8');
 assert.doesNotMatch(lifecycle,/\b(?:document|window)\s*\.|new .*SkeletonHelper|\.geometry\.dispose|\.showModal\(/);
 assert.doesNotMatch(prepare,/saveLibrary|from\s+['"][^'"]*application\//);
 assert.doesNotMatch(scene,/saveLibrary|readLibrary|confirm\(/);
 assert.doesNotMatch(menu,/from\s+['"]|saveLibrary|loadFiles|discardDraft|poseDraft/);
 const main=await readFile(resolve(root,'motion.js'),'utf8');
 assert.doesNotMatch(main,/async function importModel|async function allowModelSwitch|async function demo|new THREE\.SkeletonHelper|verifiedBuiltinFile|replaceModel'\)\.onchange/);
 assert.match(main,/createModelLifecycle\(/);assert.match(main,/modelMenu\.dispose\(/);
});
