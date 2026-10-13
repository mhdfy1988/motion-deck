import {THREE,OrbitControls,loadFiles,disposeModel} from './three-adapter.js';
import {builtins} from './model-catalog.js';
import {FullBodyRig} from './fullbody-rig.js';
import {capturePose,applyPose,PoseSampler} from './sequence-core.js';
import {FreeView} from './free-view.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
const $=id=>document.getElementById(id),stage=$('stage'),canvas=$('canvas');
const scene=new THREE.Scene();scene.background=new THREE.Color('#111315');scene.add(new THREE.HemisphereLight(0xffffff,0x59677a,2));const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(4,6,4);scene.add(light);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
const camera=new THREE.PerspectiveCamera(40,1,.001,1000),orbit=new OrbitControls(camera,canvas);orbit.enableDamping=false;
const gizmo=new TransformControls(camera,canvas);gizmo.setMode('rotate');gizmo.setSpace('local');gizmo.setSize(.8);scene.add(gizmo.getHelper());
const target=new THREE.Object3D();scene.add(target);
let root,rig,grid,initial,selected='胸',mode='position',gesture=null,pending=null,busy=false,pins=new Map(),history=[];
const buttons=new Map(),ray=new THREE.Raycaster(),mouse=new THREE.Vector2();
const message=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);};
const clonePins=()=>new Map([...pins].map(([name,p])=>[name,{position:p.position?.clone()??null,rotation:p.rotation?.clone()??null}]));
function snapshot(){return {pose:capturePose(root),pins:clonePins()};}
function restore(s){applyPose(root,s.pose);pins=s.pins;pending=null;refresh();}
function fit(){if(!root)return;const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()).length();orbit.target.copy(center);const dir=$('view').value==='front'?new THREE.Vector3(0,.05,1):$('view').value==='side'?new THREE.Vector3(-1,.05,0):new THREE.Vector3(1,.35,1.8);camera.position.copy(center).addScaledVector(dir.normalize(),size*1.4);camera.near=Math.max(size/1000,.001);camera.far=size*100;camera.updateProjectionMatrix();orbit.update();}
function refresh(){
 if(!rig)return;$('part').value=selected;$('pinPosition').checked=!!pins.get(selected)?.position;$('pinRotation').checked=!!pins.get(selected)?.rotation;$('undo').disabled=!history.length;
 $('move').classList.toggle('active',mode==='position');$('rotate').classList.toggle('active',mode==='rotation');
 for(const [name,b] of buttons){b.classList.toggle('pinned',pins.has(name));b.classList.toggle('selected',name===selected);}
 if(!gesture){target.position.copy(rig.point(selected));target.quaternion.copy(rig.orientation(selected));if(mode==='rotation')gizmo.attach(target);else gizmo.detach();}
}
function choose(name){if(gesture||busy)return;selected=name;refresh();}
function start(){if(gesture||busy)return false;free.stop();gesture={before:snapshot()};rig.begin(selected,pins,mode);orbit.enabled=false;$('model').disabled=true;return true;}
function solve(p,q=null){try{const r=rig.move(p,q),pos=Math.max(...r.errors.map(e=>e.position))*100,angle=Math.max(...r.errors.map(e=>e.rotation))*180/Math.PI,state=r.limited?'已到本次调整边界':r.states.every(s=>s==='CONVERGED')?'已收敛':'未收敛',blend=r.participation?(r.participation.support>.01?`周边配合 ${Math.round(r.participation.support*100)}%`:r.participation.near>.01?`邻近配合 ${Math.round(r.participation.near*100)}%`:'局部调整'):r.scope;message(`${selected} · ${blend} · ${state} · 位置误差 ${pos.toFixed(2)}% 身高 · 朝向误差 ${angle.toFixed(1)}° · ${r.milliseconds.toFixed(1)} ms`,pos>1.5||angle>3);}catch(e){finish(true);message(e.message,true);}}
function finish(cancel=false){
 if(!gesture)return;if(pending&&!cancel){const p=pending;pending=null;solve(p);}if(!gesture)return;
 const before=gesture.before;gesture=null;pending=null;orbit.enabled=true;$('model').disabled=false;
 if(cancel){gizmo.reset();gizmo.pointerUp(null);restore(before);}else{history.push(before);if(history.length>30)history.shift();const pin=pins.get(selected);if(pin){if(pin.position)pin.position=rig.point(selected);if(pin.rotation)pin.rotation=rig.orientation(selected);}}
 refresh();
}
function pointer(e){const rect=canvas.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(mouse,camera);}
function bind(name,b){
 b.onpointerdown=e=>{if(e.button!==0||busy||gesture)return;e.preventDefault();e.stopPropagation();choose(name);if(mode==='rotation')return;if(!start())return;
  pointer(e);const point=rig.point(name),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),point),hit=ray.ray.intersectPlane(plane,new THREE.Vector3());if(!hit){finish(true);return;}gesture.plane=plane;gesture.offset=point.sub(hit);b.setPointerCapture(e.pointerId);
 };
 b.onpointermove=e=>{if(!gesture?.plane)return;pointer(e);const hit=ray.ray.intersectPlane(gesture.plane,new THREE.Vector3());if(hit)pending=hit.add(gesture.offset);};
 b.onpointerup=()=>finish();b.onpointercancel=()=>finish(true);b.onlostpointercapture=()=>finish();
}
gizmo.addEventListener('mouseDown',()=>start());gizmo.addEventListener('objectChange',()=>{if(gesture)solve(target.position,target.quaternion);});gizmo.addEventListener('mouseUp',()=>finish());
const free=new FreeView({canvas,stage,orbit,getCamera:()=>camera,getState:()=>({root,busy:busy||!!gesture,playing:false,size:rig?.size??1}),enabled:()=>true,onStatus:message});
async function load(){
 busy=true;document.body.classList.add('busy');gizmo.detach();free.stop();message('载入中');
 try{const def=builtins.find(b=>b.id===$('model').value),files=await Promise.all(def.files.map(async name=>{const res=await fetch(def.prefix+name);if(!res.ok)throw new Error(`模型载入失败：${res.status}`);return new File([await res.arrayBuffer()],name);})),model=await loadFiles(files);
  const sampler=new PoseSampler(model.root),clip=model.clips.find(c=>/^(Idle_Loop|Idle|Standing_Idle)$/i.test(c.name));if(clip)applyPose(model.root,sampler.sample(clip,0));sampler.dispose();const nextRig=new FullBodyRig(model.root);
  if(root){root.removeFromParent();disposeModel(root);}root=model.root;rig=nextRig;scene.add(root);initial=capturePose(root);history=[];pins=new Map(['左脚','右脚'].map(n=>[n,{position:rig.point(n),rotation:rig.orientation(n)}]));selected='胸';
  grid?.removeFromParent();grid?.geometry.dispose();grid?.material.dispose();grid=new THREE.GridHelper(rig.size*4,24,0x394653,0x232e38);scene.add(grid);
  $('part').replaceChildren();$('points').replaceChildren();buttons.clear();for(const name of rig.parts.keys()){const o=document.createElement('option');o.value=name;o.textContent=name;$('part').append(o);const b=document.createElement('button');b.className='point';b.dataset.name=name;b.setAttribute('aria-label',`联动${name}`);b.title=name;bind(name,b);buttons.set(name,b);$('points').append(b);}
  fit();refresh();message('双脚已保持位置与朝向 · 试试拖动胸或骨盆');
 }catch(e){message(e.message,true);}finally{busy=false;document.body.classList.remove('busy');}
}
$('model').onchange=load;$('part').onchange=()=>choose($('part').value);
for(const [id,value] of [['move','position'],['rotate','rotation']])$(id).onclick=()=>{if(gesture)return;mode=value;refresh();};
for(const [id,key] of [['pinPosition','position'],['pinRotation','rotation']])$(id).onchange=()=>{if(gesture){refresh();return;}const before=snapshot(),pin=pins.get(selected)??{position:null,rotation:null};pin[key]=$(id).checked?(key==='position'?rig.point(selected):rig.orientation(selected)):null;if(pin.position||pin.rotation)pins.set(selected,pin);else pins.delete(selected);history.push(before);refresh();};
$('undo').onclick=()=>{if(gesture||!history.length)return;restore(history.pop());message('已撤销');};$('reset').onclick=()=>{if(!root||gesture)return;history.push(snapshot());applyPose(root,initial);pins=new Map(['左脚','右脚'].map(n=>[n,{position:rig.point(n),rotation:rig.orientation(n)}]));refresh();message('已重置 · 双脚保持');};
$('fit').onclick=fit;$('view').onchange=fit;window.addEventListener('keydown',e=>{if(e.key==='Escape')finish(true);});window.addEventListener('blur',()=>finish(true));document.addEventListener('visibilitychange',()=>{if(document.hidden)finish(true);});
let last=performance.now();renderer.setAnimationLoop(()=>{const now=performance.now();free.update((now-last)/1000);last=now;if(pending){const p=pending;pending=null;solve(p);}const w=stage.clientWidth,h=stage.clientHeight;if(canvas.width!==Math.round(w*renderer.getPixelRatio())||canvas.height!==Math.round(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}if(!free.active)orbit.update();
 for(const [name,b] of buttons){const p=rig.point(name).project(camera);b.hidden=Math.abs(p.x)>1||Math.abs(p.y)>1||Math.abs(p.z)>1;b.style.left=`${(p.x+1)*w/2}px`;b.style.top=`${(1-p.y)*h/2}px`;}
 renderer.render(scene,camera);
});
load();
