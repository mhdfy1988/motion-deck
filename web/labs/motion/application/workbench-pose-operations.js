import { capturePose, applyPose, sampleSequence } from '../core/sequence-core.js';
import { createPoseDraft, setDraftBones, setDraftRoot, travelDraftHistory } from './pose-draft.js';
import { Quaternion, Vector3 } from 'three';
import { assetOwner, prepareWorkspaceEntry, protectWorkspaceEntry } from '../core/ai-workspace.js';
import { findBodyChain } from '../pose/body-chain-controls.js';
import {
  jointLimits,
  constrainBone,
  enforceBones,
  constraintSummary,
} from '../pose/joint-limits.js';

// 只协调原草稿、骨架和手势事务；不创建另一份历史、版本或素材状态。
export function createWorkbenchPoseOperations({
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
}) {
  let userRotation = null;
  function rootCarrier() {
    const roots = state.bones.filter((b) => !b.parent?.isBone);
    if (roots.length !== 1) throw failure('UNSUPPORTED_RIG', '整体变换要求唯一骨架根');
    return roots[0];
  }
  function movableRoot() {
    const carrier = rootCarrier();
    state.root.updateMatrixWorld(true);
    const scale = carrier.parent?.getWorldScale(new Vector3()) ?? new Vector3(1, 1, 1);
    if (
      Math.min(...scale.toArray()) <= 0 ||
      Math.max(...scale.toArray()) - Math.min(...scale.toArray()) > 1e-5
    )
      throw failure('UNSUPPORTED_RIG', '整体变换不支持非均匀或反向父级缩放');
    return carrier;
  }
  function userMoveRoot() {
    ready();
    if (state.poseDraft?.origin !== 'user') throw failure('NO_DRAFT', '请先进入手动姿势编辑');
    return movableRoot();
  }
  function rootTransform() {
    const carrier = rootCarrier();
    state.root.updateMatrixWorld(true);
    return {
      id: `node:${getNodeMap().get(carrier)}`,
      position: carrier.getWorldPosition(new Vector3()).toArray(),
      quaternion: carrier.getWorldQuaternion(new Quaternion()).toArray(),
      space: 'world',
      units: 'model',
    };
  }
  function fromClip({ clipId, time, modelKey, revision }) {
    if (typeof modelKey !== 'string' || !Number.isInteger(revision) || revision < 0)
      throw failure('INVALID_ARGUMENT', '取帧必须提供模型身份和编辑版本');
    ready({ modelKey, revision });
    const index = state.clips.findIndex((c, i) => sourceId(c, i) === clipId);
    if (index < 0 || !Number.isFinite(time) || time < 0 || time > state.clips[index].duration)
      throw failure('INVALID_ARGUMENT', '取帧动作或时间无效');
    const before = {
      pose: capturePose(state.root),
      mode: state.mode,
      time: state.time,
      sourceTime: state.sourceTime,
      sourceIndex: state.sourceIndex,
      customTime: state.customTime,
      customPreview: state.customPreview,
      playing: state.playing,
    };
    source(index, time, false, { expected: { modelKey, revision }, raw: true });
    state.poseDraft = createPoseDraft(state.root, state.modelKey, before);
    state.mode = 'pose';
    resetObservation();
    publish();
    return { modelKey: state.modelKey, revision: state.revision, clipId, time };
  }
  function discardDraft(expected) {
    ready(expected);
    const draft = state.poseDraft;
    if (!draft) return false;
    applyPose(state.root, draft.before.pose);
    const { pose: beforePose, ...context } = draft.before;
    Object.assign(state, context);
    state.playing = false;
    state.poseDraft = null;
    changed();
    return true;
  }
  function fromLibrary({ poseId, ...expected }) {
    ready(expected);
    const entry = state.poses.find(
      (p) => p.id === poseId && assetOwner(state.aiWorkspace, p.id)?.entry.state !== 'trash',
    );
    if (!entry) throw failure('INVALID_ARGUMENT', '姿势不存在或在回收区');
    const before = {
      pose: capturePose(state.root),
      posePreviewId: state.posePreviewId,
      posePreviewName: state.posePreviewName,
      mode: state.mode,
      time: state.time,
      sourceTime: state.sourceTime,
      sourceIndex: state.sourceIndex,
      customTime: state.customTime,
      customPreview: state.customPreview,
      playing: state.playing,
    };
    pose(entry);
    state.poseDraft = createPoseDraft(state.root, state.modelKey, before);
    state.poseDraft.name = entry.name;
    state.posePreviewName = entry.name;
    resetObservation();
    publish();
    return { poseId, revision: state.revision };
  }
  function fromSequence({ time, ...expected }) {
    sequenceReady(expected);
    if (!Number.isFinite(time) || time < 0 || time > state.sequence.duration)
      throw failure('INVALID_ARGUMENT', '取帧时间超出编排');
    const before = {
      pose: capturePose(state.root),
      mode: state.mode,
      time: state.time,
      sourceTime: state.sourceTime,
      sourceIndex: state.sourceIndex,
      customTime: state.customTime,
      customPreview: state.customPreview,
      playing: state.playing,
    };
    atomic(
      () => {
        const result = sampleSequence(state.sequence, time, state.sampler);
        applyPose(state.root, result.pose);
        state.time = time;
        state.playing = false;
        state.mode = 'pose';
      },
      { expected },
    );
    state.poseDraft = createPoseDraft(state.root, state.modelKey, before);
    state.poseDraft.name = `编排取帧 ${time.toFixed(3)}s`;
    state.posePreviewName = state.poseDraft.name;
    publish();
    return { time, revision: state.revision };
  }
  function setRootTransform({ position, quaternion }, expected, translationOnly = false) {
    const draft = draftReady(expected),
      carrier = movableRoot();
    if (
      !Array.isArray(position) ||
      position.length !== 3 ||
      !position.every((v) => Number.isFinite(v) && Math.abs(v) <= 100) ||
      !Array.isArray(quaternion) ||
      quaternion.length !== 4 ||
      !quaternion.every(Number.isFinite) ||
      Math.abs(Math.hypot(...quaternion) - 1) > 1e-5
    )
      throw failure('INVALID_ARGUMENT', '整体位置/四元数无效');
    state.root.updateMatrixWorld(true);
    const parent = carrier.parent,
      parentScale = parent?.getWorldScale(new Vector3()) ?? new Vector3(1, 1, 1);
    if (
      Math.min(...parentScale.toArray()) <= 0 ||
      Math.max(...parentScale.toArray()) - Math.min(...parentScale.toArray()) > 1e-5
    )
      throw failure('UNSUPPORTED_RIG', '整体变换不支持非均匀或反向父级缩放');
    const p = new Vector3(...position),
      q = new Quaternion(...quaternion);
    if (parent) {
      parent.worldToLocal(p);
      q.premultiply(parent.getWorldQuaternion(new Quaternion()).invert());
    }
    setDraftRoot(
      state.root,
      getNodeMap(),
      draft,
      carrier,
      p.toArray(),
      translationOnly ? carrier.quaternion.toArray() : q.normalize().toArray(),
    );
    state.playing = false;
    changed();
    return { rootTransform: rootTransform(), revision: state.revision };
  }
  function beginUserDraft() {
    ready();
    if (state.poseDraft) throw failure('BUSY', '请先保存或放弃当前姿势草稿');
    const before = {
      pose: capturePose(state.root),
      posePreviewId: state.posePreviewId,
      posePreviewName: state.posePreviewName,
      mode: state.mode,
      time: state.time,
      sourceTime: state.sourceTime,
      sourceIndex: state.sourceIndex,
      customTime: state.customTime,
      customPreview: state.customPreview,
      playing: state.playing,
    };
    const source =
      state.mode === 'pose'
        ? state.poses.find(
            (p) =>
              p.id === state.posePreviewId &&
              !p.id.startsWith('builtin:') &&
              assetOwner(state.aiWorkspace, p.id)?.entry.state !== 'trash',
          )
        : null;
    state.playing = false;
    state.poseDraft = createPoseDraft(state.root, state.modelKey, before);
    state.poseDraft.origin = 'user';
    state.poseDraft.sourcePoseId = source?.id;
    state.poseDraft.name = source?.name ?? '手动编辑姿势';
    state.mode = 'pose';
    state.jointConstraintViolations = constraintSummary(
      state.root,
      state.jointConstraintMode,
    ).violations.length;
    state.jointConstraintFeedback = [];
    changed();
  }
  function beginUserPoseGesture(
    bones,
    { positionBones = [], rootTranslation = false, rootAdjustment = false } = {},
  ) {
    ready();
    if (
      state.poseDraft?.origin !== 'user' ||
      !Array.isArray(bones) ||
      !bones.length ||
      bones.length > 7 ||
      new Set(bones).size !== bones.length ||
      bones.some((b) => !state.bones.includes(b))
    )
      throw failure('INVALID_ARGUMENT', '请先进入手动姿势编辑并选择有效骨链');
    if (rootTranslation || rootAdjustment) {
      const carrier = movableRoot();
      if (
        (rootTranslation && rootAdjustment) ||
        bones.length !== 1 ||
        bones[0] !== carrier ||
        !Array.isArray(positionBones) ||
        positionBones.length
      )
        throw failure('INVALID_ARGUMENT', '整体调整只能操作唯一骨架根');
      userRotation = {
        bones,
        positionBones: [carrier],
        rootTranslation,
        rootAdjustment,
        pose: capturePose(state.root),
      };
      state.busy = true;
      publish();
      return;
    }
    if (!Array.isArray(positionBones)) throw failure('INVALID_ARGUMENT', '骨盆平移范围无效');
    const body = positionBones.length || bones.length > 3 ? findBodyChain(state.root) : null;
    const pelvisBones =
      body?.legs.length === 2
        ? [body.pelvis, ...body.legs.flatMap((c) => [c.upper, c.middle, c.end])]
        : [];
    if (
      !Array.isArray(positionBones) ||
      positionBones.length > 1 ||
      positionBones.some((b) => b !== body?.pelvis || !bones.includes(b)) ||
      (positionBones.length && bones.some((b) => !pelvisBones.includes(b))) ||
      (!positionBones.length && bones.length > 3 && bones.some((b) => !body?.links.includes(b)))
    )
      throw failure('INVALID_ARGUMENT', '仅映射骨盆允许平移，躯干联动必须属于同一骨链');
    userRotation = { bones, positionBones, pose: capturePose(state.root) };
    state.jointConstraintFeedback = [];
    state.jointConstraintResidual = 0;
    state.busy = true;
    publish();
  }
  function finishUserPoseGesture(cancel = false) {
    if (!userRotation) return;
    const transaction = userRotation;
    userRotation = null;
    const candidate = capturePose(state.root),
      allowed = new Set(transaction.bones.map((b) => getNodeMap().get(b))),
      positions = new Set(transaction.positionBones.map((b) => getNodeMap().get(b))),
      rootWorld =
        transaction.rootTranslation || transaction.rootAdjustment
          ? {
              position: transaction.bones[0].getWorldPosition(new Vector3()).toArray(),
              quaternion: transaction.bones[0]
                .getWorldQuaternion(new Quaternion())
                .normalize()
                .toArray(),
            }
          : null;
    applyPose(state.root, transaction.pose);
    state.busy = false;
    try {
      if (cancel) return;
      const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      if (
        candidate.length !== transaction.pose.length ||
        candidate.some(
          (p, i) =>
            (!positions.has(i) && !equal(p.p, transaction.pose[i].p)) ||
            !equal(p.s, transaction.pose[i].s) ||
            !equal(p.m, transaction.pose[i].m) ||
            (!allowed.has(i) && !equal(p.q, transaction.pose[i].q)),
        )
      )
        throw failure('INVALID_ARGUMENT', '只允许指定骨链旋转或骨盆平移，不允许改变缩放或其他节点');
      if (transaction.rootTranslation) {
        if (candidate.some((p, i) => !equal(p.q, transaction.pose[i].q)))
          throw failure('INVALID_ARGUMENT', '整体移动不能改变关节旋转');
        if (
          !equal(
            candidate[getNodeMap().get(transaction.bones[0])].p,
            transaction.pose[getNodeMap().get(transaction.bones[0])].p,
          )
        )
          setRootTransform(rootWorld, undefined, true);
        return;
      }
      if (transaction.rootAdjustment) {
        const i = getNodeMap().get(transaction.bones[0]);
        if (
          !equal(candidate[i].p, transaction.pose[i].p) ||
          !equal(candidate[i].q, transaction.pose[i].q)
        )
          setRootTransform(rootWorld);
        return;
      }
      const changes = transaction.bones.flatMap((bone) => {
        const i = getNodeMap().get(bone);
        return equal(candidate[i].q, transaction.pose[i].q) &&
          equal(candidate[i].p, transaction.pose[i].p)
          ? []
          : [
              {
                id: `node:${i}`,
                quaternion: candidate[i].q,
                ...(positions.has(i) ? { position: candidate[i].p } : {}),
              },
            ];
      });
      if (changes.length) setBones(changes, undefined, { preserveUnchangedRotations: true });
    } finally {
      state.jointConstraintViolations = constraintSummary(
        state.root,
        state.jointConstraintMode,
      ).violations.length;
      if (cancel) state.jointConstraintFeedback = [];
      publish();
    }
  }
  function draftReady(expected) {
    ready(expected);
    if (!state.poseDraft) throw failure('NO_DRAFT', '请先从动作取帧');
    return state.poseDraft;
  }
  function setConstraintMode(mode) {
    ready();
    if (!['natural', 'free'].includes(mode)) throw failure('INVALID_ARGUMENT', '约束模式无效');
    if (mode === 'natural' && !jointLimits(state.root).supported)
      throw failure('UNSUPPORTED_RIG', jointLimits(state.root).reason);
    state.jointConstraintMode = mode;
    state.jointConstraintFeedback = [];
    const summary = constraintSummary(state.root, mode);
    state.jointConstraintViolations = summary.violations.length;
    changed();
    return summary;
  }
  function constrainUserGesture(solver = null) {
    if (!userRotation || userRotation.rootTranslation || userRotation.rootAdjustment) return [];
    const rotated = userRotation.bones.filter(
      (b) =>
        JSON.stringify(b.quaternion.toArray()) !==
        JSON.stringify(userRotation.pose[getNodeMap().get(b)].q),
    );
    const result = enforceBones(state.root, rotated, state.jointConstraintMode);
    state.jointConstraintFeedback = [...(solver?.feedback ?? []), ...result];
    state.jointConstraintResidual = solver?.residual ?? 0;
    state.jointConstraintViolations = constraintSummary(
      state.root,
      state.jointConstraintMode,
    ).violations.length;
    return result;
  }
  function setBones(changes, expected, options = {}) {
    const draft = draftReady(expected),
      mode = options.constraintMode ?? state.jointConstraintMode;
    if (!['natural', 'free'].includes(mode)) throw failure('INVALID_ARGUMENT', '约束模式无效');
    const result = setDraftBones(
      state.root,
      state.bones,
      getNodeMap(),
      draft,
      changes,
      (candidate, requested) => {
        const applied = requested.map((change) => {
          const index = Number(change.id.slice(5)),
            bone = state.bones.find((b) => getNodeMap().get(b) === index),
            rig = jointLimits(state.root);
          if (
            mode === 'natural' &&
            change.position &&
            JSON.stringify(candidate[index].p) !== JSON.stringify(draft.pose[index].p) &&
            rig.joints.get(bone)?.type !== 'pelvis' &&
            !rig.roots.includes(bone)
          )
            throw failure('INVALID_ARGUMENT', '自然约束不允许改变骨长，位置仅用于整体根或骨盆');
          const value =
            options.preserveUnchangedRotations &&
            JSON.stringify(candidate[index].q) === JSON.stringify(draft.pose[index].q)
              ? {
                  quaternion: new Quaternion(...candidate[index].q),
                  clamped: false,
                  status: 'preserved',
                }
              : constrainBone(state.root, bone, new Quaternion(...candidate[index].q), mode);
          candidate[index].q = value.quaternion.toArray();
          return {
            id: change.id,
            status: value.status,
            clamped: value.clamped,
            quaternion: candidate[index].q,
            ...(value.angles ? { angles: value.angles } : {}),
          };
        });
        return { mode, profile: jointLimits(state.root).profile, applied };
      },
    );
    state.jointConstraintFeedback = result.constraints.applied.filter((r) => r.clamped);
    state.jointConstraintViolations = constraintSummary(
      state.root,
      state.jointConstraintMode,
    ).violations.length;
    state.playing = false;
    changed();
    return { ...result, revision: state.revision };
  }
  function draftHistory(direction, expected) {
    const draft = draftReady(expected);
    travelDraftHistory(state.root, draft, direction);
    state.jointConstraintFeedback = [];
    state.jointConstraintViolations = constraintSummary(
      state.root,
      state.jointConstraintMode,
    ).violations.length;
    changed();
    return { revision: state.revision };
  }
  async function saveDraft(
    {
      name,
      confirmed,
      assistant = false,
      taskId,
      role = 'temporary',
      stage = '',
      iteration = 1,
      overwritePoseId,
    },
    expected,
  ) {
    const draft = draftReady(expected);
    if (
      confirmed !== true ||
      typeof name !== 'string' ||
      !name.trim() ||
      name !== name.trim() ||
      name.length > 80
    )
      throw failure('INVALID_ARGUMENT', '保存需明确确认和1到80字符名称');
    const overwrite =
      overwritePoseId !== undefined ? state.poses.find((p) => p.id === overwritePoseId) : null;
    if (
      overwritePoseId !== undefined &&
      (!overwrite ||
        overwrite.id.startsWith('builtin:') ||
        draft.origin !== 'user' ||
        assistant ||
        draft.sourcePoseId !== overwrite.id ||
        overwrite.name !== name ||
        assetOwner(state.aiWorkspace, overwrite.id)?.entry.state === 'trash')
    )
      throw failure('INVALID_ARGUMENT', '只能确认覆盖当前手动编辑的来源姿势');
    if (
      state.poses.some(
        (p) => p.id !== overwrite?.id && !p.id.startsWith('builtin:') && p.name === name,
      )
    )
      throw failure('DUPLICATE_NAME', '同名自定义姿势已存在，不覆盖');
    if (!overwrite && state.poses.length >= 500)
      throw failure('LIMIT_EXCEEDED', '姿势总数已达500份上限，包含AI及回收素材');
    if (!getAdapters()?.savePose) throw failure('NOT_READY', '姿势保存适配未就绪');
    let entry = {
        ...(overwrite ?? {}),
        id: overwrite?.id ?? crypto.randomUUID(),
        name,
        pose: structuredClone(draft.pose),
      },
      plan;
    if (overwrite && assetOwner(state.aiWorkspace, overwrite.id)) {
      if (!getAdapters().saveLibraryEntries) throw failure('NOT_READY', 'AI工作区保存适配未就绪');
      plan = {
        workspace: protectWorkspaceEntry(state.aiWorkspace, overwrite.id),
        taskId: assetOwner(state.aiWorkspace, overwrite.id).task.id,
      };
    }
    if (assistant) {
      if (!getAdapters()?.saveLibraryEntries) throw failure('NOT_READY', 'AI工作区保存适配未就绪');
      plan = prepareWorkspaceEntry(state, { entry, kind: 'pose', taskId, role, stage, iteration });
      entry = plan.entry;
      name = entry.name;
    }
    const poses = overwrite
      ? state.poses.map((p) => (p.id === overwrite.id ? entry : p))
      : [...state.poses, entry];
    state.busy = true;
    state.playing = false;
    publish();
    try {
      if (plan)
        await getAdapters().saveLibraryEntries({
          actions: state.customs,
          poses,
          aiWorkspace: plan.workspace,
        });
      else await getAdapters().savePose(poses);
      state.poses = poses;
      if (plan) state.aiWorkspace = plan.workspace;
      state.poseDraft = null;
      state.mode = 'pose';
      state.posePreviewId = entry.id;
      state.posePreviewName = name;
      changed();
      if (plan) getAdapters().workspaceChanged?.();
      return {
        id: entry.id,
        name,
        ...(plan ? { taskId: plan.taskId } : {}),
        revision: state.revision,
      };
    } finally {
      state.busy = false;
      publish();
    }
  }
  const beginUserRotation = (bone) => beginUserPoseGesture([bone]);
  const finishUserRotation = (cancel) => finishUserPoseGesture(cancel);
  return {
    rootTransform,
    userMoveRoot,
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
  };
}
