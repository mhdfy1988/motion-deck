import { protectWorkspaceEntry } from '../core/ai-workspace.js';
import { createAIWorkspaceOperations } from './ai-workspace-operations.js';
import { createLibraryClipboard } from './library-clipboard.js';

// 素材维护共用原保存适配；AI工作区和剪贴板继续使用既有实现。
export function createWorkbenchLibraryOperations({
  state,
  ready,
  changed,
  publish,
  getAdapters,
  sourceId,
  failure,
}) {
  async function renameLibraryEntry({ kind, id, name }, expected) {
    ready(expected);
    if (state.poseDraft) throw failure('BUSY', '请先结束姿势草稿');
    if (
      !['pose', 'custom'].includes(kind) ||
      typeof name !== 'string' ||
      !name.trim() ||
      name !== name.trim() ||
      name.length > 80
    )
      throw failure('INVALID_ARGUMENT', '名称须为1到80字符');
    const collection = kind === 'pose' ? state.poses : state.customs,
      entry = collection.find((e) => e.id === id);
    if (!entry || (kind === 'pose' && id.startsWith('builtin:')))
      throw failure('INVALID_ARGUMENT', '仅可重命名当前模型的自定义素材');
    if (
      collection.some(
        (e) => e.id !== id && !(kind === 'pose' && e.id.startsWith('builtin:')) && e.name === name,
      )
    )
      throw failure('DUPLICATE_NAME', '同名自定义素材已存在');
    if (entry.name === name) return { id, name, revision: state.revision };
    if (!getAdapters()?.saveLibraryEntries) throw failure('NOT_READY', '素材保存适配未就绪');
    const renamed = { ...entry, name },
      next = collection.map((e) => (e.id === id ? renamed : e)),
      poses = kind === 'pose' ? next : state.poses,
      actions = kind === 'custom' ? next : state.customs;
    const playing = state.playing;
    state.busy = true;
    state.playing = false;
    publish();
    try {
      const workspace = protectWorkspaceEntry(state.aiWorkspace, id);
      await getAdapters().saveLibraryEntries({ actions, poses, aiWorkspace: workspace });
      state.poses = poses;
      state.customs = actions;
      state.aiWorkspace = workspace;
      if (kind === 'pose' && state.mode === 'pose' && state.posePreviewId === id)
        state.posePreviewName = name;
      if (kind === 'custom' && state.customPreview?.id === id)
        state.customPreview = { ...state.customPreview, name };
      changed();
      getAdapters().libraryRenamed?.({ kind, id, name });
      return { id, name, revision: state.revision };
    } finally {
      state.busy = false;
      state.playing = playing;
      publish();
    }
  }
  const aiWorkspace = createAIWorkspaceOperations({
    state,
    ready,
    changed,
    publish,
    getAdapters,
  });
  const libraryClipboard = createLibraryClipboard({
    state,
    ready,
    changed,
    publish,
    getAdapters,
    sourceId,
  });
  return { renameLibraryEntry, aiWorkspace, libraryClipboard };
}
