import { createWorkbenchQueries } from './workbench-queries.js';
import { createWorkbenchPoseOperations } from './workbench-pose-operations.js';
import { createWorkbenchMediaOperations } from './workbench-media-operations.js';
import { createWorkbenchLibraryOperations } from './workbench-library-operations.js';
import { jointLimits, constraintSummary } from '../pose/joint-limits.js';
import { capturePose, applyPose, sampleSequence } from '../core/sequence-core.js';

import { createTimelineOperations } from './timeline-operations.js';

import { createRootMotionFilter, rootMotionOptions } from '../core/root-motion.js';

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

// 权威状态仍是传入的同一对象；此处只保存变更指纹，不复制可编辑模型。
export function createWorkbenchOperations(state) {
  let observed = null,
    modelRoot = null,
    nodeMap = new Map(),
    nextIdentity = 0,
    adapters = null;
  const identities = new WeakMap();
  const listeners = new Set();
  const identity = (value) => {
    if (!value || typeof value !== 'object') return null;
    if (!identities.has(value)) identities.set(value, ++nextIdentity);
    return identities.get(value);
  };
  const sourceId = (clip, index) => clip.libraryId ?? `source:${index}:${clip.name}`;
  function fingerprint() {
    return JSON.stringify({
      root: identity(state.root),
      workspace: identity(state.aiWorkspace),
      modelKey: state.modelKey,
      model: state.model,
      mode: state.mode,
      sourceIndex: state.sourceIndex,
      rootMotion: state.rootMotion,
      clips: state.clips.map((c, i) => [sourceId(c, i), identity(c)]),
      poses: state.poses.map((p) => [p.id, p.name, identity(p.pose)]),
      customs: state.customs.map((a) => [a.id, a.name, identity(a)]),
      items: state.items.map((i) => [
        i.id,
        i.kind,
        i.name,
        i.in,
        i.out,
        i.duration,
        i.transition,
        i.interpolation,
      ]),
      selection: [...state.selection],
      selected: state.selected,
      transition: state.selectedTransition,
      editingActionId: state.editingActionId,
    });
  }
  function sync() {
    const next = fingerprint();
    if (modelRoot !== state.root) {
      modelRoot = state.root;
      nodeMap = new Map();
      let index = 0;
      state.root?.traverse((node) => nodeMap.set(node, index++));
      state.poseDraft = null;
      state.jointConstraintMode =
        state.root && jointLimits(state.root).supported ? 'natural' : 'free';
      state.jointConstraintFeedback = [];
    }
    if (observed !== null && observed !== next) state.revision++;
    observed = next;
    return state.revision;
  }
  function publish() {
    for (const listener of listeners) listener();
  }
  function changed() {
    state.revision++;
    observed = fingerprint();
    publish();
  }
  function ready(expected) {
    sync();
    assertReady(expected);
  }
  function assertReady(expected) {
    if (state.closed) throw failure('SESSION_CLOSED', '会话已关闭');
    if (state.busy) throw failure('BUSY', '当前工作台正在执行其他操作');
    if (!state.root || !state.sampler || !state.modelKey)
      throw failure('NOT_READY', '模型尚未就绪');
    if (expected?.modelKey !== undefined && expected.modelKey !== state.modelKey)
      throw failure('MODEL_MISMATCH', '模型已变化');
    if (expected?.revision !== undefined && expected.revision !== state.revision)
      throw failure('REVISION_CONFLICT', '编辑状态已变化');
  }
  // 采样也会临时修改模型；失败必须连同可见姿势和预览上下文一起恢复。
  function atomic(run, { transient = false, expected } = {}) {
    // 纯播放帧只推进预览，不确认素材变更；查询/编辑边界仍完整观察。
    // 不更新observed，避免把界面原地修改吞成新的基线；切根和显式版本校验不能走快路。
    if (transient && expected === undefined && modelRoot === state.root) assertReady();
    else ready(expected);
    if (state.poseDraft) throw failure('BUSY', '请先结束姿势草稿');
    const pose = capturePose(state.root),
      before = {
        mode: state.mode,
        time: state.time,
        sourceTime: state.sourceTime,
        sourceIndex: state.sourceIndex,
        customTime: state.customTime,
        customPreview: state.customPreview,
        playing: state.playing,
      };
    let result;
    try {
      result = run();
    } catch (error) {
      Object.assign(state, before);
      applyPose(state.root, pose);
      throw error;
    }
    if (!transient) changed();
    return result;
  }
  function source(index, time = 0, playing = false, options) {
    if (!Number.isInteger(index) || index < 0 || !Number.isFinite(time))
      throw failure('INVALID_ARGUMENT', '动作索引或时间无效');
    return atomic(() => {
      const clip = state.clips[index];
      if (!clip && state.clips.length) throw failure('INVALID_ARGUMENT', '动作不存在');
      const t = clip ? Math.max(0, Math.min(time, clip.duration)) : 0;
      if (clip)
        applyPose(state.root, options?.raw ? state.sampler.sample(clip, t) : sampleSource(clip, t));
      state.sourceIndex = index;
      state.sourceTime = t;
      state.mode = 'source';
      state.playing = playing;
      return { clip, time: t };
    }, options);
  }
  function sequence(time, { transient = false } = {}) {
    if (!Number.isFinite(time)) throw failure('INVALID_ARGUMENT', '编排时间无效');
    return atomic(
      () => {
        const t = Math.max(0, Math.min(time, state.sequence?.duration ?? 0)),
          result = state.sequence && sampleOutput(state.sequence, t);
        if (result) applyPose(state.root, result.pose);
        state.time = t;
        state.mode = 'sequence';
        return result;
      },
      { transient },
    );
  }
  function pose(entry) {
    return atomic(() => {
      applyPose(state.root, entry.pose);
      state.posePreviewId = entry.id;
      state.posePreviewName = entry.name;
      state.mode = 'pose';
      state.playing = false;
      return entry;
    });
  }
  function custom(preview, time = 0, { transient = false } = {}) {
    if (!preview?.sequence || !Number.isFinite(time))
      throw failure('INVALID_ARGUMENT', '自定义预览无效');
    return atomic(
      () => {
        const t = Math.max(0, Math.min(time, preview.sequence.duration)),
          result = sampleOutput(preview.sequence, t);
        if (result) applyPose(state.root, result.pose);
        state.customPreview = preview;
        state.customTime = t;
        state.mode = 'custom';
        return result;
      },
      { transient },
    );
  }
  function sampleSource(clip, time, policy = state.rootMotion) {
    const options = rootMotionOptions(policy);
    if (options.horizontal && options.vertical) return state.sampler.sample(clip, time);
    const filter = createRootMotionFilter(state.root, state.sampler.sample(clip, 0), options);
    return filter(state.sampler.sample(clip, time));
  }
  function sampleOutput(sequence, time, policy = state.rootMotion) {
    const options = rootMotionOptions(policy);
    if (options.horizontal && options.vertical)
      return sampleSequence(sequence, time, state.sampler);
    const filter = createRootMotionFilter(
        state.root,
        sampleSequence(sequence, 0, state.sampler).pose,
        options,
      ),
      result = sampleSequence(sequence, time, state.sampler);
    return { ...result, pose: filter(result.pose) };
  }
  function currentRawPose() {
    if (state.poseDraft || state.mode === 'pose') return capturePose(state.root);
    if (state.mode === 'source') {
      const clip = state.clips[state.sourceIndex];
      return clip ? state.sampler.sample(clip, state.sourceTime) : capturePose(state.root);
    }
    const seq = state.mode === 'custom' ? state.customPreview?.sequence : state.sequence;
    return seq?.spans.length
      ? sampleSequence(seq, state.mode === 'custom' ? state.customTime : state.time, state.sampler)
          .pose
      : capturePose(state.root);
  }
  function setRootMotion(value, expected) {
    ready(expected);
    if (state.poseDraft) throw failure('BUSY', '请先结束姿势草稿');
    if (adapters?.timeline?.history.active) throw failure('BUSY', '界面编排操作尚未结束');
    const policy = rootMotionOptions(value),
      visible = capturePose(state.root);
    try {
      let pose;
      if (state.mode === 'source' && state.clips[state.sourceIndex])
        pose = sampleSource(state.clips[state.sourceIndex], state.sourceTime, policy);
      else {
        const seq = state.mode === 'custom' ? state.customPreview?.sequence : state.sequence;
        if (state.mode !== 'pose' && seq?.spans.length)
          pose = sampleOutput(
            seq,
            state.mode === 'custom' ? state.customTime : state.time,
            policy,
          ).pose;
        else {
          createRootMotionFilter(state.root, visible, policy);
          pose = visible;
        }
      }
      applyPose(state.root, pose);
    } catch (error) {
      applyPose(state.root, visible);
      throw error;
    }
    state.rootMotion = policy;
    changed();
    return { rootMotion: { ...policy }, revision: state.revision };
  }

  function sequenceReady(expected) {
    ready(expected);
    if (state.poseDraft) throw failure('BUSY', '请先结束姿势草稿');
    if (!state.sequence?.duration || !state.items.length)
      throw failure('INVALID_ARGUMENT', '当前没有有效编排');
    if (adapters?.timeline?.history.active) throw failure('BUSY', '界面编排操作尚未结束');
  }

  function captureCurrent() {
    ready();
    state.playing = false;
    const visible = capturePose(state.root);
    try {
      return structuredClone(currentRawPose());
    } finally {
      applyPose(state.root, visible);
    }
  }

  function canAdvance() {
    return !state.closed && !state.busy && !state.poseDraft && state.playing;
  }

  const getNodeMap = () => nodeMap,
    getAdapters = () => adapters,
    resetObservation = () => {
      observed = fingerprint();
    };
  const {
    userMoveRoot,
    rootTransform,
    fromClip,
    discardDraft,
    fromLibrary,
    fromSequence,
    setRootTransform,
    beginUserDraft,
    beginUserPoseGesture,
    finishUserPoseGesture,
    setConstraintMode,
    constrainUserGesture,
    setBones,
    draftHistory,
    saveDraft,
    beginUserRotation,
    finishUserRotation,
  } = createWorkbenchPoseOperations({
    state,
    ready,
    changed,
    publish,
    getNodeMap,
    getAdapters,
    resetObservation,
    sourceId,
    source,
    pose,
    atomic,
    sequenceReady,
    failure,
  });
  const { inspect, modelInspect, rigList, libraryList } = createWorkbenchQueries({
    state,
    sync,
    ready,
    getNodeMap,
    rootTransform,
    sourceId,
    failure,
  });
  const { sampleSequenceRange, captureViews, reviewMedia, exportGLB } =
    createWorkbenchMediaOperations({
      state,
      ready,
      sequenceReady,
      publish,
      getNodeMap,
      getAdapters,
      sampleOutput,
      failure,
    });
  const { renameLibraryEntry, aiWorkspace, libraryClipboard } = createWorkbenchLibraryOperations({
    state,
    ready,
    changed,
    publish,
    getAdapters,
    sourceId,
    failure,
  });
  const timeline = createTimelineOperations({
    state,
    ready,
    changed,
    publish,
    resetObservation,
    getAdapters,
    sourceId,
  });

  function preview({ time, playing }, expected) {
    ready(expected);
    if (
      !state.items.length ||
      !Number.isFinite(time) ||
      time < 0 ||
      time > (state.sequence?.duration ?? 0) ||
      typeof playing !== 'boolean'
    )
      throw failure('INVALID_ARGUMENT', '编排播放时间或状态无效');
    sequence(time);
    state.playing = playing;
    publish();
    return { time: state.time, playing, revision: state.revision };
  }
  function close() {
    state.playing = false;
    state.closed = true;
    state.poseDraft = null;
    changed();
  }
  sync();
  return Object.freeze({
    sync,
    changed,
    inspect,
    modelInspect,
    rigList,
    libraryList,
    libraryClipboard,
    aiWorkspace,
    renameLibraryEntry,
    source,
    sequence,
    pose,
    custom,
    sampleOutput,
    sampleSource,
    setRootMotion,
    fromClip,
    fromLibrary,
    fromSequence,
    sampleSequenceRange,
    captureSequence: (args, expected) => reviewMedia(args, expected),
    exportVideo: (args, expected) => reviewMedia(args, expected, true),
    setRootTransform,
    userMoveRoot,
    timeline,
    preview,
    exportGLB,
    discardDraft,
    captureCurrent,
    beginUserDraft,
    beginUserPoseGesture,
    finishUserPoseGesture,
    beginUserRotation,
    finishUserRotation,
    setBones,
    setConstraintMode,
    constrainUserGesture,
    jointConstraintSummary: () => constraintSummary(state.root, state.jointConstraintMode),
    draftHistory,
    saveDraft,
    captureViews,
    configure(value) {
      if (adapters) throw new Error('工作台适配只允许绑定一次');
      adapters = value;
    },
    canAdvance,
    close,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}
