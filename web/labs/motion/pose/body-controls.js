import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { findEditableLimbChains, LimbIK } from './pose-ik.js';
import { findBodyChain, TorsoDrag, PelvisDrag } from './body-chain-controls.js';
import { BodyHighlight } from './body-highlight.js';
import { BodyMarkers } from './body-markers.js';
import { HandControls } from './hand-controls.js';
import { PoseTools } from '../ui/pose-tools.js';
import { pointerCoordinates, pointerRay, nearestPoseHandle } from './pose-picking.js';
import {
  beginBodyPointer,
  bodyPointerPoint,
  moveBodyPointer,
  finishBodyPointer,
} from './body-pointer.js';
import { bindRotationRings, rebaseLimitedRotation } from './rotation-rings.js';
import { jointLimits } from './joint-limits.js';
import { beginWholeRotation, applyWholeRotation } from './whole-rotation.js';

// 同一批关节点：双击开旋转环，单击选中、直接拖动不弹环；共用原工作台事务。
export class BodyControls {
  constructor({
    scene,
    camera,
    canvas,
    stage,
    controls,
    getState,
    onEdit,
    onBegin,
    onFinish,
    onError,
    onMoveRoot,
    onConstraintMode,
    onConstrain,
  }) {
    Object.assign(this, {
      camera,
      canvas,
      stage,
      controls,
      getState,
      onEdit,
      onBegin,
      onFinish,
      onError,
      onMoveRoot,
      onConstraintMode,
      onConstrain,
    });
    this.root = null;
    this.parts = [];
    this.limbs = [];
    this.selected = null;
    this.dragging = false;
    this.pointerDrag = null;
    this.tool = 'pose';
    this.highlight = new BodyHighlight(scene);
    this.moveHovered = false;
    this.rotationOpen = false;
    this.markers = new BodyMarkers(scene, () => this.getState().size);
    this.hovered = null;
    this.tools = new PoseTools({
      onTool: (tool) => this.setTool(tool),
      onConstraintMode: (value) => {
        if (value !== this.getState().jointConstraintMode) this.onConstraintMode(value);
      },
      onError: (error) => this.onError(error),
    });
    this.gizmo = new TransformControls(camera, canvas);
    this.gizmo.setMode('rotate');
    this.gizmo.setSpace('local');
    this.gizmo.setSize(0.75);
    scene.add(this.gizmo.getHelper());
    this.rotationRings = bindRotationRings(this.gizmo);
    this.wholeAnchor = new THREE.Object3D();
    this.wholeAnchor.name = 'editor-whole-pivot';
    scene.add(this.wholeAnchor);
    this.wholeSelected = false;
    this.wholeGesture = null;
    this.layer = document.createElement('div');
    this.layer.className = 'body-handles';
    stage.append(this.layer);
    this.select = document.getElementById('bodyPart');
    this.select.onchange = () =>
      this.choose(this.parts[Number(this.select.value)], { rotation: true });
    this.gizmo.addEventListener('mouseDown', () => this.beginRotation());
    this.gizmo.addEventListener('objectChange', () => this.updateRotation());
    this.gizmo.addEventListener('mouseUp', () => this.finish(false));
    this.cancel = () => {
      if (this.pointerDrag) {
        this.finishPointer(true);
        return;
      }
      if (!this.dragging) {
        this.setMoveHover(false);
        return;
      }
      this.gizmo.reset();
      this.finish(true);
      this.gizmo.pointerUp(null);
    };
    this.key = (e) => {
      if (e.key === 'Escape' && (this.dragging || this.pointerDrag)) {
        this.cancel();
        e.preventDefault();
      }
    };
    // 捕获阶段先判断是否命中人物，避免同时触发观察相机或骨关节选择。
    this.moveDown = (e) => {
      const state = this.getState();
      if (
        this.tool !== 'whole' ||
        e.button !== 0 ||
        state.busy ||
        state.playing ||
        state.poseDraft?.origin !== 'user' ||
        !document.getElementById('posePanel').open
      )
        return;
      if (this.hitGizmo(e)) return;
      const hit = this.personHit(e);
      if (!hit) {
        this.clearSelection();
        this.setMoveHover(false);
        return;
      }
      try {
        const carrier = this.onMoveRoot();
        this.wholeSelected = true;
        e.stopImmediatePropagation();
        this.beginPointer(e, { node: carrier, button: canvas, whole: true, point: hit.point });
      } catch (error) {
        this.onError(error);
      }
    };
    this.moveCanvas = (e) => {
      if (this.pointerDrag?.part.whole) this.movePointer(e);
      else if (this.tool === 'whole' && !this.dragging)
        this.setMoveHover(!this.hitGizmo(e) && !!this.personHit(e));
    };
    this.upCanvas = (e) => {
      if (this.pointerDrag?.part.whole && this.pointerDrag.id === e.pointerId) {
        this.finishPointer(false);
        this.setMoveHover(!!this.personHit(e));
      }
    };
    this.leaveCanvas = () => {
      if (!this.pointerDrag?.part.whole) this.setMoveHover(false);
    };
    canvas.addEventListener('pointerleave', this.leaveCanvas);
    this.cancelCanvas = (e) => {
      if (this.pointerDrag?.part.whole && this.pointerDrag.id === e.pointerId) {
        e.stopImmediatePropagation();
        this.cancel();
      }
    };
    canvas.addEventListener('pointerdown', this.moveDown, true);
    canvas.addEventListener('pointermove', this.moveCanvas);
    canvas.addEventListener('pointerup', this.upCanvas);
    canvas.addEventListener('pointercancel', this.cancelCanvas, true);
    this.wholeDouble = (e) => {
      const s = this.getState();
      if (
        e.button !== 0 ||
        this.tool !== 'whole' ||
        s.busy ||
        s.playing ||
        s.poseDraft?.origin !== 'user' ||
        this.pointerDrag ||
        this.dragging ||
        !document.getElementById('posePanel').open ||
        !this.personHit(e)
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      this.wholeSelected = true;
      this.rotationOpen = true;
      this.syncWholeAnchor();
      this.gizmo.attach(this.wholeAnchor);
    };
    canvas.addEventListener('dblclick', this.wholeDouble);
    this.blankDown = (e) => {
      const state = this.getState();
      if (
        e.button !== 0 ||
        this.tool !== 'pose' ||
        !this.selected ||
        state.busy ||
        state.poseDraft?.origin !== 'user' ||
        this.dragging ||
        this.pointerDrag ||
        !document.getElementById('posePanel').open
      )
        return;
      if (this.gizmo.object) {
        this.gizmo.getHelper().updateMatrixWorld(true);
        this.gizmo.pointerHover(pointerCoordinates(e, canvas));
        if (this.gizmo.axis !== null) return;
      }
      if (!this.personHit(e)) this.clearSelection();
    };
    canvas.addEventListener('pointerdown', this.blankDown, true);
    canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('lostpointercapture', this.cancel);
    window.addEventListener('blur', this.cancel);
    window.addEventListener('keydown', this.key);
    this.handEditor = new HandControls(this, scene);
  }
  // 旋转环沿原工作台事务；整体与局部只在允许节点和根变换选项上分流。
  beginRotation() {
    try {
      if (this.tool === 'whole') {
        const carrier = this.onMoveRoot();
        this.wholeGesture = beginWholeRotation(carrier, this.wholeAnchor);
        this.onBegin([carrier], { rootAdjustment: true });
      } else this.onBegin([this.gizmo.object]);
      this.dragging = true;
      this.previousControls = this.controls.enabled;
      this.controls.enabled = false;
    } catch (error) {
      this.wholeGesture = null;
      this.gizmo.reset();
      this.gizmo.pointerUp(null);
      this.onError(error);
    }
  }
  updateRotation() {
    if (this.wholeGesture) applyWholeRotation(this.wholeGesture);
    this.root?.updateMatrixWorld(true);
    if (this.tool === 'pose' && this.selected) {
      if (this.onConstrain()?.length) rebaseLimitedRotation(this.gizmo);
      this.onEdit({ middle: this.selected.node });
    }
  }

  get toolButtons() {
    return this.tools.element;
  }
  finish(cancel) {
    if (!this.dragging) return;
    this.dragging = false;
    this.controls.enabled = this.previousControls;
    try {
      this.onFinish(cancel);
    } catch (error) {
      this.onError(error);
    } finally {
      this.wholeGesture = null;
    }
  }
  setMoveHover(value) {
    this.moveHovered = value;
    this.canvas.classList.toggle('body-move-hover', value);
  }
  setTool(tool) {
    if (
      !['pose', 'whole'].includes(tool) ||
      this.getState().busy ||
      this.dragging ||
      this.pointerDrag
    )
      return;
    if (tool === 'whole') this.onMoveRoot();
    this.clearSelection();
    this.tool = tool;
    this.setMoveHover(false);
    this.gizmo.setSpace(tool === 'whole' ? 'world' : 'local');
  }
  hitGizmo(e) {
    if (!this.gizmo.object || !this.gizmo.enabled) return false;
    this.gizmo.getHelper().updateMatrixWorld(true);
    this.gizmo.pointerHover(pointerCoordinates(e, this.canvas));
    return this.gizmo.axis !== null;
  }
  syncWholeAnchor() {
    if (this.dragging || this.pointerDrag) return;
    this.root.updateMatrixWorld(true);
    if (this.pivotNode)
      this.wholeAnchor.position.copy(this.pivotNode.getWorldPosition(new THREE.Vector3()));
    else {
      const carrier = this.onMoveRoot();
      if (!this.wholeFallback) {
        const box = new THREE.Box3().setFromObject(this.root, true);
        if (box.isEmpty()) throw new Error('无法确定整体调整中心');
        this.wholeFallback = carrier.worldToLocal(box.getCenter(new THREE.Vector3()));
      }
      this.wholeAnchor.position.copy(carrier.localToWorld(this.wholeFallback.clone()));
    }
    this.wholeAnchor.quaternion.identity();
    this.wholeAnchor.updateMatrixWorld(true);
  }
  pointerRay(event) {
    return pointerRay(event, this.canvas, this.camera);
  }
  personHit(e) {
    if (!this.root) return null;
    this.root.updateMatrixWorld(true);
    const meshes = [];
    this.root.traverseVisible((n) => {
      if (n.isMesh) {
        if (n.isSkinnedMesh) {
          n.computeBoundingBox();
          n.computeBoundingSphere();
        }
        meshes.push(n);
      }
    });
    return this.pointerRay(e).intersectObjects(meshes, false)[0] ?? null;
  }
  rebuild(root) {
    this.handEditor?.close();
    this.markers.clear();
    this.hovered = null;
    this.setMoveHover(false);
    this.highlight.rebuild(root);
    this.cancel();
    this.gizmo.detach();
    this.rotationOpen = false;
    this.wholeSelected = false;
    this.wholeFallback = null;
    this.wholeGesture = null;
    this.pivotNode = null;
    this.tool = 'pose';
    this.limbs.forEach((limb) => limb.ik.dispose());
    this.torso?.dispose();
    this.pelvis?.dispose();
    this.torso = null;
    this.pelvis = null;
    this.limbs = [];
    this.root = root;
    this.selected = null;
    this.parts = [];
    this.layer.replaceChildren();
    this.select.replaceChildren();
    if (!root) return;
    const options = { getMode: () => this.getState().jointConstraintMode };
    this.limbs = findEditableLimbChains(root).map((chain) => ({
      chain,
      ik: new LimbIK(chain, options),
    }));
    const body = findBodyChain(root);
    this.pivotNode = body?.pelvis ?? null;
    if (body) {
      this.torso = new TorsoDrag(body, options);
      if (body.legs.length === 2) this.pelvis = new PelvisDrag(body, options);
    }
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '选择关节';
    placeholder.disabled = true;
    placeholder.selected = true;
    this.select.append(placeholder);
    const known = new Map([
      ['head', '头'],
      ['neck_01', '脖子'],
      ['spine_03', '胸'],
      ['spine_01', '腰'],
      ['pelvis', '骨盆'],
      ['clavicle_l', '左肩'],
      ['clavicle_r', '右肩'],
      ['upperarm_l', '左上臂'],
      ['upperarm_r', '右上臂'],
      ['lowerarm_l', '左肘'],
      ['lowerarm_r', '右肘'],
      ['hand_l', '左手腕'],
      ['hand_r', '右手腕'],
      ['thigh_l', '左大腿'],
      ['thigh_r', '右大腿'],
      ['calf_l', '左膝'],
      ['calf_r', '右膝'],
      ['foot_l', '左脚踝'],
      ['foot_r', '右脚踝'],
    ]);
    for (const { chain } of this.limbs) {
      const side = chain.name.startsWith('左') ? '左' : '右',
        leg = chain.name.includes('脚');
      known.set(chain.upper.name, side + (leg ? '大腿' : '上臂'));
      known.set(chain.middle.name, side + (leg ? '膝' : '肘'));
      known.set(chain.end.name, side + (leg ? '脚踝' : '手腕'));
    }
    if (body) {
      [body.pelvis, ...body.links, body.head].forEach((node, i) =>
        known.set(node.name, ['骨盆', '腰', '腹', '胸', '脖子', '头'][i]),
      );
    }
    root.traverse((node) => {
      if (node.isBone) {
        const limb = this.limbs.find(
            (limb) => limb.chain.end === node || limb.chain.middle === node,
          ),
          bodyDrag =
            node === body?.pelvis
              ? this.pelvis
              : node === body?.head || body?.links.includes(node)
                ? this.torso
                : null;
        this.parts.push({
          node,
          name: known.get(node.name) ?? node.name,
          limb,
          bodyDrag,
          middleDrag: limb?.chain.middle === node,
        });
      }
    });
    for (const option of document.getElementById('bone').options) {
      const bone = this.getState().bones[Number(option.value)];
      if (bone) {
        option.textContent = known.get(bone.name) ?? bone.name;
        option.title = bone.name;
      }
    }
    this.parts.forEach((part, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = part.name;
      this.select.append(option);
      if (!known.has(part.node.name) && !part.limb) return;
      const button = document.createElement('button');
      button.className = 'body-handle';
      button.dataset.part = part.name;
      part.button = button;
      this.markers.add(part);
      button.onpointerenter = () => {
        this.hovered = part;
      };
      button.onpointerleave = () => {
        if (this.hovered === part) this.hovered = null;
      };
      button.onfocus = () => {
        this.hovered = part;
      };
      button.onblur = () => {
        if (this.hovered === part) this.hovered = null;
      };
      if (part.limb) {
        button.classList.add(part.middleDrag ? 'joint-draggable' : 'draggable');
        if (part.middleDrag) button.dataset.joint = part.name;
        else button.dataset.limb = part.limb.chain.name;
        const label = part.middleDrag ? part.name : part.limb.chain.name;
        button.setAttribute('aria-label', `拖动${label}`);
      } else if (part.bodyDrag) {
        button.classList.add('body-draggable');
        button.setAttribute('aria-label', `拖动${part.name}`);
      } else {
        button.setAttribute('aria-label', `旋转${part.name}`);
      }
      button.onclick = (e) => {
        e.preventDefault();
        if (e.detail === 0) this.choose(part, { rotation: true });
      };
      button.ondblclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.choose(this.nearestPart(e) ?? part, { rotation: true });
      };
      button.onpointerdown = (e) => this.beginPointer(e, this.nearestPart(e) ?? part);
      button.onpointermove = (e) => this.movePointer(e);
      button.onpointerup = (e) => {
        if (this.pointerDrag?.id === e.pointerId) this.finishPointer(false);
      };
      button.onpointercancel = this.cancel;
      button.onlostpointercapture = () => {
        if (this.pointerDrag?.part === part) this.finishPointer(true);
      };
      this.layer.append(button);
    });
  }
  // 点击入口、透明命中与工作台手势分别委托专职模块，仍使用这一份选择与事务状态。
  nearestPart(event) {
    return nearestPoseHandle(this.parts, event);
  }
  beginPointer(event, part) {
    return beginBodyPointer(this, event, part);
  }
  pointerPoint(event) {
    return bodyPointerPoint(this, event);
  }
  movePointer(event) {
    return moveBodyPointer(this, event);
  }
  finishPointer(cancel) {
    return finishBodyPointer(this, cancel);
  }

  choose(part, { rotation = false } = {}) {
    if (!part || this.getState().busy || this.tool !== 'pose') return;
    this.selected = part;
    this.select.value = this.parts.indexOf(part);
    this.rotationOpen = rotation;
    if (rotation) this.gizmo.attach(part.node);
    else this.gizmo.detach();
    this.gizmo.setMode('rotate');
    this.gizmo.setSpace('local');
    this.onEdit({ middle: part.node });
  }
  chooseBone(node) {
    this.choose(this.parts.find((part) => part.node === node));
  }
  clearSelection() {
    this.handEditor?.close();
    this.selected = null;
    this.hovered = null;
    this.rotationOpen = false;
    this.wholeSelected = false;
    this.wholeFallback = null;
    this.select.value = '';
    this.gizmo.detach();
    this.gizmo.axis = null;
    this.gizmo.getHelper().visible = false;
    for (const part of this.parts) part.button?.classList.remove('active');
    this.markers.update(this.markers.group.visible, null, null, null);
  }
  update() {
    const state = this.getState();
    if (state.root !== this.root) this.rebuild(state.root);
    const visible =
      !!state.root &&
      document.getElementById('posePanel').open &&
      state.poseDraft?.origin === 'user' &&
      !state.playing;
    this.handEditor.update(visible);
    const handActive = !!this.handEditor.hand;
    if (!visible) {
      this.cancel();
      this.clearSelection();
      this.tool = 'pose';
      this.setMoveHover(false);
    }
    this.highlight.update(
      visible &&
        this.tool === 'whole' &&
        (this.wholeSelected || !!this.pointerDrag?.part.whole || this.moveHovered) &&
        (!state.busy || this.dragging || !!this.pointerDrag?.part.whole),
      !!this.pointerDrag?.part.whole,
      state.size,
    );
    this.tools.update({
      state,
      visible,
      tool: this.tool,
      rig: this.root ? jointLimits(this.root) : null,
    });
    this.layer.hidden =
      handActive || !visible || this.tool !== 'pose' || (state.busy && !this.pointerDrag?.active);
    this.select.disabled = handActive || !visible || state.busy || this.tool !== 'pose';
    this.gizmo.enabled =
      this.rotationOpen &&
      !handActive &&
      visible &&
      !this.pointerDrag &&
      (!state.busy || this.dragging);
    this.gizmo.getHelper().visible =
      this.rotationOpen &&
      !handActive &&
      visible &&
      (this.tool === 'whole' ? this.wholeSelected : !!this.selected) &&
      !this.pointerDrag;
    this.markers.update(
      !this.layer.hidden || (visible && this.tool === 'pose' && this.dragging),
      this.selected,
      this.hovered,
      this.pointerDrag?.part,
    );
    if (!visible) {
      this.gizmo.detach();
      return;
    }
    if (this.tool === 'whole' && this.wholeSelected) this.syncWholeAnchor();
    if (this.rotationOpen && !this.gizmo.object && !this.pointerDrag) {
      const target =
        this.tool === 'whole'
          ? this.wholeSelected
            ? this.wholeAnchor
            : null
          : this.selected?.node;
      if (target) this.gizmo.attach(target);
    }
    const box = this.stage.getBoundingClientRect();
    for (const part of this.parts) {
      part.button?.classList.toggle('active', part === this.selected);
      if (!part.button) continue;
      part.button.disabled = state.busy && this.pointerDrag?.part !== part;
      const v = part.node.getWorldPosition(new THREE.Vector3()).project(this.camera);
      // 此处仅更新透明点击范围，不再绘制圆点；可见点由BodyMarkers在同一WebGL帧绘制。
      part.button.hidden =
        (Math.abs(v.x) > 1 || Math.abs(v.y) > 1 || Math.abs(v.z) > 1) &&
        this.pointerDrag?.part !== part;
      part.button.style.left = `${((v.x + 1) * box.width) / 2}px`;
      part.button.style.top = `${((1 - v.y) * box.height) / 2}px`;
    }
  }
  dispose() {
    this.handEditor.dispose();
    this.cancel();
    this.limbs.forEach((limb) => limb.ik.dispose());
    this.torso?.dispose();
    this.pelvis?.dispose();
    window.removeEventListener('keydown', this.key);
    window.removeEventListener('blur', this.cancel);
    this.canvas.removeEventListener('pointercancel', this.cancel);
    this.canvas.removeEventListener('lostpointercapture', this.cancel);
    this.canvas.removeEventListener('pointerdown', this.moveDown, true);
    this.canvas.removeEventListener('pointerdown', this.blankDown, true);
    this.canvas.removeEventListener('dblclick', this.wholeDouble);
    this.canvas.removeEventListener('pointermove', this.moveCanvas);
    this.canvas.removeEventListener('pointerup', this.upCanvas);
    this.canvas.removeEventListener('pointercancel', this.cancelCanvas, true);
    this.canvas.removeEventListener('pointerleave', this.leaveCanvas);
    this.setMoveHover(false);
    this.markers.dispose();
    this.highlight.dispose();
    this.rotationRings.dispose();
    this.wholeAnchor.removeFromParent();
    this.gizmo.getHelper().removeFromParent();
    this.gizmo.dispose();
    this.tools.dispose();
    this.layer.remove();
  }
}
