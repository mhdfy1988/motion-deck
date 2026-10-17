import { capturePose, applyPose } from '../core/sequence-core.js';
import { Quaternion, Vector3 } from 'three';
import { reviewTimes, captureOptions } from '../core/review-plan.js';
import { rootMotionOptions } from '../core/root-motion.js';

// 命令媒体复用原采样/预算与平台适配，临时状态仍写回同一会话并恢复。
export function createWorkbenchMediaOperations({
  state,
  ready,
  sequenceReady,
  publish,
  getNodeMap,
  getAdapters,
  sampleOutput,
  failure,
}) {
  function sampleSequenceRange(args, expected) {
    sequenceReady(expected);
    const times = reviewTimes(args, state.sequence.duration),
      ids = args.boneIds;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 64 ||
      new Set(ids).size !== ids.length ||
      times.length * ids.length > 2048
    )
      throw failure('INVALID_ARGUMENT', '骨骼或采样总量超限');
    const bones = ids.map((id) => state.bones.find((b) => `node:${getNodeMap().get(b)}` === id));
    if (bones.some((b) => !b)) throw failure('INVALID_ARGUMENT', '骨骼不存在');
    const visible = capturePose(state.root),
      playing = state.playing;
    state.playing = false;
    try {
      return {
        modelKey: state.modelKey,
        revision: state.revision,
        space: 'world',
        units: 'model',
        samples: times.map((time) => {
          applyPose(state.root, sampleOutput(state.sequence, time).pose);
          return {
            time,
            bones: bones.map((b, i) => ({
              id: ids[i],
              position: b.getWorldPosition(new Vector3()).toArray(),
              quaternion: b.getWorldQuaternion(new Quaternion()).toArray(),
            })),
          };
        }),
      };
    } finally {
      applyPose(state.root, visible);
      state.playing = playing;
    }
  }
  async function captureViews(views, expected, options = {}) {
    ready(expected);
    if (!getAdapters()?.captureViews) throw failure('NOT_READY', '截图适配未就绪');
    const framing = captureOptions(options);
    state.busy = true;
    const playing = state.playing;
    state.playing = false;
    publish();
    try {
      return { files: await getAdapters().captureViews(views, framing), revision: state.revision };
    } finally {
      state.busy = false;
      state.playing = playing;
      publish();
    }
  }
  async function reviewMedia(args, expected, video = false) {
    sequenceReady(expected);
    const options = captureOptions(args.options),
      duration = state.sequence.duration;
    const times = video ? null : reviewTimes(args, duration, 24);
    const views = video ? [args.view ?? 'front-right'] : args.views;
    if (
      !Array.isArray(views) ||
      !views.length ||
      views.length > 3 ||
      new Set(views).size !== views.length ||
      views.some(
        (v) => !['front', 'right', 'front-right', 'back', 'left', 'front-left'].includes(v),
      )
    )
      throw failure('INVALID_ARGUMENT', '截图视角无效');
    if (times && times.length * views.length > 24)
      throw failure('INVALID_ARGUMENT', '一次最多24张截图');
    if (
      video &&
      (!Number.isFinite(args.start) ||
        !Number.isFinite(args.end) ||
        args.start < 0 ||
        args.end > duration ||
        args.end <= args.start ||
        args.end - args.start > 30 ||
        args.confirmed !== true ||
        typeof args.name !== 'string' ||
        !args.name.trim() ||
        args.name !== args.name.trim() ||
        args.name.length > 80)
    )
      throw failure('INVALID_ARGUMENT', '视频需有效名称、确认及不超过30秒的编排范围');
    const adapter = video ? getAdapters()?.exportVideo : getAdapters()?.captureSequence;
    if (!adapter) throw failure('NOT_READY', '媒体适配未就绪');
    const visible = capturePose(state.root),
      playing = state.playing,
      revision = state.revision;
    state.busy = true;
    state.playing = false;
    publish();
    const plan = {
      ...args,
      options,
      views,
      times,
      modelKey: state.modelKey,
      revision,
      duration,
      sample: (time) => {
        const pose = sampleOutput(state.sequence, time).pose;
        applyPose(state.root, pose);
        return pose;
      },
    };
    try {
      const result = await adapter(plan);
      return { ...result, revision };
    } finally {
      applyPose(state.root, visible);
      state.playing = playing;
      state.busy = false;
      publish();
    }
  }
  async function exportGLB({ name, confirmed, rootMotion = state.rootMotion }, expected) {
    ready(expected);
    if (state.poseDraft) throw failure('BUSY', '请先结束姿势草稿');
    if (
      !state.items.length ||
      confirmed !== true ||
      typeof name !== 'string' ||
      !name.trim() ||
      name !== name.trim() ||
      name.length > 80
    )
      throw failure('INVALID_ARGUMENT', '导出需编排、名称与明确确认');
    if (!getAdapters()?.exportGLB) throw failure('NOT_READY', '导出适配未就绪');
    const policy = rootMotionOptions(rootMotion),
      playing = state.playing;
    state.busy = true;
    state.playing = false;
    publish();
    try {
      return {
        file: await getAdapters().exportGLB(name, policy),
        rootMotion: policy,
        revision: state.revision,
      };
    } finally {
      state.busy = false;
      state.playing = playing;
      publish();
    }
  }
  return { sampleSequenceRange, captureViews, reviewMedia, exportGLB };
}
