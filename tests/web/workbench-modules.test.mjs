import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSessionState } from '../../web/labs/motion/application/session-state.js';
import { createWorkbenchOperations } from '../../web/labs/motion/application/workbench-operations.js';
import { createWorkbenchMediaOperations } from '../../web/labs/motion/application/workbench-media-operations.js';
import { createWorkbenchLibraryOperations } from '../../web/labs/motion/application/workbench-library-operations.js';
import { PoseSampler, capturePose } from '../../web/labs/motion/core/sequence-core.js';

const failure = (code, message) => Object.assign(new Error(message), { code });
function fixture() {
  const state = createSessionState(null),
    root = new THREE.Group(),
    bone = new THREE.Bone();
  root.add(bone);
  state.root = root;
  state.bones = [bone];
  state.modelKey = 'one';
  state.sampler = new PoseSampler(root);
  return { state, root, bone };
}

test('内部职责提取不扩充公开工作台，也不暴露节点映射和根工具', () => {
  const { state } = fixture(),
    w = createWorkbenchOperations(state);
  const expected =
    'sync changed inspect modelInspect rigList libraryList libraryClipboard aiWorkspace renameLibraryEntry source sequence pose custom sampleOutput sampleSource setRootMotion fromClip fromLibrary fromSequence sampleSequenceRange captureSequence exportVideo setRootTransform userMoveRoot timeline preview exportGLB discardDraft captureCurrent beginUserDraft beginUserPoseGesture finishUserPoseGesture beginUserRotation finishUserRotation setBones setConstraintMode constrainUserGesture jointConstraintSummary draftHistory saveDraft captureViews configure canAdvance close subscribe'.split(
      ' ',
    );
  assert.deepEqual(Object.keys(w).sort(), expected.sort());
  assert.equal(Object.isFrozen(w), true);
});

test('切模型重建映射后查询与姿势写入共用新节点ID，旧映射不被模块捕获', () => {
  const { state, bone: oldBone } = fixture(),
    w = createWorkbenchOperations(state);
  assert.equal(w.rigList().entries[0].id, 'node:1');
  const root = new THREE.Group(),
    padding = new THREE.Group(),
    bone = new THREE.Bone();
  root.add(padding, bone);
  state.root = root;
  state.modelKey = 'two';
  state.bones = [bone];
  state.sampler = new PoseSampler(root);
  assert.equal(w.modelInspect().nodeCount, 3);
  assert.equal(w.rigList().entries[0].id, 'node:2');
  const revision = w.inspect().revision;
  w.beginUserDraft();
  assert.throws(
    () => w.setBones([{ id: 'node:2', quaternion: [0, 0, 0, 1] }], { modelKey: 'one', revision }),
    { code: 'MODEL_MISMATCH' },
  );
  assert.throws(() => w.setBones([{ id: 'node:1', quaternion: [0, 0, 0, 1] }]), {
    code: 'INVALID_ARGUMENT',
  });
  w.setBones([
    {
      id: 'node:2',
      quaternion: new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.2)
        .toArray(),
    },
  ]);
  assert.notEqual(bone.quaternion.y, 0);
  assert.equal(oldBone.quaternion.y, 0);
  assert.equal(state.poseDraft.undo.length, 1);
  w.draftHistory('undo');
  assert.equal(bone.quaternion.y, 0);
  w.discardDraft();
  assert.throws(() => w.rigList({ limit: 101 }), { code: 'INVALID_ARGUMENT' });
  w.close();
  assert.throws(() => w.modelInspect(), { code: 'SESSION_CLOSED' });
});

test('媒体模块晚绑定原适配，成功与失败都恢复同一会话的播放和忙碌状态', async () => {
  const { state } = fixture();
  let adapters = null;
  const media = createWorkbenchMediaOperations({
    state,
    ready: () => {},
    publish: () => {},
    getAdapters: () => adapters,
    failure,
  });
  await assert.rejects(media.captureViews(['front']), { code: 'NOT_READY' });
  state.playing = true;
  adapters = {
    captureViews: async () => {
      assert.equal(state.busy, true);
      assert.equal(state.playing, false);
      throw new Error('encoder');
    },
  };
  await assert.rejects(media.captureViews(['front']), /encoder/);
  assert.equal(state.busy, false);
  assert.equal(state.playing, true);
  adapters.captureViews = async () => ['output.png'];
  assert.deepEqual((await media.captureViews(['front'])).files, ['output.png']);
  assert.equal(state.playing, true);
  assert.equal(state.busy, false);
});

test('媒体批量取样使用实时映射，失败恢复姿势且不移动播放头或版本', () => {
  const { state, root, bone } = fixture();
  state.sequence = { duration: 1 };
  state.playing = true;
  state.time = 0.7;
  let map = new Map([[bone, 1]]);
  const media = createWorkbenchMediaOperations({
    state,
    sequenceReady: () => {},
    getNodeMap: () => map,
    failure,
    sampleOutput: (_, time) => {
      bone.position.x = time;
      if (time === 1) throw new Error('sample');
      return { pose: capturePose(root) };
    },
  });
  map = new Map([[bone, 4]]);
  const before = capturePose(root),
    revision = state.revision;
  const sampled = media.sampleSequenceRange({ times: [0, 0.5], boneIds: ['node:4'] });
  assert.equal(sampled.samples[1].bones[0].position[0], 0.5);
  assert.deepEqual(capturePose(root), before);
  assert.throws(() => media.sampleSequenceRange({ times: [0, 1], boneIds: ['node:4'] }), /sample/);
  assert.deepEqual(capturePose(root), before);
  assert.equal(state.time, 0.7);
  assert.equal(state.revision, revision);
  assert.equal(state.playing, true);
});

test('素材维护写盘成功前不提交，失败保留引用，成功后只发布原一次变更', async () => {
  const { state } = fixture(),
    entry = { id: 'saved', name: '原名', pose: [] };
  state.poses = [entry];
  state.mode = 'pose';
  state.posePreviewId = entry.id;
  state.posePreviewName = entry.name;
  state.playing = true;
  let adapters = null,
    finish,
    fail,
    changes = 0,
    callback = 0;
  const library = createWorkbenchLibraryOperations({
    state,
    ready: () => {},
    changed: () => changes++,
    publish: () => {},
    getAdapters: () => adapters,
    sourceId: () => '',
    failure,
  });
  adapters = {
    saveLibraryEntries: () =>
      new Promise((resolve, reject) => {
        finish = resolve;
        fail = reject;
      }),
    libraryRenamed: () => callback++,
  };
  const failed = library.renameLibraryEntry({ kind: 'pose', id: 'saved', name: '新名' });
  assert.equal(state.busy, true);
  assert.equal(state.poses[0], entry);
  fail(new Error('disk'));
  await assert.rejects(failed, /disk/);
  assert.equal(state.poses[0], entry);
  assert.equal(changes, 0);
  assert.equal(state.playing, true);
  const saved = library.renameLibraryEntry({ kind: 'pose', id: 'saved', name: '新名' });
  assert.equal(state.poses[0], entry);
  finish();
  await saved;
  assert.equal(state.poses[0].id, entry.id);
  assert.equal(state.posePreviewName, '新名');
  assert.equal(changes, 1);
  assert.equal(callback, 1);
  assert.equal(state.busy, false);
});

test('素材提交后展示回调失败不伪称磁盘回滚，忙碌仍还原', async () => {
  const { state } = fixture();
  state.poses = [{ id: 'p', name: '旧' }];
  const library = createWorkbenchLibraryOperations({
    state,
    ready: () => {},
    changed: () => {},
    publish: () => {},
    sourceId: () => '',
    failure,
    getAdapters: () => ({
      saveLibraryEntries: async () => {},
      libraryRenamed: () => {
        throw new Error('display');
      },
    }),
  });
  await assert.rejects(
    library.renameLibraryEntry({ kind: 'pose', id: 'p', name: '新' }),
    /display/,
  );
  assert.equal(state.poses[0].name, '新');
  assert.equal(state.busy, false);
});

test('编排截图和视频沿共享取样计划，适配失败恢复画面且预算在调用前拒绝', async () => {
  const { state, root, bone } = fixture();
  state.sequence = { duration: 2 };
  state.playing = true;
  state.time = 0.8;
  const before = capturePose(root),
    revision = state.revision;
  let calls = 0;
  const adapters = {
    captureSequence: async (plan) => {
      calls++;
      plan.sample(0.5);
      throw new Error('capture');
    },
    exportVideo: async (plan) => {
      calls++;
      assert.deepEqual(plan.views, ['front-right']);
      plan.sample(1);
      return { file: 'video.mp4' };
    },
  };
  const media = createWorkbenchMediaOperations({
    state,
    sequenceReady: () => {},
    publish: () => {},
    getAdapters: () => adapters,
    failure,
    sampleOutput: (_, time) => {
      bone.position.x = time;
      return { pose: capturePose(root) };
    },
  });
  const args = { times: [0, 1], views: ['front'] };
  await assert.rejects(media.reviewMedia(args), /capture/);
  assert.deepEqual(capturePose(root), before);
  assert.equal(state.playing, true);
  assert.equal(state.busy, false);
  assert.equal(state.time, 0.8);
  assert.equal(state.revision, revision);
  const video = await media.reviewMedia(
    { name: 'video', confirmed: true, start: 0, end: 2 },
    undefined,
    true,
  );
  assert.equal(video.file, 'video.mp4');
  assert.equal(video.revision, revision);
  assert.deepEqual(capturePose(root), before);
  await assert.rejects(media.reviewMedia({ ...args, views: ['unknown'] }), {
    code: 'INVALID_ARGUMENT',
  });
  await assert.rejects(
    media.reviewMedia({ start: 0, end: 31, name: 'video', confirmed: true }, undefined, true),
    { code: 'INVALID_ARGUMENT' },
  );
  assert.equal(calls, 2);
});

test('GLB命令导出保留位移策略与确认门槛，适配失败仍还原播放和忙碌', async () => {
  const { state } = fixture();
  state.items = [{}];
  state.playing = true;
  let calls = 0,
    shouldFail = true;
  const media = createWorkbenchMediaOperations({
    state,
    ready: () => {},
    publish: () => {},
    failure,
    getAdapters: () => ({
      exportGLB: async (name, policy) => {
        calls++;
        assert.equal(name, 'export');
        assert.deepEqual(policy, { horizontal: false, vertical: true });
        assert.equal(state.busy, true);
        if (shouldFail) throw new Error('export');
        return 'result.glb';
      },
    }),
  });
  const args = {
    name: 'export',
    confirmed: true,
    rootMotion: { horizontal: false, vertical: true },
  };
  await assert.rejects(media.exportGLB({ ...args, confirmed: false }), {
    code: 'INVALID_ARGUMENT',
  });
  assert.equal(calls, 0);
  await assert.rejects(media.exportGLB(args), /export/);
  assert.equal(state.busy, false);
  assert.equal(state.playing, true);
  shouldFail = false;
  assert.equal((await media.exportGLB(args)).file, 'result.glb');
  assert.equal(state.playing, true);
  assert.equal(state.busy, false);
});
