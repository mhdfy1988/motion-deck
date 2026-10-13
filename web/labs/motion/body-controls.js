import * as THREE from 'three';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {capturePose,applyPose} from './sequence-core.js';

// 控制器留在场景层，不进入模型树，保持姿势快照与原骨架结构不变。
export class BodyControls{
  constructor({scene,camera,canvas,stage,controls,getState,onEdit,poseDrag}){
    Object.assign(this,{stage,controls,getState,onEdit,poseDrag});this.root=null;this.parts=[];this.selected=null;this.before=null;
    this.gizmo=new TransformControls(camera,canvas);this.gizmo.setSize(.75);this.gizmo.setSpace('local');scene.add(this.gizmo.getHelper());
    this.layer=document.createElement('div');this.layer.className='body-handles';stage.append(this.layer);
    this.select=document.getElementById('bodyPart');this.select.onchange=()=>this.choose(this.parts[Number(this.select.value)]);
    for(const mode of ['translate','rotate'])document.getElementById(`body-${mode}`).onclick=()=>this.setMode(mode);
    this.gizmo.addEventListener('mouseDown',()=>{this.before=capturePose(this.root);this.controls.enabled=false;this.onEdit({middle:this.selected.node});});
    this.gizmo.addEventListener('objectChange',()=>{this.root?.updateMatrixWorld(true);this.onEdit({middle:this.selected.node});});
    this.gizmo.addEventListener('mouseUp',()=>{if(this.before)this.poseDrag.last={root:this.root,pose:this.before};this.before=null;this.controls.enabled=true;});
    this.cancel=()=>{if(!this.before)return;const before=this.before;this.before=null;this.gizmo.reset();this.gizmo.pointerUp(null);applyPose(this.root,before);this.controls.enabled=true;this.onEdit({middle:this.selected.node});};
    this.key=e=>{if(e.key==='Escape'&&this.before){this.cancel();e.preventDefault();}};
    this.canvas=canvas;canvas.addEventListener('pointercancel',this.cancel);
    window.addEventListener('keydown',this.key);this.camera=camera;
  }
  rebuild(root){this.gizmo.detach();this.root=root;this.selected=null;this.parts=[];this.layer.replaceChildren();this.select.replaceChildren();if(!root)return;
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='选择身体部位';placeholder.disabled=true;placeholder.selected=true;this.select.append(placeholder);
    this.parts.push({name:'整个人偶',node:root,movable:true});
    // 白模GLB已核对的66骨骼命名；只加明确别名，不猜测其他外部骨架。
    const known=[['头','head','head'],['脖子','neck','neck_01'],['胸','spine003','spine_03'],['腰','spine001','spine_01'],['骨盆','hips','pelvis'],['左肩','shoulderL','clavicle_l'],['右肩','shoulderR','clavicle_r'],['左上臂','upper_armL','upperarm_l'],['右上臂','upper_armR','upperarm_r'],['左肘','forearmL','lowerarm_l'],['右肘','forearmR','lowerarm_r'],['左大腿','thighL','thigh_l'],['右大腿','thighR','thigh_r'],['左膝','shinL','calf_l'],['右膝','shinR','calf_r']];
    const bones=[];root.traverse(n=>{if(n.isBone)bones.push(n);});
    for(const [name,suffix,alias] of known){const matches=bones.filter(b=>b.name===alias||b.name.replace(/[._-]/g,'').toLowerCase()===`DEF${suffix}`.replace(/[._-]/g,'').toLowerCase());if(matches.length===1)this.parts.push({name,node:matches[0],movable:name==='骨盆'});}
    // 其他骨架同样可选全部关节旋转，不猜测未知命名的身体语义。
    for(const node of bones)if(!this.parts.some(p=>p.node===node))this.parts.push({name:node.name,node});
    if(!document.body.classList.contains('advanced-tools'))for(const option of document.getElementById('bone').options){const bone=this.getState().bones[Number(option.value)],part=this.parts.find(p=>p.node===bone);if(part){option.textContent=part.name==='root'?'根骨骼':part.name;option.title=bone.name;}}
    this.parts.forEach((part,i)=>{const o=document.createElement('option');o.value=i;o.textContent=part.name;this.select.append(o);
      if(i===0||!known.some(([name])=>name===part.name))return;
      const b=document.createElement('button');b.className='body-handle';part.drag=this.poseDrag.middleHandle(part.node,b,part.name);if(part.name==='骨盆')part.drag={button:b,node:part.node,kind:'translate',chain:{name:part.name,middle:part.node}};
      b.setAttribute('aria-label',`${part.drag?'拖动':'调整'}${part.name}`);b.title=part.drag?`拖动${part.name}${part.drag.kind==='pole'?'调整弯曲方向':''}`:`点击${part.name}旋转`;b.dataset.part=part.name;b.onclick=()=>this.choose(part);part.button=b;
      if(part.drag){b.classList.add('draggable');this.poseDrag.bind(b,part.drag);const down=b.onpointerdown;b.onpointerdown=e=>{if(e.button!==0)return;this.choose(part);down(e);};}this.layer.append(b);
    });
  }
  choose(part){if(!part||this.getState().busy)return;this.getState().playing=false;this.selected=part;this.select.value=this.parts.indexOf(part);if(part.drag)this.gizmo.detach();else this.gizmo.attach(part.node);this.setMode(part.movable?'translate':'rotate');this.onEdit({middle:part.node});}
  chooseBone(node){this.choose(this.parts.find(p=>p.node===node));}
  setMode(mode){if(!this.selected)return;if(mode==='translate'&&!this.selected.movable)return;this.gizmo.setMode(mode);this.gizmo.setSpace(mode==='translate'?'world':'local');this.refresh();}
  refresh(){const movable=!!this.selected?.movable;document.getElementById('body-translate').disabled=!movable;document.getElementById('body-rotate').disabled=!this.selected;for(const mode of ['translate','rotate'])document.getElementById(`body-${mode}`).classList.toggle('active',!!this.selected&&this.gizmo.mode===mode);for(const p of this.parts)p.button?.classList.toggle('active',p===this.selected);}
  update(){const s=this.getState();if(s.root!==this.root)this.rebuild(s.root);const visible=!!s.root&&!s.playing&&!s.busy&&document.getElementById('posePanel').open;this.layer.hidden=!visible;this.select.disabled=!visible;this.gizmo.enabled=visible;this.gizmo.getHelper().visible=visible&&!!this.selected&&!this.selected.drag;this.refresh();if(!visible)return;
    const box=this.stage.getBoundingClientRect();for(const p of this.parts){if(!p.button)continue;const v=p.node.getWorldPosition(new THREE.Vector3()).project(this.camera);p.button.hidden=Math.abs(v.x)>1||Math.abs(v.y)>1||Math.abs(v.z)>1;p.button.style.left=`${(v.x+1)*box.width/2}px`;p.button.style.top=`${(1-v.y)*box.height/2}px`;}
  }
  dispose(){this.cancel();window.removeEventListener('keydown',this.key);this.canvas.removeEventListener('pointercancel',this.cancel);this.gizmo.getHelper().removeFromParent();this.gizmo.dispose();this.layer.remove();}
}
