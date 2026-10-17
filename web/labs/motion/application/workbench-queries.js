import { rootMotionOptions } from '../core/root-motion.js';
import { assetOwner } from '../core/ai-workspace.js';
import { jointLimits, constraintSummary } from '../pose/joint-limits.js';

// 查询只读取同一会话；节点映射在切模型时由主工作台重建。
export function createWorkbenchQueries({
  state,
  sync,
  ready,
  getNodeMap,
  rootTransform,
  sourceId,
  failure,
}) {
  function pageRange(offset = 0, limit = 50) {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw failure('INVALID_ARGUMENT', '分页范围无效');
    return { offset, limit };
  }
  function inspect() {
    sync();
    return {
      revision: state.revision,
      jointConstraints: constraintSummary(state.root, state.jointConstraintMode),
      rootMotion: rootMotionOptions(state.rootMotion),
      modelKey: state.modelKey,
      status: state.closed
        ? 'closed'
        : state.busy
          ? 'busy'
          : state.root && state.sampler && state.modelKey
            ? 'ready'
            : 'loading',
      mode: state.mode,
      editingContext: state.poseDraft ? 'pose-draft' : 'preview',
      draft: state.poseDraft
        ? {
            dirty: state.poseDraft.dirty,
            canUndo: !!state.poseDraft.undo.length,
            canRedo: !!state.poseDraft.redo.length,
          }
        : null,
      playing: state.playing,
      sourceTime: state.sourceTime,
      time: state.time,
      counts: {
        bones: state.bones.length,
        actions: state.clips.length,
        poses: state.poses.length,
        customs: state.customs.length,
        items: state.items.length,
      },
    };
  }
  function modelInspect() {
    ready();
    return {
      modelKey: state.modelKey,
      revision: state.revision,
      name: state.model?.name ?? '',
      builtinId: state.model?.builtinId ?? null,
      nodeCount: getNodeMap().size,
      boneCount: state.bones.length,
      rootTransform:
        state.bones.filter((b) => !b.parent?.isBone).length === 1 ? rootTransform() : null,
    };
  }
  function rigList(options = {}) {
    ready();
    const { offset, limit } = pageRange(options.offset, options.limit);
    state.root.updateMatrixWorld(true);
    const rig = jointLimits(state.root);
    return {
      modelKey: state.modelKey,
      revision: state.revision,
      jointConstraints: constraintSummary(state.root, state.jointConstraintMode),
      total: state.bones.length,
      offset,
      entries: state.bones.slice(offset, offset + limit).map((b) => {
        const c = rig.joints.get(b);
        return {
          id: `node:${getNodeMap().get(b)}`,
          name: b.name,
          nodeIndex: getNodeMap().get(b),
          parentId: getNodeMap().has(b.parent) ? `node:${getNodeMap().get(b.parent)}` : null,
          position: b.position.toArray(),
          quaternion: b.quaternion.toArray(),
          worldMatrix: b.matrixWorld.toArray(),
          jointLimit: c
            ? {
                status: 'calibrated',
                kind: c.kind,
                type: c.type,
                reference: c.reference.toArray(),
                frame: c.frame.toArray(),
                bendAxis: c.axis.toArray(),
                twistAxis: c.twistAxis.toArray(),
                ranges: c.ranges.map((p) => p.map((v) => (v * 180) / Math.PI)),
              }
            : { status: rig.roots.includes(b) ? 'root' : 'unmanaged' },
        };
      }),
    };
  }
  function libraryList(options = {}) {
    ready();
    const { offset, limit } = pageRange(options.offset, options.limit),
      entries = [
        ...state.clips.map((c, i) => ({
          id: sourceId(c, i),
          kind: 'action',
          name: c.name,
          duration: c.duration,
        })),
        ...state.poses.map((p) => ({ id: p.id, kind: 'pose', name: p.name })),
        ...state.customs.map((a) => ({ id: a.id, kind: 'custom', name: a.name })),
      ];
    if (
      options.taskId !== undefined &&
      !state.aiWorkspace?.tasks.some((t) => t.id === options.taskId)
    )
      throw failure('INVALID_ARGUMENT', '制作任务不存在');
    const selected = entries.flatMap((e) => {
      const owner = assetOwner(state.aiWorkspace, e.id);
      if (
        (options.taskId && owner?.task.id !== options.taskId) ||
        (options.scope === 'custom' &&
          (owner || e.kind === 'action' || e.id.startsWith('builtin:'))) ||
        (options.scope === 'ai' && !owner) ||
        (!options.includeTrash && owner?.entry.state === 'trash') ||
        (options.kind && e.kind !== options.kind) ||
        (options.role && owner?.entry.role !== options.role) ||
        (options.stage !== undefined && owner?.entry.stage !== options.stage) ||
        (options.iteration !== undefined && owner?.entry.iteration !== options.iteration) ||
        (options.query &&
          ![e.name, owner?.entry.stage ?? '', owner?.task.name ?? '']
            .join(' ')
            .toLowerCase()
            .includes(options.query.toLowerCase()))
      )
        return [];
      return [
        {
          ...e,
          ...(owner
            ? {
                taskId: owner.task.id,
                role: owner.entry.role,
                stage: owner.entry.stage,
                iteration: owner.entry.iteration,
                state: owner.entry.state,
                protected: owner.entry.protected,
              }
            : {}),
        },
      ];
    });
    return {
      modelKey: state.modelKey,
      revision: state.revision,
      total: selected.length,
      offset,
      entries: selected.slice(offset, offset + limit),
    };
  }
  return { inspect, modelInspect, rigList, libraryList };
}
