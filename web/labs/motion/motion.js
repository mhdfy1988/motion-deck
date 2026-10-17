import { bindDesktopSettings } from './ui/desktop-settings.js';
import { bindDesktopChrome } from './ui/desktop-chrome.js';
import { bindDesktopUpdates } from './ui/desktop-updates.js';
import { bindDesktopControl } from './ui/desktop-control.js';
import { createEditSession } from './application/edit-session.js';
import { bindEditSessionView } from './ui/edit-session-view.js';
import { createSessionState } from './application/session-state.js';
import { createTimelineController } from './application/timeline-controller.js';
import { createWorkbenchOperations } from './application/workbench-operations.js';
import { exportMotionAssets } from './platform/motion-export.js';
import { createMotionExportUI } from './ui/motion-export-ui.js';
import { createMotionPrompts, showMotionMenu } from './ui/motion-prompts.js';
import { createLibraryRename } from './ui/library-rename.js';
import { createAIWorkspaceUI } from './ui/ai-workspace.js';
import { createLibraryManagement } from './application/library-management.js';
import { assetOwner } from './core/ai-workspace.js';
import { bindLibraryInteractions, libraryIdentity } from './ui/library-interactions.js';
import { boundsSampleTimes, measureMotionBounds } from './platform/motion-bounds.js';
import { viewPresets, viewPreset, framingDirections } from './platform/view-presets.js';
import { fitView } from './platform/view-camera.js';
import { actionLabel, actionDisplayNames } from './action-labels.js';
import { downloadReference } from './platform/reference-capture.js';
import { createReferenceCaptureFactory } from './platform/reference-scene.js';
import { createPreviewMediaController } from './application/preview-media-controller.js';
import { bindPreviewMediaControls, referenceFilename } from './ui/preview-media-controls.js';
import { createControlMedia } from './platform/control-media.js';
import { builtins, readCatalog } from './application/model-catalog.js';
import { prepareLibraryImport } from './platform/library-imports.js';
import { createModelLibraryOperations } from './application/model-library-operations.js';
import { bindLibraryFileInputs } from './ui/library-file-inputs.js';
import {
  modelKey,
  readLibrary,
  saveLibrary,
  lastSavedModel,
  savedModel,
  removeLegacyTestModels,
  encodeAction,
  decodeAction,
} from './application/action-library.js';
import { THREE, disposeModel } from './platform/three-adapter.js';
import { createViewportScene } from './platform/viewport-scene.js';
import { createWorkbenchLifetime } from './application/workbench-lifetime.js';
import { bindPoseEditorLayout } from './ui/pose-editor-layout.js';
import { createLibraryView } from './ui/library-view.js';
import { createPlayerView } from './ui/player-view.js';
import { bindSaveNameForm } from './ui/save-name-form.js';
import { createUserSaveOperations } from './application/user-save-operations.js';
import { createModelLifecycle } from './application/model-lifecycle.js';
import { prepareModel, fetchModelFiles } from './platform/model-preparation.js';
import { createModelScene } from './platform/model-scene.js';
import { bindModelMenu } from './ui/model-menu.js';
import { createPreviewController } from './application/preview-controller.js';
import {
  createLibraryPresentation,
  sourcePresentations,
  assetPresentation,
} from './application/library-presentation.js';
import {
  capturePose,
  applyPose,
  compileSequence,
  actionRange,
  makeCompositeClip,
} from './core/sequence-core.js';
import { icons } from '../../icons-data.js';
import { actionFormatVersion } from './core/action-codec.js';
import { BodyControls } from './pose/body-controls.js';
import { bindTimelineEdit } from './ui/timeline-edit.js';
import { createTimelineHistory } from './core/timeline-history.js';
import { createControlPresentation } from './application/control-presentation.js';
import { createWorkbenchControls } from './ui/workbench-controls.js';
import { createTimelinePresentation } from './application/timeline-presentation.js';
import { createTimelineView } from './ui/timeline-view.js';
const $ = (id) => document.getElementById(id),
  stage = $('stage');
document.querySelector('.brand-mark').innerHTML = icons.film;
const prompts = createMotionPrompts();
bindDesktopSettings({
  prompts,
  onError: (error) => message(error.message, true),
  isBusy: () => state.busy,
});
bindDesktopUpdates({
  prompts,
  onError: (error) => message(error.message, true),
  isBusy: () => state.busy,
});
bindDesktopChrome({ onError: (error) => message(error.message, true) });
// 简版保留唯一编排主线；高级验证控件仅在显式工具入口展示。
const advancedTools = new URLSearchParams(location.search).get('tools') === '1';
// 手动编辑开放明确骨链的手脚拖动和旋转，不开放骨盆平移或缩放。
const poseEditingEnabled = true;
$('body-translate').hidden = true;
$('body-rotate').hidden = true;
$('posePanel').querySelector('.hint').textContent = '拖关节点摆姿 · 点击旋转 · Esc 取消';
document.body.classList.toggle('pose-editing-disabled', !poseEditingEnabled);
let displayedActionNames = new Map();
const displayAction = (name) =>
  advancedTools ? name : (displayedActionNames.get(name) ?? actionLabel(name));
const displaySpan = (span) =>
  span.kind === 'action' && !span.clip?.recipeItems && span.name === span.clip?.name
    ? displayAction(span.name)
    : span.name;
document.body.classList.toggle('advanced-tools', advancedTools);
// 正常编辑仅保留直接操作及历史；旧数值字段只留显式高级诊断入口，不生成浮层。
const poseLayout = advancedTools ? null : bindPoseEditorLayout({ stage, icons });
if (advancedTools) {
  document
    .querySelector('.player')
    .insertBefore($('capturePose'), document.querySelector('.speed-control'));
  document.querySelector('.player').insertBefore($('editPose'), $('capturePose'));
}
$('capturePose').title = '保存原始姿势，不含整体位移输出过滤';
if (!poseEditingEnabled && $('viewportPoseTools')) $('viewportPoseTools').hidden = true;
// 单帧提取沿用保存入口；导入动作/姿势暂不开放。
$('animationFiles').closest('label').hidden = true;
$('appendClips').hidden = true;
const exportButton = document.createElement('button');
exportButton.id = 'exportMotion';
exportButton.textContent = '导出';
exportButton.disabled = true;
document.querySelector('.section-head').append(exportButton);
// 视角统一来自同一预设目录，界面分组不复制相机算法。
$('viewPreset').replaceChildren();
for (const [family, name] of [
  ['perspective', '自由视角'],
  ['flat', '平视'],
  ['overhead', '斜俯视'],
  ['isometric', '等角'],
]) {
  const group = document.createElement('optgroup');
  group.label = name;
  const legend = document.createElement('legend');
  legend.textContent = name;
  group.append(legend);
  for (const preset of viewPresets.filter((p) => p.family === family)) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.label;
    group.append(option);
  }
  $('viewPreset').append(group);
}

$('appendClips').onclick = () =>
  $(activeLibrary === 'pose' ? 'poseFiles' : 'animationFiles').click();
// 编辑工具使用统一图标；完整中文名称和快捷键保留在提示及无障碍标签中。
for (const [id, icon, label, shortcut] of [
  ['timelineUndo', 'undo-2', '撤销', 'Ctrl+Z'],
  ['timelineRedo', 'redo-2', '重做', 'Ctrl+Y'],
  ['timelineAll', 'check', '全选', 'Ctrl+A'],
  ['timelineNone', 'x', '全不选', ''],
  ['timelineRemove', 'trash-2', '删除选中', 'Delete'],
]) {
  const button = $(id);
  if (id === 'timelineAll' || id === 'timelineNone') button.textContent = label;
  else {
    button.innerHTML = icons[icon];
    button.classList.add('icon-button');
  }
  button.setAttribute('aria-label', label);
  button.title = label + (shortcut ? `（${shortcut}）` : '');
}
function message(text, error = false) {
  $('status').textContent = text;
  $('error').hidden = !error;
  $('error').textContent = error ? text : '';
}
$('takePhoto').innerHTML = icons.camera;
$('takePhoto').classList.add('icon-button');
$('takePhoto').setAttribute('aria-label', '拍照');
const viewportScene = createViewportScene({
  stage,
  advancedTools,
  pixelRatio: devicePixelRatio,
  onError: (text) => message(text, true),
});
const { scene, renderer, controls, grid } = viewportScene;
let camera = viewportScene.camera;
const state = createSessionState(new THREE.Vector3()),
  timelineController = createTimelineController(state);
// 模块导出用于同一页面的操作适配；不向主进程或window暴露执行脚本权限。
export const workbench = createWorkbenchOperations(state);
const controlsView = createWorkbenchControls({
  getElement: $,
  body: document.body,
  icons,
  getWorkspaceButtons: () => $('clips').querySelectorAll('.workspace-toolbar button'),
});
const timelineView = createTimelineView({
  getElement: $,
  getPlayback: () => ({
    total: state.sequence?.duration ?? 0,
    time: state.time,
    playing: state.playing,
  }),
  onSelect: selectSegment,
});
const previewController = createPreviewController({
  state,
  workbench,
  getSourceIndex: () => Number($('source').value),
  onChange: updateButtons,
  onSource: ({ clip }, { transient }) => {
    $('sourceTime').value = state.sourceTime.toFixed(2);
    if (transient) return;
    $('clips')
      .querySelectorAll('button')
      .forEach((button) =>
        button.classList.toggle(
          'active',
          Number(button.dataset.clipIndex) === Number($('source').value),
        ),
      );
    $('sourceTime').max = clip?.duration || 0;
    $('currentClip').textContent = clip ? displayAction(clip.name) : '静态姿势';
    $('currentClip').title = clip?.name ?? '';
    boneValues();
    updateButtons();
  },
  onSequence: sequenceControls,
  onCustom: (preview) => {
    $('currentClip').textContent = preview.name;
  },
});
const playerView = createPlayerView({
  elements: {
    play: $('play'),
    restart: $('restart'),
    seek: $('previewSeek'),
    timelineSeek: $('seek'),
    sourceSeek: $('sourceSeek'),
    clock: $('clock'),
    context: $('previewContext'),
    speed: $('speed'),
    speedButtons: [...document.querySelectorAll('.speed-buttons button')],
  },
  icons,
  onToggle: () => previewController.toggle(),
  onRestart: () => previewController.restart(),
  onSeek: (time) => previewController.seek(time),
  onTimelineSeek: (time) => previewController.seek(time, 'sequence'),
});
const rootMotionTools = document.createElement('div');
rootMotionTools.className = 'root-motion-options';
rootMotionTools.setAttribute('role', 'group');
rootMotionTools.setAttribute('aria-label', '保留整体位移');
rootMotionTools.innerHTML =
  '<span>位移</span><label title="保留整体X/Z方向的位移"><input id="previewHorizontalMotion" type="checkbox" checked>水平</label><label title="保留整体Y方向的升降"><input id="previewVerticalMotion" type="checkbox" checked>纵向</label>';
document
  .querySelector('.view-head>div')
  .insertBefore(rootMotionTools, poseLayout ? $('capturePose') : null);
function syncRootMotionTools() {
  controlsView.renderRootMotion({
    ...state.rootMotion,
    disabled: !state.root || state.busy || !!state.poseDraft,
  });
}
for (const id of ['previewHorizontalMotion', 'previewVerticalMotion'])
  $(id).onchange = () => {
    try {
      workbench.setRootMotion({
        horizontal: $('previewHorizontalMotion').checked,
        vertical: $('previewVerticalMotion').checked,
      });
    } catch (error) {
      message(error.message, true);
    }
    syncRootMotionTools();
  };
const motionExportUI = createMotionExportUI({
  getRootMotion: () => state.rootMotion,
  getModel: () => state.model.name,
  getEntries: () => [
    ...state.clips.map((clip, index) => ({
      id: 'source:' + index,
      kind: 'action',
      name: displayAction(clip.name),
      duration: clip.duration,
      items: [{ kind: 'action', name: clip.name, clip, transition: 0 }],
    })),
    ...state.customs
      .filter((a) => assetOwner(state.aiWorkspace, a.id)?.entry.state !== 'trash')
      .map((action) => {
        const items = customItems(action);
        return {
          id: 'custom:' + action.id,
          kind: 'action',
          name: action.name,
          duration: compileSequence(items, state.sampler).duration,
          items,
        };
      }),
    ...state.poses
      .filter((p) => assetOwner(state.aiWorkspace, p.id)?.entry.state !== 'trash')
      .map((pose) => ({ id: 'pose:' + pose.id, kind: 'pose', name: pose.name, pose: pose.pose })),
  ],
  onError: (error) => message('导出失败：' + error.message, true),
  runExport: async (entries, signal, rootMotion) => {
    if (state.busy || !state.root) throw new Error('当前模型不可导出');
    const playing = state.playing;
    state.playing = false;
    state.busy = true;
    controls.stopMotion();
    updateButtons();
    try {
      const result = await exportMotionAssets({
        root: state.root,
        base: state.sampler.base,
        entries,
        modelName: state.model.name,
        copyright: builtins.find((model) => model.id === state.model.builtinId)?.source ?? '',
        signal,
        onProgress: message,
        rootMotion,
      });
      if (signal.aborted) throw new DOMException('已取消导出', 'AbortError');
      downloadReference(result.blob, result.name);
      message('素材已导出 · ' + (result.name.endsWith('.zip') ? 'ZIP' : 'GLB'));
    } catch (error) {
      if (error.name === 'AbortError') message('已取消导出');
      throw error;
    } finally {
      state.busy = false;
      state.playing = playing;
      updateButtons();
    }
  },
});
exportButton.onclick = () => {
  if (!state.busy && state.root) motionExportUI.open();
};
const mediaView = bindPreviewMediaControls({
  photoButton: $('takePhoto'),
  recordButton: $('recordVideo'),
  fitButton: $('fit'),
  indicator: $('recordingIndicator'),
  controls,
  getAreas: () => [
    ...document.querySelectorAll('.top,.library,.settings,.player,.timeline,#stage,#previewSeek'),
  ],
  onPhoto: () => mediaController.photo(),
  onRecord: () => mediaController.record(),
  onFit: () => mediaController.fit(),
});
const createReferenceCapture = createReferenceCaptureFactory({
  scene,
  renderer,
  grid,
  getCamera: () => camera,
  getRoot: () => state.root,
  getHelper: () => state.helper,
  onStatus: (text) => {
    message(text);
    mediaView.progress(text);
  },
  onRelease: () => mediaView.hideProgress(),
});
const mediaController = createPreviewMediaController({
  state,
  workbench,
  getSourceIndex: () => Number($('source').value),
  getSpeed: () => Number($('speed').value),
  getName: () =>
    referenceFilename(
      state.mode === 'sequence' ? $('actionTitle').textContent : $('currentClip').textContent,
      !advancedTools && $('viewPreset').value !== 'perspective'
        ? viewPreset($('viewPreset').value).label
        : '',
    ),
  isAdvanced: () => advancedTools,
  stopMotion: () => controls.stopMotion(),
  frame,
  sampleTimes: boundsSampleTimes,
  measureBounds: measureMotionBounds,
  nextFrame: () => new Promise((resolve) => requestAnimationFrame(resolve)),
  createCapture: createReferenceCapture,
  download: downloadReference,
  lockInteraction: () => mediaView.lock(),
  onChange: updateButtons,
  message,
  onStopRequested: () => mediaView.stopRequested(),
  onRecordingEnd: () => mediaView.hideProgress(true),
});
state.selection = new Set();
const history = createTimelineHistory(
  () => ({
    items: state.items.map((item) => ({ ...item })),
    selection: [...state.selection],
    selected: state.selected,
    transition: state.selectedTransition,
    time: state.time,
    actionId: state.editingActionId,
    title: $('actionTitle').textContent,
  }),
  (saved) => {
    state.items = saved.items.map((item) => ({ ...item }));
    state.selection = new Set(saved.selection);
    state.selected = saved.selected;
    state.selectedTransition = saved.transition;
    state.time = saved.time;
    state.editingActionId = saved.actionId;
    $('actionTitle').textContent = saved.title;
    state.playing = false;
    rebuild();
    if (state.items.length) showSequence(state.time);
    else showSource(0);
  },
  () => {
    $('timelineUndo').disabled = !history.canUndo;
    $('timelineRedo').disabled = !history.canRedo;
  },
);
function selectionUI() {
  const valid = new Set(
    state.sequence?.spans.map((s) => (s.kind === 'transition' ? `transition:${s.targetId}` : s.id)),
  );
  state.selection = new Set([...state.selection].filter((key) => valid.has(key)));
  timelineView.renderSelection({ selection: state.selection, hasItems: !!state.items.length });
}
function selectSegment(button, event = {}, preserve = false) {
  if (state.busy) return;
  const key = button.dataset.key,
    keys = [...$('segments').children].map((b) => b.dataset.key);
  if (event.shiftKey && state.anchor && keys.includes(state.anchor)) {
    const a = keys.indexOf(state.anchor),
      b = keys.indexOf(key);
    if (!event.ctrlKey && !event.metaKey) state.selection.clear();
    keys.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((k) => state.selection.add(k));
  } else if (event.ctrlKey || event.metaKey) {
    if (state.selection.has(key)) state.selection.delete(key);
    else state.selection.add(key);
    state.anchor = key;
  } else {
    if (!preserve || !state.selection.has(key)) state.selection = new Set([key]);
    state.anchor = key;
  }
  const active = state.selection.has(key) ? key : [...state.selection].at(-1),
    transition = !!active?.startsWith('transition:');
  state.selected = state.items.findIndex((i) => i.id === (transition ? active.slice(11) : active));
  state.selectedTransition = transition;
  state.playing = false;
  showSequence(Number(button.dataset.start));
  selectionUI();
  selectedControls();
  updateButtons();
  button.focus();
}
const quickActions = [
  ['Idle_Loop', '站立待机'],
  ['Sword_Idle', '持剑待机'],
  ['Sword_Attack', '挥剑'],
  ['Sword_Idle', '持剑待机'],
  ['Idle_Loop', '站立待机'],
];
export const bodyControls = new BodyControls({
  scene,
  camera,
  canvas: renderer.domElement,
  stage,
  controls,
  getState: () => state,
  onMoveRoot: () => workbench.userMoveRoot(),
  onConstraintMode: (mode) => workbench.setConstraintMode(mode),
  onConstrain: (solver) => workbench.constrainUserGesture(solver),
  onBegin: (bones, options) => workbench.beginUserPoseGesture(bones, options),
  onFinish: (cancel) => workbench.finishUserPoseGesture(cancel),
  onError: (error) => message(error.message, true),
  onEdit: (chain) => {
    const index = state.bones.indexOf(chain.middle);
    if (index >= 0) $('bone').value = index;
    boneValues();
  },
});
controls.allowPointer = (e) => !bodyControls.hitGizmo(e);
const editView = bindEditSessionView({
  documentTarget: document,
  windowTarget: window,
  body: document.body,
  panel: $('posePanel'),
  sourcePanel: $('sourcePanel'),
  editButton: $('editPose'),
  undoButton: $('undoDrag'),
  resetButton: $('resetPose'),
  timeline: document.querySelector('.timeline'),
  poseLayout,
  advancedTools,
  icons,
  stopMotion: () => controls.stopMotion(),
  onToggle: () => editSession.toggle(),
  onPanelChanged: () => editSession.panelChanged(),
  onHistory: (direction) => editSession.history(direction),
  getInputState: () => editSession.inputState(),
  preventUnload: () => editSession.preventUnload(),
  onBlocked: () => message('请先保存或放弃姿势草稿'),
  onTimelineHistory: (direction) => history[direction](),
  onTimelineAll: () => $('timelineAll').click(),
});
const editSession = createEditSession({
  state,
  workbench,
  isEnabled: () => poseEditingEnabled,
  isOpen: () => $('posePanel').open,
  setOpen: (value) => {
    $('posePanel').open = value;
  },
  confirm: (...args) => prompts.ask(...args),
  message,
  clearSelection: () => bodyControls.clearSelection(),
  renderEditing: (editing) => editView.renderEditing(editing),
  renderHistory: (model) => editView.renderHistory(model),
  onChange: updateButtons,
  notifyDraft: (dirty) => {
    void globalThis.motionDeckDesktop?.controlDraftState(dirty);
  },
});
$('resetPose').onclick = () => {
  if (!state.root || state.busy) return;
  state.playing = false;
  state.mode = 'pose';
  applyPose(state.root, state.sampler.base);
  boneValues();
  updateButtons();
  message('已恢复初始姿势');
};
function updateButtons() {
  const playback = previewController.snapshot();
  controlsView.render(
    createControlPresentation({
      hasModel: !!state.root,
      busy: state.busy,
      hasDraft: !!state.poseDraft,
      hasClips: !!state.clips.length,
      hasBones: !!state.bones.length,
      hasPoses: !!state.poses.length,
      hasItems: !!state.items.length,
      quickAvailable: quickActions.every(([name]) => state.clips.some((c) => c.name === name)),
      recording: mediaController.recording,
      context: playback.context,
      poseMode: state.mode === 'pose',
    }),
  );
  sourceCardUI();
  transitionControls();
  playerView.render(playback);
  editToolsUI();
}
function frame(side = false) {
  if (!state.root) return;
  controls.stopMotion();
  if (!advancedTools) {
    const aspect = stage.clientWidth / Math.max(stage.clientHeight, 1),
      preset = viewPreset($('viewPreset').value);
    const next =
      preset.id === 'perspective'
        ? new THREE.PerspectiveCamera(38, aspect, 0.01, 1000)
        : new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
    camera = next;
    controls.object = camera;
    controls.enableRotate = preset.id === 'perspective';
    bodyControls.camera = camera;
    bodyControls.gizmo.camera = camera;
    controls.target.copy(
      fitView(
        camera,
        state.viewBounds ?? state.bounds,
        new THREE.Vector3(...preset.direction),
        aspect,
        framingDirections(preset).map((d) => new THREE.Vector3(...d)),
      ),
    );
    controls.syncCamera();
    return;
  }
  const d = state.size * 1.5;
  camera.near = Math.max(state.size / 1000, 0.001);
  camera.far = state.size * 100;
  camera.position
    .copy(state.center)
    .add(new THREE.Vector3(side ? d : d * 0.75, side ? 0 : d * 0.25, side ? 0 : d));
  camera.updateProjectionMatrix();
  controls.target.copy(state.center);
  controls.syncCamera();
}
function options(element, values) {
  element.replaceChildren();
  values.forEach((name, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = name;
    element.append(o);
  });
}
// 显示三位小数，未经编辑时保留原始精度，避免把完整动作的末帧裁掉。
function writeTime(id, value) {
  const el = $(id);
  el.value = Number(value.toFixed(3));
  el.dataset.exact = String(value);
  el.dataset.display = el.value;
}
function readTime(id) {
  const el = $(id);
  return el.value === el.dataset.display ? Number(el.dataset.exact) : el.valueAsNumber;
}
function boneValues() {
  const bone = state.bones[Number($('bone').value)];
  if (!bone) return;
  const e = new THREE.Euler().setFromQuaternion(bone.quaternion, 'XYZ');
  ['rx', 'ry', 'rz'].forEach(
    (id, i) => ($(id).value = THREE.MathUtils.radToDeg([e.x, e.y, e.z][i]).toFixed(1)),
  );
}
function showSource(time = 0, playing = false) {
  return previewController.source(time, playing);
}
// 分类只负责素材展示，保留统一动作索引及编排引用。

let activeLibrary = 'default';
state.customs = [];
state.editingActionId = null;
state.modelKey = null;
state.modelFiles = [];
function filterLibrary() {
  workbench.sync();
  const visible = state.root && capturePose(state.root);
  const model = createLibraryPresentation(
    {
      activeLibrary,
      clips: state.clips,
      poses: state.poses,
      customs: state.customs,
      aiWorkspace: state.aiWorkspace,
    },
    customDuration,
  );
  libraryView.render(model, (container) => workspaceUI.render(container));
  if (visible) applyPose(state.root, visible);
}
function libraryData(
  actions = state.customs,
  poses = state.poses,
  thirdParty = state.clips.filter((c) => c.thirdParty),
  workspace = state.aiWorkspace,
) {
  const imported = thirdParty.map((c) =>
    encodeAction(
      [{ kind: 'action', name: c.name, clip: c, transition: 0 }],
      c.libraryId,
      c.name,
      state.root,
    ),
  );
  return {
    version: workspace?.tasks.length ? 4 : actionFormatVersion([...actions, ...imported]),
    ...(workspace?.tasks.length ? { aiWorkspace: workspace } : {}),
    modelKey: state.modelKey,
    model: state.model,
    testPoseCleanup: 1,
    actions,
    poses,
    thirdParty: imported,
  };
}
function renderClips() {
  displayedActionNames = actionDisplayNames(state.clips.map((clip) => clip.name));
  options(
    $('source'),
    state.clips.map((clip) => displayAction(clip.name)),
  );
  const idle = state.clips.findIndex((clip) => clip.name === 'Idle_Loop');
  if (idle >= 0) $('source').value = idle;
  resetRange();
  libraryView.setSources(sourcePresentations(state.clips, displayAction));
  filterLibrary();
  $('animations').textContent = state.clips.length;
  updateButtons();
}
// 姿势是当前模型的完整节点快照；拖入时间轴时独立复制，不带素材身份字段。
function previewPose(pose) {
  if (state.busy) return;
  workbench.pose(pose);
  $('currentClip').textContent = pose.name;
  boneValues();
  $('clips')
    .querySelectorAll('button')
    .forEach((row) => row.classList.toggle('active', row.dataset.poseId === pose.id));
  updateButtons();
}
const libraryRename = createLibraryRename({
  rename: ({ kind, id, name, expected }) =>
    workbench.renameLibraryEntry({ kind, id, name }, expected),
  onSaved: (name) => message('已重命名为“' + name + '”'),
});
const libraryManagement = createLibraryManagement({
  state,
  workbench,
  confirm: (...args) => prompts.ask(...args),
  persist: persistLibraryEntries,
  onBusyChange: updateButtons,
});
function renameLibraryEntry(button) {
  const request = libraryManagement.renameRequest(libraryIdentity(button));
  if (request) libraryRename.open(request);
}
async function deleteLibraryEntry(button) {
  try {
    const result = await libraryManagement.remove(libraryIdentity(button));
    if (!result) return;
    if (result.readonly) {
      message('默认素材不可删除');
      return;
    }
    if (result.trashed) {
      message('已移入回收区，可按任务恢复');
      return;
    }
    options(
      $('poses'),
      state.poses.map((p) => p.name),
    );
    if (result.resetActionTitle) $('actionTitle').textContent = '未命名动作';
    if (result.resetPreview) showSource(0, false);
    filterLibrary();
    message('已删除“' + result.name + '”');
  } catch (error) {
    message('删除失败：' + error.message, true);
  }
}
// 组件只收展示数据与回调；业务检查、保存和唯一素材状态仍在原工作台。
function customDuration(action) {
  return compileSequence(decodeAction(action, state.root), state.sampler).duration;
}
const libraryView = createLibraryView({
  elements: {
    container: $('clips'),
    search: $('librarySearch'),
    count: $('clipCount'),
    actionsTab: $('library-actions'),
    poseTab: $('library-pose'),
    appendButton: $('appendClips'),
  },
  icons,
  editingEnabled: poseEditingEnabled,
  onTab: (key) => {
    activeLibrary = key;
    filterLibrary();
  },
  onActionGroup: (key) => {
    activeLibrary = activeLibrary === key ? 'actions' : key;
    filterLibrary();
  },
  onPreview: (entry) => {
    if (entry.kind === 'source') {
      $('source').value = entry.index;
      resetRange();
      showSource(0, true);
      return;
    }
    const asset = (entry.kind === 'pose' ? state.poses : state.customs).find(
      (asset) => asset.id === entry.id,
    );
    if (entry.kind === 'pose') previewPose(asset);
    else previewCustom(asset);
  },
  onEditPose: (entry) => {
    previewPose(state.poses.find((pose) => pose.id === entry.id));
    $('posePanel').open = true;
  },
  onRename: renameLibraryEntry,
  onDelete: deleteLibraryEntry,
});
const workspaceUI = createAIWorkspaceUI({
  state,
  workbench,
  message,
  prompts,
  onChange: filterLibrary,
  createRow: (asset, kind) =>
    libraryView.createRow(
      assetPresentation(asset, kind, kind === 'custom' ? customDuration(asset) : undefined),
    ),
});
function copyLibraryEntry(row) {
  if (!row) return;
  try {
    const result = libraryManagement.copy(libraryIdentity(row));
    message('已复制“' + result.name + '”');
  } catch (error) {
    message(error.message, true);
  }
}
async function pasteLibraryEntry() {
  try {
    const result = await libraryManagement.paste(activeLibrary);
    options(
      $('poses'),
      state.poses.map((p) => p.name),
    );
    activeLibrary = result.kind === 'pose' ? 'pose' : 'custom';
    $('librarySearch').value = '';
    filterLibrary();
    const row = [...$('clips').querySelectorAll('[data-pose-id],[data-custom-id]')].find(
      (row) => (row.dataset.poseId ?? row.dataset.customId) === result.id,
    );
    row?.focus();
    message('已粘贴“' + result.name + '”');
  } catch (error) {
    message('粘贴失败：' + error.message, true);
  }
}
const libraryInteractions = bindLibraryInteractions({
  container: $('clips'),
  getMenu: () => libraryManagement.menu(activeLibrary),
  showMenu: showMotionMenu,
  extraMenu: (row) => workspaceUI.menu(row),
  onCopy: copyLibraryEntry,
  onPaste: pasteLibraryEntry,
  onRename: renameLibraryEntry,
  onDelete: deleteLibraryEntry,
});
// 仅保留共享持久化适配与保存后的界面接线，不在表单中复制业务事务。
function persistLibraryEntries({
  actions = state.customs,
  poses = state.poses,
  aiWorkspace = state.aiWorkspace,
}) {
  return saveLibrary(libraryData(actions, poses, undefined, aiWorkspace), state.modelFiles);
}
const userSave = createUserSaveOperations({
  state,
  workbench,
  confirm: (...args) => prompts.ask(...args),
  saveEntries: persistLibraryEntries,
  onBusyChange: updateButtons,
});
function presentSaved(result) {
  if (result.draft) {
    $('posePanel').open = false;
    if (result.overwrite) message('姿势已覆盖保存');
    return;
  }
  if (result.kind === 'pose') {
    options(
      $('poses'),
      state.poses.map((pose) => pose.name),
    );
    $('poses').value = result.index;
  } else $('actionTitle').textContent = result.name;
  activeLibrary = result.library;
  filterLibrary();
  message(
    result.kind === 'custom'
      ? '动作已保存'
      : activeLibrary === 'ai'
        ? 'AI姿势已保存并标记保留'
        : '姿势已保存到当前模型的自定义姿势库',
  );
}
async function savePoseEntry(name, pose, options = {}) {
  try {
    const result = await userSave.savePose(name, pose, options);
    if (!result) return false;
    presentSaved(result);
    return true;
  } catch (error) {
    message('姿势保存失败：' + error.message, true);
    return false;
  }
}
const poseSaveForm = bindSaveNameForm({
  dialog: $('savePoseDialog'),
  form: $('savePoseForm'),
  input: $('poseName'),
  submit: $('confirmPoseSave'),
  cancelButtons: [$('closePoseDialog'), $('cancelPoseSave')],
  emptyMessage: '请输入姿势名称',
  isBusy: () => state.busy,
  onSubmit: (name, pose) => savePoseEntry(name, pose),
});
const actionSaveForm = bindSaveNameForm({
  dialog: $('saveActionDialog'),
  form: $('saveActionForm'),
  input: $('actionName'),
  submit: $('confirmSave'),
  cancelButtons: [$('cancelSave'), $('closeSaveDialog')],
  emptyMessage: '请输入动作名称',
  isBusy: () => state.busy,
  onSubmit: async (name) => {
    try {
      const result = await userSave.saveAction(name);
      if (!result) return false;
      presentSaved(result);
      return true;
    } catch (error) {
      message('保存失败：' + error.message, true);
      return false;
    }
  },
});
$('capturePose').onclick = async () => {
  try {
    const request = await userSave.preparePose();
    if (!request) return;
    if (request.mode === 'overwrite') await savePoseEntry(request.name, request.pose, request);
    else {
      poseSaveForm.open('', request.pose);
      updateButtons();
    }
  } catch (error) {
    message(error.message, true);
  }
};
function syncPreviewSeek() {
  playerView.renderProgress(previewController.snapshot());
}
function customItems(action) {
  return decodeAction(action, state.root);
}
function previewCustom(action) {
  state.playing = false;
  state.customPreview = {
    id: action.id,
    name: action.name,
    sequence: compileSequence(customItems(action), state.sampler),
  };
  $('clips')
    .querySelectorAll('button')
    .forEach((row) => row.classList.toggle('active', row.dataset.customId === action.id));
  showCustom(0);
  updateButtons();
}
function showCustom(time, transient = false) {
  return previewController.custom(time, { transient });
}
function insertRecipe(items, name, targetKey, after = false) {
  if (state.busy) return;
  const target = targetKey ? state.items.findIndex((i) => i.id === targetKey) : state.items.length;
  if (target < 0) {
    message('放置目标已变化', true);
    return;
  }
  const clip = makeCompositeClip(items, name);
  history.run(() => {
    const empty = !state.items.length,
      added = { id: crypto.randomUUID(), kind: 'action', name, clip, transition: 0 };
    state.items.splice(target + (targetKey && after ? 1 : 0), 0, added);
    if (empty) {
      state.editingActionId = null;
      $('actionTitle').textContent = name;
    }
    state.selection = new Set([added.id]);
    state.selected = state.items.indexOf(added);
    state.selectedTransition = false;
    state.playing = false;
    rebuild();
    showSequence(state.sequence.spans.find((s) => s.id === added.id).start);
  });
  message('已加入自定义动作');
}
async function resetAction() {
  if (
    state.items.length &&
    !(await prompts.ask('清空当前编排？已保存的动作不会删除，此操作可撤销。', '清空', '清空编排'))
  )
    return;
  history.run(() => {
    state.items = [];
    state.selection.clear();
    state.selected = -1;
    state.selectedTransition = false;
    state.playing = false;
    state.editingActionId = null;
    $('actionTitle').textContent = '未命名动作';
    rebuild();
    showSource(0);
  });
}
$('newAction').onclick = resetAction;
$('saveAction').onclick = () => {
  state.playing = false;
  updateButtons();
  actionSaveForm.open(userSave.actionName($('actionTitle').textContent));
};
// 启动恢复模型与素材库，首次使用默认白模；不展开保存动作作为当前编排。
function restoreLastSaved() {
  return modelLifecycle.restore();
}
function editPoint() {
  if (state.busy || state.mode !== 'sequence' || state.selection.size !== 1) return null;
  const id = [...state.selection][0],
    item = state.items.find((i) => i.id === id),
    span = state.sequence?.spans.find((s) => s.id === id);
  if (!item || item.kind !== 'action' || !span) return null;
  const local = state.time - span.start;
  if (local < 0.05 || local > span.duration - 0.05) return null;
  return { item, span, local, cut: span.in + (local / span.duration) * (span.out - span.in) };
}
function editToolsUI() {
  controlsView.renderEditing({ exportDisabled: !state.root || state.busy, canCut: !!editPoint() });
}
function cutAction(mode) {
  const point = editPoint();
  if (!point) return;
  const { item, span, local, cut } = point;
  history.run(() => {
    state.playing = false;
    if (mode === 'split') {
      const tail = {
        ...item,
        id: crypto.randomUUID(),
        in: cut,
        out: span.out,
        duration: span.duration - local,
        transition: 0,
      };
      item.in = span.in;
      item.out = cut;
      item.duration = local;
      state.items.splice(state.items.indexOf(item) + 1, 0, tail);
      state.selection = new Set([tail.id]);
      state.selected = state.items.indexOf(tail);
    } else if (mode === 'left') {
      item.in = cut;
      item.out = span.out;
      item.duration = span.duration - local;
    } else {
      item.in = span.in;
      item.out = cut;
      item.duration = local;
    }
    rebuild();
    showSequence(Math.min(state.time, state.sequence.duration));
  });
}
for (const [id, icon, mode] of [
  ['splitAction', 'scissors', 'split'],
  ['trimLeft', 'panel-left-close', 'left'],
  ['trimRight', 'panel-right-close', 'right'],
]) {
  $(id).innerHTML = icons[icon];
  $(id).classList.add('icon-button');
  $(id).onclick = () => cutAction(mode);
}
function selectedControls() {
  transitionControls();
  editToolsUI();
}
function layoutTimeline() {
  timelineView.layout();
}
function sequenceControls(result) {
  if (result)
    $('currentClip').textContent =
      result.span.kind === 'transition'
        ? `过渡 · 末帧 → 首帧 (${Math.round((result.local / result.span.duration) * 100)}%)`
        : displaySpan(result.span);
  timelineView.renderPlayback(result?.span.start);
  boneValues();
  editToolsUI();
}
function showSequence(time, transient = false) {
  return previewController.sequence(time, { transient });
}
function rebuild() {
  workbench.sync();
  const visible = state.root && capturePose(state.root);
  state.sequence = compileSequence(state.items, state.sampler);
  if (visible) applyPose(state.root, visible);
  state.time = Math.min(state.time, state.sequence.duration);
  timelineView.render(
    createTimelinePresentation(
      {
        ...state.sequence,
        items: state.items,
        selected: state.selected,
        selectedTransition: state.selectedTransition,
      },
      displaySpan,
    ),
  );
  selectionUI();
  layoutTimeline();
  selectedControls();
  updateButtons();
}
function add(item, targetKey, after = false) {
  history.run(() => {
    state.playing = false;
    state.selectedTransition = false;
    const index = targetKey
      ? state.items.findIndex((i) => i.id === targetKey) + (after ? 1 : 0)
      : state.items.length;
    if (index < 0) throw new Error('放置目标已不存在');
    const added = { ...item, id: crypto.randomUUID(), transition: item.transition ?? 0 };
    state.items.splice(index, 0, added);
    state.selected = index;
    state.selection = new Set([added.id]);
    rebuild();
  });
  message('已添加片段');
}
const modelScene = createModelScene({
  state,
  scene,
  grid,
  isSkeletonVisible: () => $('skeleton').checked,
});
const modelMenu = bindModelMenu({
  select: $('replaceModel'),
  input: $('modelFiles'),
  renameButton: $('renameModel'),
  builtins,
  getCurrent: () => modelLifecycle.menuState(),
  onSelect: (value) => modelLifecycle.select(value),
  onFiles: (files) => modelLifecycle.pick(files),
});
const modelLifecycle = createModelLifecycle({
  state,
  workbench,
  builtins,
  storage: {
    modelKey,
    readLibrary,
    saveLibrary,
    lastSavedModel,
    savedModel,
    removeLegacyTestModels,
  },
  prepareModel,
  fetchModelFiles,
  modelScene,
  history,
  confirm: (...args) => prompts.ask(...args),
  message,
  onBusyChange: updateButtons,
  refreshMenu: refreshModelMenu,
  syncMenu: syncModelMenu,
  onInstalled: (candidate) => {
    activeLibrary = candidate.owner?.poses ? 'pose' : 'default';
    $('actionTitle').textContent = '未命名动作';
    $('modelName').textContent = candidate.metadata.name;
    $('modelName').title = candidate.owner
      ? candidate.owner.source + ' · ' + candidate.owner.url
      : candidate.name;
    $('bones').textContent = candidate.info.bones.length;
    $('skins').textContent = candidate.info.skins.length;
    $('placeholder').hidden = true;
    options(
      $('bone'),
      state.bones.map((bone) => bone.name),
    );
    options(
      $('poses'),
      state.poses.map((pose) => pose.name),
    );
    renderClips();
    rebuild();
    frame();
  },
  onReady: (candidate) => {
    if (candidate.owner?.poses && state.poses.length) previewPose(state.poses[0]);
    else showSource(0, false);
  },
  onRestored: (result) => {
    activeLibrary = result.library;
    filterLibrary();
    if (result.pose) previewPose(result.pose);
    message(result.message);
  },
});
const modelLibrary = createModelLibraryOperations({
  state,
  prepareImport: prepareLibraryImport,
  persist: ({
    model = state.model,
    poses = state.poses,
    thirdParty = state.clips.filter((clip) => clip.thirdParty),
  }) => saveLibrary({ ...libraryData(state.customs, poses, thirdParty), model }, state.modelFiles),
  onBusyChange: updateButtons,
  refreshMenu: refreshModelMenu,
});
const libraryFiles = bindLibraryFileInputs({
  actions: $('animationFiles'),
  poses: $('poseFiles'),
  onAppend: async (kind, files) => {
    try {
      const result = await modelLibrary.append(kind, files);
      if (!result) return;
      if (kind === 'action') {
        activeLibrary = 'thirdparty';
        renderClips();
        message(`已追加 ${result.count} 个同骨架动作`);
      } else {
        options(
          $('poses'),
          state.poses.map((p) => p.name),
        );
        activeLibrary = 'pose';
        filterLibrary();
        message(`已导入 ${result.count} 个同骨架姿势`);
      }
    } catch (error) {
      message((kind === 'action' ? '动作未追加：' : '姿势未导入：') + error.message, true);
    }
  },
});
function demo(names, prefix, builtin = null) {
  return modelLifecycle.demo(names, prefix, builtin);
}
function syncModelMenu() {
  modelMenu.sync();
}
async function refreshModelMenu() {
  modelMenu.render(await readCatalog());
}
const modelRenameForm = bindSaveNameForm({
  dialog: $('renameModelDialog'),
  form: $('renameModelForm'),
  input: $('modelDisplayName'),
  submit: $('renameModelForm').querySelector('[type="submit"]'),
  cancelButtons: [$('cancelModelRename'), $('closeModelRename')],
  emptyMessage: '请输入模型名称',
  isBusy: () => state.busy,
  onSubmit: async (name) => {
    try {
      if (!(await modelLibrary.rename(name))) return false;
      $('modelName').textContent = state.model.name;
      message('模型名称已保存');
      return true;
    } catch (error) {
      $('modelName').textContent = state.model.name;
      message('重命名失败：' + error.message, true);
      return false;
    }
  },
});
$('renameModel').textContent = '重命名';
$('renameModel').onclick = () => modelRenameForm.open(state.model.name);
$('humanDemo').onclick = () => {
  const model = builtins[0];
  return demo(model.files, model.prefix, model);
};
$('demo').onclick = () => demo(['RobotExpressive.glb'], '/fixtures/');
function resetRange() {
  const clip = state.clips[Number($('source').value)];
  writeTime('trimIn', 0);
  writeTime('trimOut', clip?.duration ?? 0);
  $('sourceSeek').max = clip?.duration ?? 0;
  sourceCardUI();
}
function sourceCardUI() {
  syncRootMotionTools();
  const clip = state.clips[Number($('source').value)],
    a = readTime('trimIn'),
    b = readTime('trimOut');
  controlsView.renderSource({
    disabled: !clip || state.busy,
    name: clip?.name ?? '未选择动作',
    range:
      clip && Number.isFinite(a) && Number.isFinite(b)
        ? `${Number(a.toFixed(2))}—${Number(b.toFixed(2))} 秒 · 拖到时间轴`
        : clip
          ? '范围待设置 · 拖到时间轴'
          : '拖到时间轴',
  });
}
function prepareInsert(button) {
  if (!state.root || state.busy) return null;
  if (button.dataset.poseId) {
    const pose = state.poses.find((p) => p.id === button.dataset.poseId);
    return pose
      ? {
          kind: 'pose',
          name: pose.name,
          pose: structuredClone(pose.pose),
          duration: 1,
          modelKey: state.modelKey,
          poseId: pose.id,
        }
      : null;
  }
  if (button.dataset.customId) {
    const action = state.customs.find((a) => a.id === button.dataset.customId);
    return action
      ? {
          kind: 'recipe',
          name: action.name,
          modelKey: state.modelKey,
          items: decodeAction(action, state.root),
        }
      : null;
  }
  if (button.id === 'transitionSource')
    return state.items.length > 1 ? { kind: 'transition', root: state.root } : null;
  const index =
      button.dataset.clipIndex === undefined
        ? Number($('source').value)
        : Number(button.dataset.clipIndex),
    clip = state.clips[index];
  if (!clip) return null;
  const current = index === Number($('source').value),
    item = {
      kind: 'action',
      name: clip.name,
      clip,
      ...(current ? { in: readTime('trimIn'), out: readTime('trimOut') } : {}),
    };
  try {
    actionRange(item);
    return item;
  } catch (error) {
    message(error.message, true);
    return null;
  }
}
// 过渡仍归属后段；这里只解析用户指定的片段边界，不自动补齐。
function transitionTarget(key, after = false) {
  const index = state.items.findIndex((i) => i.id === key);
  if (index < 0) return null;
  const target = index + (after ? 1 : 0);
  return target > 0 && target < state.items.length ? state.items[target] : null;
}
function canInsert(item, key, after) {
  if (!editSession.canEditTimeline()) return false;
  if (item.kind === 'recipe') return item.modelKey === state.modelKey;
  if (item.kind === 'pose')
    return item.modelKey === state.modelKey && state.poses.some((p) => p.id === item.poseId);
  if (item.kind !== 'transition') return state.clips.includes(item.clip);
  const target = transitionTarget(key, after);
  return item.root === state.root && !!target && !target.transition;
}
function transitionControls() {
  const ready = !!state.root && !state.busy,
    item = state.items[state.selected];
  controlsView.renderTransition({
    sourceDisabled: !ready || state.items.length < 2,
    addDisabled:
      !ready ||
      state.selection.size !== 1 ||
      state.selectedTransition ||
      !transitionTarget(item?.id) ||
      !!item?.transition,
  });
}
function addTransition(key, after = false) {
  const request = { kind: 'transition', root: state.root };
  if (!canInsert(request, key, after)) return;
  const item = transitionTarget(key, after);
  history.run(() => {
    item.transition = 0.35;
    state.playing = false;
    state.selected = state.items.indexOf(item);
    state.selectedTransition = true;
    state.selection = new Set([`transition:${item.id}`]);
    rebuild();
    showSequence(
      state.sequence.spans.find((s) => s.targetId === item.id && s.kind === 'transition').start,
    );
  });
  $('segments').querySelector('.selected')?.focus();
  message('已添加过渡');
}
function insertAction(item, targetKey, after) {
  if (item.kind === 'recipe') {
    if (canInsert(item, targetKey, after)) insertRecipe(item.items, item.name, targetKey, after);
    return;
  }
  if (item.kind === 'transition') {
    if (canInsert(item, targetKey, after)) addTransition(targetKey, after);
    return;
  }
  if (item.kind === 'pose') {
    if (canInsert(item, targetKey, after)) {
      const { modelKey, poseId, ...saved } = item;
      add(saved, targetKey, after);
      showSequence(state.sequence.spans.find((s) => s.id === state.items[state.selected].id).start);
    }
    return;
  }
  if (state.busy || !state.clips.includes(item.clip)) {
    message('素材已变化，未放置动作', true);
    return;
  }
  if (targetKey && !state.items.some((i) => i.id === targetKey)) {
    message('放置目标已变化，请重新拖动', true);
    return;
  }
  add(item, targetKey, after);
  showSequence(state.sequence.spans.find((s) => s.id === state.items[state.selected].id).start);
  $('segments').querySelector('.selected')?.focus();
}
$('addTransition').onclick = () => addTransition(state.items[state.selected]?.id);
$('transitionSource').onkeydown = (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    if (!$('addTransition').disabled) $('addTransition').click();
  }
};
$('source').onchange = () => {
  resetRange();
  showSource();
};
$('sourceTime').onchange = () => {
  const t = $('sourceTime').valueAsNumber;
  if (!Number.isFinite(t)) {
    message('预览时间无效', true);
    return;
  }
  showSource(t);
};
$('sourceSeek').oninput = () => showSource($('sourceSeek').valueAsNumber);
$('markIn').onclick = () => {
  writeTime('trimIn', state.sourceTime);
  sourceCardUI();
};
$('markOut').onclick = () => {
  writeTime('trimOut', state.sourceTime);
  sourceCardUI();
};
$('quickSequence').onclick = () => {
  const clips = quickActions.map(([key, name]) => ({
    name,
    clip: state.clips.find((c) => c.name === key),
  }));
  if (clips.some((c) => !c.clip)) {
    message('当前模型没有挥剑示例所需动作', true);
    return;
  }
  history.run(() => {
    for (const [index, item] of clips.entries())
      add({ kind: 'action', ...item, transition: index ? 0.35 : 0 });
  });
  showSequence(state.sequence.spans.find((s) => s.id === state.items.at(-clips.length).id).start);
  state.playing = true;
  updateButtons();
  message('示例已加入时间轴');
};
$('bone').onchange = () => {
  if ($('posePanel').open) bodyControls.chooseBone(state.bones[Number($('bone').value)]);
  boneValues();
};
for (const id of ['rx', 'ry', 'rz'])
  $(id).onchange = () => {
    if (state.busy || state.poseDraft?.origin !== 'user') return;
    const values = ['rx', 'ry', 'rz'].map((i) => $(i).valueAsNumber);
    if (!values.every(Number.isFinite)) {
      message('关节角度无效', true);
      return;
    }
    try {
      const entry = workbench.rigList({ offset: Number($('bone').value), limit: 1 }).entries[0];
      workbench.setBones([
        {
          id: entry.id,
          quaternion: new THREE.Quaternion()
            .setFromEuler(new THREE.Euler(...values.map(THREE.MathUtils.degToRad), 'XYZ'))
            .toArray(),
        },
      ]);
    } catch (error) {
      message(error.message, true);
    }
  };
$('savePose').onclick = () =>
  savePoseEntry(`姿势 ${state.poses.length + 1}`, workbench.captureCurrent());
$('poses').onchange = () => {
  state.playing = false;
  state.mode = 'pose';
  applyPose(state.root, state.poses[Number($('poses').value)].pose);
  boneValues();
  updateButtons();
};
$('addAction').onkeydown = (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    const item = prepareInsert($('addAction'));
    if (item) insertAction(item);
  }
};
$('addPose').onclick = () => {
  const pose = state.poses[Number($('poses').value)];
  add({ kind: 'pose', name: pose.name, pose: structuredClone(pose.pose), duration: 1 });
};
function moveItem(key, targetKey, after, swap = false) {
  history.run(() => {
    try {
      if (!timelineController.move(key, targetKey, after, swap)) return;
      rebuild();
      showSequence(state.sequence.spans.find((span) => span.id === key).start);
    } catch (error) {
      message(error.message, true);
    }
  });
}
function removeSelected() {
  history.run(() => {
    if (!timelineController.remove()) return;
    rebuild();
    if (state.items.length) showSequence(state.time);
    else showSource(0);
    updateButtons();
  });
}
$('timelineRemove').onclick = removeSelected;
const timelineItem = timelineController.itemFor;
const disposeTimeline = bindTimelineEdit({
  container: $('segments'),
  scroll: $('timelineScroll'),
  track: $('timelineTrack'),
  library: $('clips'),
  sourceCard: $('addAction'),
  transitionSource: $('transitionSource'),
  prepareInsert,
  canInsert,
  insert: insertAction,
  select: selectSegment,
  selected: (key) => state.selection.has(key),
  begin: history.begin,
  end: history.end,
  scale: () => {},
  snapshot: (key) => {
    const { item } = timelineItem(key);
    return { ...item };
  },
  restore: (key, value) => {
    const { item } = timelineItem(key);
    for (const field of Object.keys(item)) delete item[field];
    Object.assign(item, value);
  },
  refresh: () => {
    rebuild();
    showSequence(state.time);
  },
  move: moveItem,
  remove: removeSelected,
  resize: (key, value, side, original, mode) => {
    if (timelineController.resize(key, value, side, original, mode)) {
      rebuild();
      showSequence(state.time);
    }
  },
  canEdit: () => editSession.canEditTimeline(),
});
$('timelineUndo').onclick = () => history.undo();
$('timelineRedo').onclick = () => history.redo();
$('timelineAll').onclick = () => {
  state.selection = new Set(state.items.map((i) => i.id));
  selectionUI();
  selectedControls();
};
$('timelineNone').onclick = () => {
  state.selection.clear();
  state.selected = -1;
  selectionUI();
  selectedControls();
};
$('viewPreset').onchange = () => frame();
$('side').onclick = () => frame(true);
$('skeleton').onchange = () => {
  if (state.helper) state.helper.visible = $('skeleton').checked;
};
$('green').onchange = () => {
  scene.background.set($('green').checked ? '#00ff00' : advancedTools ? '#13171c' : '#121416');
  grid.visible = !$('green').checked;
};
const stopObserving = viewportScene.observe({ getCamera: () => camera, onResize: layoutTimeline });
let previous = performance.now(),
  disposed = false,
  animationFrame;
function tick(now) {
  if (disposed) return;
  const wallDelta = (now - previous) / 1000;
  previous = now;
  previewController.advance(wallDelta, playerView.getSpeed());
  syncPreviewSeek();
  controls.update();
  bodyControls.update();
  renderer.render(scene, camera);
  animationFrame = requestAnimationFrame(tick);
}
animationFrame = requestAnimationFrame(tick);
updateButtons();
selectedControls();
restoreLastSaved();
const disposeDesktopControl = bindDesktopControl(workbench);
workbench.configure({
  ...createControlMedia({
    state,
    getCamera: () => camera,
    createCapture: createReferenceCapture,
    getBridge: () => globalThis.motionDeckDesktop,
    sampleOutput: (sequence, time) => workbench.sampleOutput(sequence, time),
  }),
  timeline: {
    history,
    refresh: rebuild,
    save: (actions) => persistLibraryEntries({ actions }),
    saved: (name, context) => {
      $('actionTitle').textContent = name;
      activeLibrary = context?.taskId ? 'ai' : 'custom';
      filterLibrary();
    },
  },
  exportGLB: async (name, rootMotion) => {
    const bridge = globalThis.motionDeckDesktop;
    if (!bridge) throw new Error('命令导出仅支持客户端');
    const result = await exportMotionAssets({
      root: state.root,
      base: state.sampler.base,
      entries: [{ kind: 'action', name, items: state.items }],
      modelName: state.model.name,
      rootMotion,
    });
    return bridge.saveControlExport(new Uint8Array(await result.blob.arrayBuffer()));
  },
  savePose: (poses) => persistLibraryEntries({ poses }),
  saveLibraryEntries: persistLibraryEntries,
  workspaceChanged: () => {
    options(
      $('poses'),
      state.poses.map((p) => p.name),
    );
    activeLibrary = 'ai';
    filterLibrary();
  },
  libraryRenamed: ({ kind, id, name }) => {
    const index = $('poses').value;
    options(
      $('poses'),
      state.poses.map((p) => p.name),
    );
    $('poses').value = index;
    if (kind === 'custom' && state.editingActionId === id) $('actionTitle').textContent = name;
    if (kind === 'custom' && state.mode === 'custom' && state.customPreview?.id === id)
      $('currentClip').textContent = name;
    filterLibrary();
  },
});
const unsubscribeRootMotion = workbench.subscribe(syncRootMotionTools);
syncRootMotionTools();
// 应用层驱动的数据变更刷新同一视图；未来桌面入口无需模拟DOM事件。
const unsubscribePresentation = workbench.subscribe(() => {
  if (disposed || state.closed || !state.root) return;
  editSession.reportDraft();
  $('source').value = state.sourceIndex;
  const clip = state.clips[state.sourceIndex];
  if (state.poseDraft)
    $('currentClip').textContent = state.poseDraft.name ?? '动作取帧 · ' + displayAction(clip.name);
  else if (state.mode === 'source') {
    $('currentClip').textContent = clip ? displayAction(clip.name) : '静态姿势';
    $('sourceTime').value = state.sourceTime.toFixed(2);
  } else if (state.mode === 'pose' && state.posePreviewName) {
    $('currentClip').textContent = state.posePreviewName;
    options(
      $('poses'),
      state.poses.map((p) => p.name),
    );
    filterLibrary();
  } else if (state.mode === 'sequence') {
    const span =
      state.sequence.spans.find((s) => state.time < s.start + s.duration) ??
      state.sequence.spans.at(-1);
    sequenceControls(span ? { span, local: Math.max(0, state.time - span.start) } : null);
  }
  boneValues();
  syncPreviewSeek();
  updateButtons();
});
const lifetime = createWorkbenchLifetime({
  stopViews: () => {
    modelMenu.dispose();
    modelRenameForm.dispose();
    libraryFiles.dispose();
    poseSaveForm.dispose();
    actionSaveForm.dispose();
    playerView.dispose();
    libraryInteractions.dispose();
    libraryView.dispose();
    disposeDesktopControl();
  },
  stopEditing: () => {
    editView.dispose();
    editSession.dispose();
    bodyControls.dispose();
    unsubscribeRootMotion();
    unsubscribePresentation();
  },
  closeWorkbench: () => workbench.close(),
  stopMedia: () => {
    mediaController.dispose();
    mediaView.dispose();
  },
  stopRendering: () => {
    disposed = true;
    cancelAnimationFrame(animationFrame);
    disposeTimeline();
    timelineView.dispose();
    stopObserving();
    controls.dispose();
  },
  releaseScene: () => {
    state.sampler?.dispose();
    if (state.root) disposeModel(state.root);
    renderer.dispose();
  },
});
window.addEventListener('pagehide', () => lifetime.dispose(), { once: true });
