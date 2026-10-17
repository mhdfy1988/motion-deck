import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { previewFixture } from '../../scripts/benchmark-preview.mjs';
import {
  PoseSampler,
  capturePose,
  compileSequence,
} from '../../web/labs/motion/core/sequence-core.js';

for (const mode of ['source', 'sequence', 'custom'])
  test(`${mode}连续播放不逐帧扫描素材，查询和显式定位仍同步版本`, () => {
    const f = previewFixture(1000);
    try {
      if (mode !== 'source') {
        const sequence = compileSequence(
          [{ id: 'pose', kind: 'pose', duration: 1000, pose: capturePose(f.state.root) }],
          f.state.sampler,
        );
        f.state.items = [{ id: 'pose', kind: 'pose', duration: 1000 }];
        if (mode === 'sequence') {
          f.state.sequence = sequence;
          f.workbench.sequence(0);
        } else f.workbench.custom({ name: '预览', sequence }, 0);
        f.state.playing = true;
      }
      const revision = f.workbench.inspect().revision,
        before = f.scans;
      for (let frame = 0; frame < 100; frame++) f.controller.advance(1 / 60, 1);
      assert.equal(f.scans, before);
      assert.equal(f.state.revision, revision);
      assert.equal(f.workbench.inspect().revision, revision);
      assert.equal(f.scans, before + 1);
      f.controller.seek(0.3);
      assert.ok(f.scans > before + 1);
      assert.equal(f.state.playing, false);
    } finally {
      f.dispose();
    }
  });

test('帧推进不吞掉界面原地修改，下一条带版本的命令仍拒绝过期版本', () => {
  for (const mutate of [
    (state) => {
      state.poses[0].name = '已改名';
    },
    (state) => {
      state.items[0].duration = 2;
    },
    (state) => {
      state.customs[0].name = '已改名';
    },
    (state) => {
      state.selection.add('item-0');
    },
    (state) => {
      state.rootMotion.horizontal = false;
    },
    (state) => {
      state.clips.push(state.clips[0]);
    },
  ]) {
    const f = previewFixture();
    try {
      const revision = f.workbench.inspect().revision,
        before = f.scans;
      mutate(f.state);
      f.controller.advance(1 / 60, 1);
      assert.equal(f.scans, before);
      assert.throws(
        () =>
          f.workbench.fromClip({
            clipId: 'source:0:clip-0',
            time: 0.2,
            modelKey: f.state.modelKey,
            revision,
          }),
        { code: 'REVISION_CONFLICT' },
      );
      assert.equal(f.state.revision, revision + 1);
      assert.equal(f.workbench.inspect().revision, revision + 1);
    } finally {
      f.dispose();
    }
  }
});

test('瞬态调用显式携带预期版本时仍完整观察，不能绕过冲突检查', () => {
  const f = previewFixture();
  try {
    const revision = f.workbench.inspect().revision,
      before = f.scans;
    f.state.poses[0].name = '变更';
    assert.throws(
      () => f.workbench.source(0, 0.2, true, { transient: true, expected: { revision } }),
      { code: 'REVISION_CONFLICT' },
    );
    assert.equal(f.scans, before + 1);
  } finally {
    f.dispose();
  }
});

test('瞬态快速路径仍逐次检查忙碌、草稿、关闭和模型就绪', () => {
  for (const [patch, code] of [
    [{ busy: true }, 'BUSY'],
    [{ poseDraft: { origin: 'user' } }, 'BUSY'],
    [{ closed: true }, 'SESSION_CLOSED'],
    [{ modelKey: null }, 'NOT_READY'],
    [{ sampler: null }, 'NOT_READY'],
    [{ root: null }, 'NOT_READY'],
  ]) {
    const f = previewFixture(),
      sampler = f.state.sampler;
    try {
      Object.assign(f.state, patch);
      assert.throws(() => f.workbench.source(0, 0.2, true, { transient: true }), { code });
    } finally {
      sampler.dispose();
    }
  }
});

test('切换根模型的瞬态请求先重建映射，不沿用旧关节表', () => {
  const f = previewFixture();
  try {
    const oldRevision = f.workbench.inspect().revision,
      before = f.scans;
    f.state.sampler.dispose();
    const root = new THREE.Group(),
      bone = new THREE.Bone();
    bone.name = '新关节';
    root.add(bone);
    Object.assign(f.state, {
      root,
      bones: [bone],
      modelKey: 'new-model',
      sampler: new PoseSampler(root),
      clips: [new THREE.AnimationClip('new', 1, [])],
    });
    f.workbench.source(0, 0.2, true, { transient: true });
    assert.equal(f.scans, before + 1);
    assert.ok(f.state.revision > oldRevision);
    const rig = f.workbench.rigList();
    assert.equal(rig.entries.length, 1);
    assert.equal(rig.entries[0].name, '新关节');
    assert.equal(rig.entries[0].id, 'node:1');
  } finally {
    f.dispose();
  }
});

test('瞬态采样中途失败仍恢复骨架、时间和播放状态', () => {
  const f = previewFixture();
  try {
    const before = capturePose(f.state.root),
      time = f.state.sourceTime,
      revision = f.state.revision;
    f.state.sampler.sample = () => {
      f.bone.position.x = 99;
      throw new Error('采样失败');
    };
    assert.throws(() => f.workbench.source(0, 0.4, false, { transient: true }), /采样失败/);
    assert.deepEqual(capturePose(f.state.root), before);
    assert.equal(f.state.sourceTime, time);
    assert.equal(f.state.playing, true);
    assert.equal(f.state.revision, revision);
  } finally {
    f.dispose();
  }
});
