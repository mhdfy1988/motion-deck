import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { createSessionState } from '../web/labs/motion/application/session-state.js';
import { createWorkbenchOperations } from '../web/labs/motion/application/workbench-operations.js';
import { createPreviewController } from '../web/labs/motion/application/preview-controller.js';
import { PoseSampler, capturePose } from '../web/labs/motion/core/sequence-core.js';

// 仅测真实预览/工作台/采样器的CPU链路，不加载用户资料、不创建渲染器。
export function previewFixture(poseCount = 99) {
  const state = createSessionState(null),
    root = new THREE.Group(),
    bone = new THREE.Bone();
  root.add(bone);
  for (let index = 1; index < 66; index++) {
    const child = new THREE.Bone();
    child.position.y = 0.01;
    bone.add(child);
  }
  state.root = root;
  state.modelKey = 'preview-benchmark';
  state.bones = [];
  root.traverse((node) => {
    if (node.isBone) state.bones.push(node);
  });
  state.sampler = new PoseSampler(root);
  const track = new THREE.VectorKeyframeTrack(`${bone.uuid}.position`, [0, 1], [0, 0, 0, 1, 0, 0]);
  state.clips = Array.from(
    { length: 162 },
    (_, index) => new THREE.AnimationClip(`clip-${index}`, 1, [track]),
  );
  const pose = capturePose(root);
  let scans = 0;
  state.poses = new Proxy(
    Array.from({ length: poseCount }, (_, index) => ({
      id: `pose-${index}`,
      name: `姿势${index}`,
      pose,
    })),
    {
      get(target, key, receiver) {
        if (key === 'map') scans++;
        return Reflect.get(target, key, receiver);
      },
    },
  );
  state.customs = Array.from({ length: 100 }, (_, index) => ({
    id: `custom-${index}`,
    name: `动作${index}`,
  }));
  state.items = Array.from({ length: 100 }, (_, index) => ({
    id: `item-${index}`,
    kind: 'action',
    name: '片段',
    in: 0,
    out: 1,
    duration: 1,
  }));
  const workbench = createWorkbenchOperations(state);
  const controller = createPreviewController({
    state,
    workbench,
    getSourceIndex: () => state.sourceIndex,
    onSource() {},
    onSequence() {},
    onCustom() {},
    onChange() {},
  });
  workbench.source(0, 0, true);
  return {
    state,
    bone,
    workbench,
    controller,
    get scans() {
      return scans;
    },
    dispose() {
      state.sampler.dispose();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = {
    kind: 'preview-cpu-only',
    node: process.version,
    frames: 3000,
    rounds: 7,
    cases: [],
  };
  for (const poseCount of [99, 5000]) {
    const fixture = previewFixture(poseCount),
      times = [];
    for (let frame = 0; frame < 500; frame++) fixture.controller.advance(1 / 60, 1);
    const before = fixture.scans;
    for (let round = 0; round < report.rounds; round++) {
      const start = performance.now();
      for (let frame = 0; frame < report.frames; frame++) fixture.controller.advance(1 / 60, 1);
      times.push((performance.now() - start) / report.frames);
    }
    times.sort((a, b) => a - b);
    report.cases.push({
      poseCount,
      clipCount: 162,
      customCount: 100,
      itemCount: 100,
      bones: 66,
      medianMsPerFrame: times[3],
      minMsPerFrame: times[0],
      maxMsPerFrame: times.at(-1),
      fullScans: fixture.scans - before,
      measuredFrames: report.frames * report.rounds,
    });
    fixture.dispose();
  }
  const output = process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
  if (output) {
    const target = resolve(output),
      base = resolve('output');
    if (!target.startsWith(base + '\\') && !target.startsWith(base + '/'))
      throw new Error('基准结果只能写入output子目录');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
  console.log(JSON.stringify(report, null, 2));
}
