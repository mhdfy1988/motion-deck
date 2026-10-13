import {FreeView} from './free-view.js';
import {mesh2motionAddonActions,mesh2motionAddonPoses,quaterniusRootMotionActions,verifiedBuiltinFile} from './builtin-expansion.js';
import {exportMotionAssets} from './motion-export.js';
import {createMotionExportUI} from './motion-export-ui.js';
import {createMotionPrompts} from './motion-prompts.js';
import {boundsSampleTimes,measureMotionBounds} from './motion-bounds.js';
import {viewPresets,viewPreset,framingDirections} from './view-presets.js';
import {fitView,resizeView} from './view-camera.js';
import {actionLabel,actionDisplayNames} from './action-labels.js';
import {ReferenceCapture,downloadReference} from './reference-capture.js';
import {mappedDefaultPoses,mappedDefaultActions} from './default-poses.js';
import {builtins,readCatalog} from './model-catalog.js';
import {importPoseClips} from './pose-import.js';
import {modelKey,readLibrary,saveLibrary,lastSavedModel,savedModel,removeLegacyTestModels,encodeAction,decodeAction,validatePoses} from './action-library.js';
import {THREE,OrbitControls,loadFiles,modelInfo,compatibleClips,assertSameRig,disposeModel} from './three-adapter.js';
import {capturePose,applyPose,PoseSampler,compileSequence,sampleSequence,actionRange,makeCompositeClip,clipKeyTimes} from './sequence-core.js';
import {icons} from '../../icons-data.js';
import {PoseDrag} from './pose-drag.js';
import {BodyControls} from './body-controls.js';
import {bindTimelineEdit} from './timeline-edit.js';
import {createTimelineHistory} from './timeline-history.js';
const $=id=>document.getElementById(id),stage=$('stage');
const prompts=createMotionPrompts();
// 简版保留唯一编排主线；高级验证控件仅在显式工具入口展示。
const advancedTools=new URLSearchParams(location.search).get('tools')==='1';
// 姿势编辑暂缓开放，保留实现供后续研究；不影响姿势提取、保存与编排。
const poseEditingEnabled=false;
document.body.classList.toggle('pose-editing-disabled',!poseEditingEnabled);
let displayedActionNames=new Map();
const displayAction=name=>advancedTools?name:displayedActionNames.get(name)??actionLabel(name);
const displaySpan=span=>span.kind==='action'&&!span.clip?.recipeItems&&span.name===span.clip?.name?displayAction(span.name):span.name;
document.body.classList.toggle('advanced-tools',advancedTools);
// 简版姿势操作属于视口，不混在播放器中；复用原按钮和保存入口。
if(!advancedTools){const toolbar=document.createElement('div');toolbar.id='viewportPoseTools';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','视口姿势工具');stage.append(toolbar);toolbar.append($('editPose'),$('capturePose'));const edits=document.createElement('div');edits.className='pose-edit-tools';toolbar.append(edits);edits.append($('undoDrag'),$('resetPose'));for(const [id,icon,label] of [['undoDrag','undo-2','撤销拖动'],['resetPose','rotate-ccw','初始姿势']]){$(id).innerHTML=icons[icon];$(id).setAttribute('aria-label',label);$(id).title=label;$(id).classList.add('icon-button');}const fine=document.createElement('button');fine.id='poseFineTune';fine.textContent='微调';fine.setAttribute('aria-expanded','false');fine.onclick=()=>{const open=document.body.classList.toggle('pose-details-open');fine.setAttribute('aria-expanded',String(open));const details=$('posePanel').querySelector('details');if(details)details.open=open;};edits.append(fine);}
// 微调沿用原角度字段，简版只呈现一个关节选择，不保留嵌套折叠层级。
document.querySelector('.player').insertBefore($('capturePose'),document.querySelector('.player label'));
if(!poseEditingEnabled&&$('viewportPoseTools'))$('viewportPoseTools').hidden=true;
// 编辑暂缓，单帧提取仍属于播放器；导入动作/姿势暂不开放。
$('animationFiles').closest('label').hidden=true;
$('appendClips').hidden=true;
const exportButton=document.createElement('button');exportButton.id='exportMotion';exportButton.textContent='导出';exportButton.disabled=true;document.querySelector('.section-head').append(exportButton);
if(!advancedTools){const panel=$('posePanel'),details=panel.querySelector('details'),fields=document.createElement('div');fields.className='precision-fields';fields.append(details.querySelector('label'),details.querySelector('.angles'));details.replaceWith(fields);const head=document.createElement('div');head.className='precision-head';const title=document.createElement('strong');title.textContent='微调';const close=document.createElement('button');close.id='closePoseFineTune';close.className='icon-button';close.innerHTML=icons.x;close.setAttribute('aria-label','关闭微调');close.title='关闭微调';close.onclick=()=>{document.body.classList.remove('pose-details-open');$('poseFineTune').setAttribute('aria-expanded','false');};head.append(title,close);panel.prepend(head);stage.append(document.querySelector('.settings'));$('bone').setAttribute('aria-label','关节');}
// 视角统一来自同一预设目录，界面分组不复制相机算法。
$('viewPreset').replaceChildren();for(const name of new Set(viewPresets.map(p=>p.group))){const group=document.createElement('optgroup');group.label=name;for(const preset of viewPresets.filter(p=>p.group===name)){const option=document.createElement('option');option.value=preset.id;option.textContent=preset.label;group.append(option);}$('viewPreset').append(group);}
$('welcomeImport').onclick=()=> $('modelFiles').click();
$('welcomeDemo').onclick=()=> $('humanDemo').click();

$('appendClips').onclick=()=> $(activeLibrary==='pose'?'poseFiles':'animationFiles').click();
// 编辑工具使用统一图标；完整中文名称和快捷键保留在提示及无障碍标签中。
for(const [id,icon,label,shortcut] of [['timelineUndo','undo-2','撤销','Ctrl+Z'],['timelineRedo','redo-2','重做','Ctrl+Y'],['timelineAll','check','全选','Ctrl+A'],['timelineNone','x','全不选',''],['timelineRemove','trash-2','删除选中','Delete']]){const button=$(id);if(id==='timelineAll'||id==='timelineNone')button.textContent=label;else{button.innerHTML=icons[icon];button.classList.add('icon-button');}button.setAttribute('aria-label',label);button.title=label+(shortcut?`（${shortcut}）`:'');}
function message(text,error=false){$('status').textContent=text;$('error').hidden=!error;$('error').textContent=error?text:'';}
function applyLibrarySearch(){
 $('librarySearchEmpty')?.remove();const query=$('librarySearch').value.trim().toLowerCase();$('librarySearch').placeholder=activeLibrary==='pose'?'搜索姿势':'搜索动作';
 for(const group of $('clips').querySelectorAll('.library-group')){
  if(query&&group.dataset.searchOpen===undefined)group.dataset.searchOpen=String(group.open);
  let matches=0;for(const row of group.querySelectorAll('[data-clip-index],[data-custom-id],[data-pose-id]')){row.hidden=!!query&&!(row.dataset.searchName??row.textContent).toLowerCase().includes(query);if(row.parentElement.classList.contains('library-entry'))row.parentElement.hidden=row.hidden;if(!row.hidden)matches++;}
  group.hidden=!!query&&!matches;
  if(query)group.open=!!matches;else if(group.dataset.searchOpen!==undefined){group.open=group.dataset.searchOpen==='true';delete group.dataset.searchOpen;}
 }
 if(query&&![...$('clips').querySelectorAll('.library-group')].some(group=>!group.hidden)){const empty=document.createElement('p');empty.id='librarySearchEmpty';empty.className='empty';empty.textContent='没有匹配的素材';$('clips').append(empty);}
}
$('librarySearch').oninput=applyLibrarySearch;
$('takePhoto').innerHTML=icons.camera;$('takePhoto').classList.add('icon-button');$('takePhoto').setAttribute('aria-label','拍照');
let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});}catch{message('WebGL 初始化失败，请启用硬件加速',true);throw new Error('WebGL unavailable');}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));stage.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(advancedTools?'#13171c':'#121416');let camera=new THREE.PerspectiveCamera(38,1,.01,1000);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
scene.add(new THREE.HemisphereLight(0xdbefff,0x424850,2.2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(4,7,5);scene.add(light);const grid=new THREE.GridHelper(12,24,advancedTools?0x435364:0x39404a,advancedTools?0x252e37:0x23282f);scene.add(grid);
const state={root:null,rig:null,sampler:null,helper:null,clips:[],bones:[],poses:[],items:[],selected:-1,sequence:null,mode:'source',time:0,sourceTime:0,playing:false,busy:false,size:2,center:new THREE.Vector3()};
const motionExportUI=createMotionExportUI({getModel:()=>state.model.name,getEntries:()=>[
 ...state.clips.map((clip,index)=>({id:'source:'+index,kind:'action',name:displayAction(clip.name),duration:clip.duration,items:[{kind:'action',name:clip.name,clip,transition:0}]})),
 ...state.customs.map(action=>{const items=customItems(action);return {id:'custom:'+action.id,kind:'action',name:action.name,duration:compileSequence(items,state.sampler).duration,items};}),
 ...state.poses.map(pose=>({id:'pose:'+pose.id,kind:'pose',name:pose.name,pose:pose.pose}))
],onError:error=>message('导出失败：'+error.message,true),runExport:async(entries,signal)=>{
 if(state.busy||!state.root)throw new Error('当前模型不可导出');const playing=state.playing;state.playing=false;state.busy=true;freeView.stop();updateButtons();
 try{const result=await exportMotionAssets({root:state.root,base:state.sampler.base,entries,modelName:state.model.name,copyright:builtins.find(model=>model.id===state.model.builtinId)?.source??'',signal,onProgress:message});if(signal.aborted)throw new DOMException('已取消导出','AbortError');downloadReference(result.blob,result.name);message('素材已导出 · '+(result.name.endsWith('.zip')?'ZIP':'GLB'));}
 catch(error){if(error.name==='AbortError')message('已取消导出');throw error;}
 finally{state.busy=false;state.playing=playing;updateButtons();}
}});
exportButton.onclick=()=>{if(!state.busy&&state.root)motionExportUI.open();};
let referenceRecording=false,referenceCapture=null;
// 独立输出画布保持尺寸与视角；场景辅助物只在同步拍摄瞬间隐藏，随后原样恢复。
function createReferenceCapture(){
 const aspect=camera.aspect,width=aspect>=1920/1080?1920:Math.max(2,Math.round(1080*aspect/2)*2),height=aspect>=1920/1080?Math.max(2,Math.round(1920/aspect/2)*2):1080;
 // 直接在目标像素尺寸绘制3D，不从受窗口尺寸限制的预览画布缩放拷贝。
 const captureRenderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'}),view=camera.clone();
 const output=document.createElement('canvas');output.width=width;output.height=height;const ctx=output.getContext('2d',{alpha:false,colorSpace:'srgb'});
 captureRenderer.setPixelRatio(1);captureRenderer.setSize(width,height,false);captureRenderer.outputColorSpace=renderer.outputColorSpace;captureRenderer.toneMapping=renderer.toneMapping;captureRenderer.toneMappingExposure=renderer.toneMappingExposure;resizeView(view,width/height);
 return new ReferenceCapture({canvas:output,onStatus:text=>{message(text);const elapsed=/^录像 ([\d.]+) 秒/.exec(text);if(elapsed){$('recordingIndicator').hidden=false;$('recordingIndicator').textContent=elapsed[1]+' s';}},release:()=>{captureRenderer.dispose();captureRenderer.forceContextLoss();},draw:()=>{
  const saved=scene.children.map(node=>[node,node.visible]);try{for(const [node] of saved)if(node!==state.root&&!node.isLight)node.visible=false;captureRenderer.render(scene,view);ctx.drawImage(captureRenderer.domElement,0,0);}finally{for(const [node,visible] of saved)node.visible=visible;}
 }});
}
function referenceName(){const name=(state.mode==='sequence'?$('actionTitle').textContent:$('currentClip').textContent).replace(/[\\/:*?"<>|]/g,'_').slice(0,60)||'动作参考';return name+(!advancedTools&&$('viewPreset').value!=='perspective'?' - '+viewPreset($('viewPreset').value).label:'');}
$('takePhoto').onclick=async()=>{if(state.busy||!state.root)return;freeView.stop();state.busy=true;updateButtons();let capture;try{capture=createReferenceCapture();downloadReference(await capture.photo(),referenceName()+'.png');message('参考图片已下载 · PNG');}catch(error){message('拍照失败：'+error.message,true);}finally{capture?.dispose();state.busy=false;updateButtons();}};
$('recordVideo').onclick=async()=>{
 if(referenceRecording){$('recordVideo').disabled=true;referenceCapture.stop();return;}if(state.busy||!state.root)return;
 freeView.stop();let plan;const speed=Number($('speed').value),name=referenceName(),before=capturePose(state.root),playing=state.playing;
 if(state.mode==='sequence'||state.mode==='pose'&&state.items.length){plan={duration:state.sequence.duration,sample:time=>applyPose(state.root,sampleSequence(state.sequence,time,state.sampler).pose)};}
 else if(state.mode==='custom'){plan={duration:state.customPreview.sequence.duration,sample:time=>applyPose(state.root,sampleSequence(state.customPreview.sequence,time,state.sampler).pose)};}
 else if(state.mode==='source'){const clip=state.clips[Number($('source').value)];if(clip)plan={duration:clip.duration,sample:time=>applyPose(state.root,state.sampler.sample(clip,time))};}
 if(!plan){message('当前是静态姿势，请拍照或先编排动作',true);return;}
 const areas=[...document.querySelectorAll('.top,.library,.settings,.player,.timeline,#stage,#previewSeek')],inert=areas.map(el=>el.inert),enabled=controls.enabled;
 state.busy=true;state.playing=false;referenceRecording=true;controls.enabled=false;areas.forEach(el=>el.inert=true);updateButtons();
 try{referenceCapture=createReferenceCapture();const result=await referenceCapture.record({...plan,speed});downloadReference(result.blob,name+'.'+result.extension);message('参考视频已下载 · '+result.extension.toUpperCase());}
 catch(error){message('录像失败：'+error.message,true);}
 finally{referenceCapture?.dispose();referenceCapture=null;referenceRecording=false;applyPose(state.root,before);state.busy=false;state.playing=playing;controls.enabled=enabled;areas.forEach((el,i)=>el.inert=inert[i]);$('recordingIndicator').hidden=true;$('recordingIndicator').textContent='';updateButtons();}
};
state.selection=new Set();
const history=createTimelineHistory(()=>({items:state.items.map(item=>({...item})),selection:[...state.selection],selected:state.selected,transition:state.selectedTransition,time:state.time,actionId:state.editingActionId,title:$('actionTitle').textContent}),saved=>{state.items=saved.items.map(item=>({...item}));state.selection=new Set(saved.selection);state.selected=saved.selected;state.selectedTransition=saved.transition;state.time=saved.time;state.editingActionId=saved.actionId;$('actionTitle').textContent=saved.title;state.playing=false;rebuild();if(state.items.length)showSequence(state.time);else showSource(0);},()=>{$('timelineUndo').disabled=!history.canUndo;$('timelineRedo').disabled=!history.canRedo;});
function selectionUI(){const valid=new Set(state.sequence?.spans.map(s=>s.kind==='transition'?`transition:${s.targetId}`:s.id));state.selection=new Set([...state.selection].filter(key=>valid.has(key)));$('segments').querySelectorAll('button').forEach(b=>{b.classList.toggle('selected',state.selection.has(b.dataset.key));b.setAttribute('aria-pressed',String(state.selection.has(b.dataset.key)));});$('selectionCount').textContent=`已选 ${state.selection.size}`;$('timelineRemove').disabled=!state.selection.size;}
function selectSegment(button,event={},preserve=false){if(state.busy)return;const key=button.dataset.key,keys=[...$('segments').children].map(b=>b.dataset.key);if(event.shiftKey&&state.anchor&&keys.includes(state.anchor)){const a=keys.indexOf(state.anchor),b=keys.indexOf(key);if(!event.ctrlKey&&!event.metaKey)state.selection.clear();keys.slice(Math.min(a,b),Math.max(a,b)+1).forEach(k=>state.selection.add(k));}else if(event.ctrlKey||event.metaKey){if(state.selection.has(key))state.selection.delete(key);else state.selection.add(key);state.anchor=key;}else{if(!preserve||!state.selection.has(key))state.selection=new Set([key]);state.anchor=key;}const active=state.selection.has(key)?key:[...state.selection].at(-1),transition=!!active?.startsWith('transition:');state.selected=state.items.findIndex(i=>i.id===(transition?active.slice(11):active));state.selectedTransition=transition;state.playing=false;showSequence(Number(button.dataset.start));selectionUI();selectedControls();updateButtons();button.focus();}
const quickActions=[['Idle_Loop','站立待机'],['Sword_Idle','持剑待机'],['Sword_Attack','挥剑'],['Sword_Idle','持剑待机'],['Idle_Loop','站立待机']];
const poseDrag=new PoseDrag({stage,camera,controls,getState:()=>state,onStatus:message,onEdit:chain=>{state.playing=false;state.mode='pose';if(chain)$('bone').value=state.bones.indexOf(chain.middle);boneValues();$('currentClip').textContent='自定义姿势';updateButtons();}});
const bodyControls=new BodyControls({scene,camera,canvas:renderer.domElement,stage,controls,getState:()=>state,poseDrag,onEdit:chain=>{state.playing=false;state.mode='pose';const index=state.bones.indexOf(chain.middle);if(index>=0)$('bone').value=index;boneValues();$('currentClip').textContent='自定义姿势';updateButtons();}});
const freeView=new FreeView({canvas:renderer.domElement,stage,orbit:controls,getCamera:()=>camera,getState:()=>state,enabled:()=>$('posePanel').open,onStatus:message});
$('undoDrag').onclick=()=>poseDrag.undo();
$('editPose').onclick=()=>{if(!poseEditingEnabled||state.busy||!state.root)return;$('posePanel').open=!$('posePanel').open;};
$('posePanel').addEventListener('toggle',()=>{const editing=$('posePanel').open;document.body.classList.toggle('pose-editing',editing);if(!editing){freeView.stop();document.body.classList.remove('pose-details-open');$('poseFineTune')?.setAttribute('aria-expanded','false');}$('editPose').textContent=editing?'退出编辑':'编辑姿势';$('sourcePanel').hidden=editing;$('posePanel').querySelector('.mode-label').textContent=editing?'退出编辑':'进入编辑';if(editing)state.playing=false;updateButtons();});
$('resetPose').onclick=()=>{if(!state.root||state.busy)return;state.playing=false;state.mode='pose';applyPose(state.root,state.sampler.base);boneValues();updateButtons();message('已恢复初始姿势');};
function updateButtons(){document.body.classList.toggle('has-segments',!!state.items.length);const context=state.mode==='sequence'?'当前编排':state.mode==='custom'?'自定义动作':state.mode==='pose'?'姿势':'源动作';$('previewContext').textContent=context;$('recordVideo').classList.add('icon-button');$('recordVideo').classList.toggle('recording',referenceRecording);$('recordVideo').innerHTML=icons[referenceRecording?'square':'video'];$('recordVideo').setAttribute('aria-label',referenceRecording?'停止录像':'录像');$('recordVideo').title=referenceRecording?'停止录像':'录像 · 从头录制'+(state.mode==='pose'&&state.items.length?'当前编排':context);$('editPose').disabled=!state.root||state.busy;$('green').disabled=state.busy;$('takePhoto').disabled=!state.root||state.busy;$('recordVideo').disabled=!state.root||(state.busy&&!referenceRecording);const ready=!!state.root&&!state.busy,animated=ready&&state.clips.length>0;document.body.classList.toggle('has-model',!!state.root);$('welcomeImport').disabled=state.busy;$('welcomeDemo').disabled=state.busy;$('replaceModel').disabled=state.busy;$('renameModel').disabled=!ready;$('appendClips').disabled=!ready;$('newAction').disabled=!ready||!state.items.length;$('saveAction').disabled=!ready||!state.items.length;$('capturePose').disabled=!ready;for(const id of ['modelFiles','demo','humanDemo'])$(id).disabled=state.busy;for(const id of ['animationFiles','fit','side','viewPreset','savePose'])$(id).disabled=!ready;for(const id of ['source','sourceTime','sourceSeek','trimIn','trimOut','markIn','markOut'])$(id).disabled=!animated;sourceCardUI();transitionControls();$('quickSequence').disabled=!ready||!quickActions.every(([name])=>state.clips.some(c=>c.name===name));for(const id of ['bone','rx','ry','rz'])$(id).disabled=!ready||!state.bones.length;$('skeleton').disabled=!ready||!state.bones.length;$('addPose').disabled=!ready||!state.poses.length;$('seek').disabled=!state.items.length;$('play').disabled=!ready||(state.mode==='source'&&!animated);$('restart').disabled=!ready;$('play').innerHTML=icons[state.playing?'pause':'play'];$('restart').innerHTML=icons['rotate-ccw'];editToolsUI();}
function frame(side=false){if(!state.root)return;freeView.stop();if(!advancedTools){const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;const aspect=stage.clientWidth/Math.max(stage.clientHeight,1),preset=viewPreset($('viewPreset').value);const next=preset.id==='perspective'?new THREE.PerspectiveCamera(38,aspect,.01,1000):new THREE.OrthographicCamera(-1,1,1,-1,.01,1000);camera=next;controls.object=camera;controls.enableRotate=preset.id==='perspective';poseDrag.camera=camera;bodyControls.camera=camera;bodyControls.gizmo.camera=camera;controls.target.copy(fitView(camera,state.viewBounds??state.bounds,new THREE.Vector3(...preset.direction),aspect,framingDirections(preset).map(d=>new THREE.Vector3(...d))));controls.update();return;}const d=state.size*1.5;camera.near=Math.max(state.size/1000,.001);camera.far=state.size*100;camera.position.copy(state.center).add(new THREE.Vector3(side?d:d*.75,side?0:d*.25,side?0:d));camera.updateProjectionMatrix();controls.target.copy(state.center);controls.update();}
function currentFramingPlan(){
 if(state.mode==='pose')return {times:[0],sample:()=>capturePose(state.root)};
 if(state.mode==='source'){const clip=state.clips[Number($('source').value)];if(!clip)return {times:[0],sample:()=>capturePose(state.root)};const keys=clip.tracks.flatMap(track=>Array.from(track.times));return {times:boundsSampleTimes(clip.duration,keys),sample:t=>state.sampler.sample(clip,t)};}
 const sequence=state.mode==='custom'?state.customPreview.sequence:state.sequence,keys=[];if(!sequence?.spans.length)return {times:[0],sample:()=>capturePose(state.root)};
 for(const span of sequence.spans){keys.push(span.start,span.start+span.duration);if(span.kind==='action')for(const time of clipKeyTimes(span.clip))if(time>=span.in&&time<=span.out)keys.push(span.start+(time-span.in)/(span.out-span.in)*span.duration);}
 return {times:boundsSampleTimes(sequence.duration,keys),poses:sequence.spans.flatMap(span=>[span.startPose??span.a,span.endPose??span.b]),sample:t=>sampleSequence(sequence,t,state.sampler).pose};
}
async function fitCurrentMotion(){
 if(!state.root||state.busy)return;if(advancedTools){frame();return;}
 const playing=state.playing;state.busy=true;state.playing=false;updateButtons();message('正在计算动作取景');
 try{const plan=currentFramingPlan();await new Promise(resolve=>requestAnimationFrame(resolve));state.viewBounds=measureMotionBounds(state.root,plan);frame();message('取景已适配 · 镜头保持固定');}
 catch(error){message('取景失败：'+error.message,true);}
 finally{state.busy=false;state.playing=playing;updateButtons();}
}
function options(element,values){element.replaceChildren();values.forEach((name,i)=>{const o=document.createElement('option');o.value=i;o.textContent=name;element.append(o);});}
// 显示三位小数，未经编辑时保留原始精度，避免把完整动作的末帧裁掉。
function writeTime(id,value){const el=$(id);el.value=Number(value.toFixed(3));el.dataset.exact=String(value);el.dataset.display=el.value;}
function readTime(id){const el=$(id);return el.value===el.dataset.display?Number(el.dataset.exact):el.valueAsNumber;}
function boneValues(){const bone=state.bones[Number($('bone').value)];if(!bone)return;const e=new THREE.Euler().setFromQuaternion(bone.quaternion,'XYZ');['rx','ry','rz'].forEach((id,i)=>$(id).value=THREE.MathUtils.radToDeg([e.x,e.y,e.z][i]).toFixed(1));}
function showSource(time=0,playing=false){if(!state.sampler)return;$('clips').querySelectorAll('button').forEach(b=>b.classList.toggle('active',Number(b.dataset.clipIndex)===Number($('source').value)));state.mode='source';state.playing=playing;const clip=state.clips[Number($('source').value)];state.sourceTime=clip?Math.max(0,Math.min(time,clip.duration)):0;if(clip)applyPose(state.root,state.sampler.sample(clip,state.sourceTime));$('sourceTime').value=state.sourceTime.toFixed(2);$('sourceTime').max=clip?.duration||0;$('currentClip').textContent=clip?displayAction(clip.name):'静态姿势';$('currentClip').title=clip?.name??'';boneValues();updateButtons();}
// 分类只负责素材展示，保留统一动作索引及编排引用。

let activeLibrary='default';
state.customs=[];state.editingActionId=null;state.modelKey=null;state.modelFiles=[];
function filterLibrary(){
 const visible=state.root&&capturePose(state.root),rows=[...$('clips').querySelectorAll('button[data-clip-index]')];$('clips').replaceChildren();
 const isPose=activeLibrary==='pose';$('library-actions').setAttribute('aria-selected',String(!isPose));$('library-pose').setAttribute('aria-selected',String(isPose));$('appendClips').textContent=isPose?'导入姿势':'导入动作';$('appendClips').title=isPose?'导入同骨架的单帧或固定姿势动画':'导入与当前模型同骨架的源动作';
 if(isPose){
  for(const [kind,label] of [['default','默认姿势库'],['custom','自定义姿势库']]){
  const group=document.createElement('details'),head=document.createElement('summary'),body=document.createElement('div');group.className='library-group';group.open=kind===(state.poses.some(p=>!isDefaultPose(p))?'custom':'default');head.textContent=label;head.id='pose-library-'+kind;body.className='library-group-body';group.append(head,body);$('clips').append(group);
  for(const pose of state.poses.filter(p=>isDefaultPose(p)===(kind==='default'))){const row=document.createElement('button'),name=document.createElement('span'),label=document.createElement('small');row.dataset.poseId=pose.id;name.textContent=pose.name;label.textContent='姿势';row.append(name,label);row.title=isDefaultPose(pose)?'默认姿势 · 不可删除':'单击查看 · 拖入时间轴';row.onclick=()=>previewPose(pose);row.ondblclick=()=>{previewPose(pose);$('posePanel').open=true;};body.append(isDefaultPose(pose)?row:deletableLibraryRow(row,pose.name));}
  const count=body.children.length,badge=document.createElement('small');badge.textContent=count;head.append(badge);if(!count){const empty=document.createElement('p');empty.className='empty';empty.textContent=kind==='custom'?'暂无自定义姿势':'此模型暂无默认姿势';body.append(empty);}
  }
  if(!state.poses.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='导入姿势，或从预览中保存';$('clips').append(empty);}
 }else{
  for(const [key,label] of [['default','默认动作库'],['thirdparty','第三方动作库'],['custom','自定义动作库']]){
   const group=document.createElement('details'),head=document.createElement('summary'),body=document.createElement('div');group.className='library-group';group.open=activeLibrary===key;head.id='library-'+key;head.textContent=label;body.className='library-group-body';
   head.onclick=event=>{event.preventDefault();activeLibrary=activeLibrary===key?'actions':key;filterLibrary();};group.append(head,body);$('clips').append(group);
   if(key==='custom')for(const action of state.customs){const row=document.createElement('button'),name=document.createElement('span'),duration=document.createElement('small');row.dataset.customId=action.id;name.textContent=action.name;duration.textContent=compileSequence(decodeAction(action,state.root),state.sampler).duration.toFixed(2)+' s';row.append(name,duration);row.title='单击查看 · 拖入使用';row.onclick=()=>previewCustom(action);body.append(deletableLibraryRow(row,action.name));}
   else for(const row of rows){const external=!!state.clips[Number(row.dataset.clipIndex)].thirdParty;if(external===(key==='thirdparty')){row.hidden=false;body.append(row);}}
   const count=body.children.length,badge=document.createElement('small');badge.textContent=count;head.append(badge);if(!count){const empty=document.createElement('p');empty.className='empty';empty.textContent=key==='custom'?'暂无自定义动作':key==='thirdparty'?'暂无第三方动作':'此模型暂无默认动作';body.append(empty);}
  }
 }
 // 切换姿势Tab时保留源按钮及统一索引，回到动作Tab再分组展示。
 if(isPose)for(const row of rows){row.hidden=true;$('clips').append(row);}
 if(!poseEditingEnabled)$('clips').querySelectorAll('[data-pose-id]').forEach(row=>{row.ondblclick=null;});
 $('clipCount').textContent=isPose?state.poses.length:state.clips.length+state.customs.length;if(visible)applyPose(state.root,visible);applyLibrarySearch();
}
$('library-actions').onclick=()=>{activeLibrary='default';filterLibrary();};$('library-pose').onclick=()=>{activeLibrary='pose';filterLibrary();};
function libraryData(actions=state.customs,poses=state.poses,thirdParty=state.clips.filter(c=>c.thirdParty)){return {version:actions.some(a=>a.clips.some(c=>c.recipe))?2:1,modelKey:state.modelKey,model:state.model,testPoseCleanup:1,actions,poses,thirdParty:thirdParty.map(c=>encodeAction([{kind:'action',name:c.name,clip:c,transition:0}],c.libraryId,c.name,state.root))};}
function renderClips(){displayedActionNames=actionDisplayNames(state.clips.map(clip=>clip.name));options($('source'),state.clips.map(c=>displayAction(c.name)));const idle=state.clips.findIndex(c=>c.name==='Idle_Loop');if(idle>=0)$('source').value=idle;resetRange();$('clips').replaceChildren();state.clips.forEach((clip,i)=>{const button=document.createElement('button'),name=document.createElement('span'),duration=document.createElement('small');name.textContent=displayAction(clip.name);button.dataset.clipName=clip.name;button.dataset.searchName=clip.name+' '+displayAction(clip.name);duration.textContent=`${clip.duration.toFixed(2)} s`;button.dataset.clipIndex=i;button.title=clip.name+' · 单击预览，拖到时间轴放置';button.append(name,duration);button.onclick=()=>{$('source').value=i;resetRange();showSource(0,true);};$('clips').append(button);});filterLibrary();$('animations').textContent=state.clips.length;updateButtons();}
// 姿势是当前模型的完整节点快照；拖入时间轴时独立复制，不带素材身份字段。
function previewPose(pose){if(state.busy)return;state.playing=false;state.mode='pose';applyPose(state.root,pose.pose);$('currentClip').textContent=pose.name;boneValues();$('clips').querySelectorAll('button').forEach(row=>row.classList.toggle('active',row.dataset.poseId===pose.id));updateButtons();}
function isDefaultPose(pose){return pose.id.startsWith('builtin:');}
async function deleteLibraryEntry(button){
 if(state.busy)return;
 const pose=state.poses.find(entry=>entry.id===button.dataset.poseId),action=state.customs.find(entry=>entry.id===button.dataset.customId);
 if(!pose&&!action||pose&&isDefaultPose(pose)){message('默认素材不可删除');return;}
 const entry=pose??action;if(!await prompts.ask('删除“'+entry.name+'”？已放入时间轴的片段保留，素材删除不能撤销。','删除','删除素材'))return;
 state.busy=true;updateButtons();
 try{
  const poses=pose?state.poses.filter(p=>p.id!==pose.id):state.poses,actions=action?state.customs.filter(a=>a.id!==action.id):state.customs;
  await saveLibrary(libraryData(actions,poses),state.modelFiles);
  state.poses=poses;state.customs=actions;options($('poses'),poses.map(p=>p.name));
  if(action&&state.editingActionId===action.id){state.editingActionId=null;$('actionTitle').textContent='未命名动作';}
  if(action&&state.mode==='custom'&&state.customPreview?.id===action.id){state.customPreview=null;showSource(0,false);}
  filterLibrary();message('已删除“'+entry.name+'”');
 }catch(error){message('删除失败：'+error.message,true);}finally{state.busy=false;updateButtons();}
}
// 删除按钮与素材按钮并列，避免嵌套按钮，也不会触发素材查看或拖放。
function deletableLibraryRow(row,name){const entry=document.createElement('div'),remove=document.createElement('button');entry.className='library-entry';remove.className='library-delete';remove.innerHTML=icons['trash-2'];remove.title='删除';remove.setAttribute('aria-label','删除'+name);remove.onclick=event=>{event.stopPropagation();deleteLibraryEntry(row);};remove.onkeydown=event=>{if(event.key==='Delete'){event.preventDefault();event.stopPropagation();deleteLibraryEntry(row);}};entry.append(row,remove);return entry;}
$('clips').addEventListener('contextmenu',event=>event.preventDefault());
$('clips').addEventListener('keydown',event=>{if(event.key!=='Delete')return;const row=event.target.closest('button');if(!row)return;event.preventDefault();event.stopPropagation();deleteLibraryEntry(row);});
let pendingPose=null;
$('capturePose').onclick=()=>{if(!state.root||state.busy)return;state.playing=false;pendingPose=capturePose(state.root);$('poseName').value='';$('savePoseDialog').showModal();$('poseName').focus();updateButtons();};
for(const id of ['closePoseDialog','cancelPoseSave'])$(id).onclick=()=>$('savePoseDialog').close();
$('savePoseDialog').addEventListener('close',()=>{pendingPose=null;});
async function savePoseEntry(name,pose){
 if(state.busy||!state.root)return false;
 const duplicate=state.poses.find(p=>!isDefaultPose(p)&&p.name===name);if(duplicate&&!await prompts.ask('已有同名姿势，是否覆盖？','覆盖','覆盖姿势'))return false;
 const poses=state.poses.filter(p=>p.id!==duplicate?.id);poses.push({id:duplicate?.id??crypto.randomUUID(),name,pose:structuredClone(pose)});
 state.busy=true;updateButtons();
 try{await saveLibrary(libraryData(state.customs,poses),state.modelFiles);state.poses=poses;options($('poses'),poses.map(p=>p.name));$('poses').value=poses.length-1;activeLibrary='pose';filterLibrary();message('姿势已保存到当前模型的自定义姿势库');return true;}
 catch(error){message('姿势保存失败：'+error.message,true);return false;}
 finally{state.busy=false;updateButtons();}
}
$('savePoseForm').onsubmit=async event=>{event.preventDefault();const name=$('poseName').value.trim();if(!name){$('poseName').setCustomValidity('请输入姿势名称');$('poseName').reportValidity();return;}if(!pendingPose||state.busy)return;$('confirmPoseSave').disabled=true;try{if(await savePoseEntry(name,pendingPose))$('savePoseDialog').close();}finally{$('confirmPoseSave').disabled=false;}};
$('poseName').oninput=()=>$('poseName').setCustomValidity('');
function syncPreviewSeek(){const duration=state.mode==='source'?state.clips[Number($('source').value)]?.duration??0:state.mode==='custom'?state.customPreview?.sequence.duration??0:state.mode==='sequence'?state.sequence?.duration??0:0;const el=$('previewSeek');el.max=duration;el.disabled=state.busy||!duration;el.value=state.mode==='source'?state.sourceTime:state.mode==='custom'?state.customTime:state.time;}
$('previewSeek').oninput=()=>{if(state.busy)return;state.playing=false;const time=$('previewSeek').valueAsNumber;if(state.mode==='source')showSource(time);else if(state.mode==='custom')showCustom(time);else if(state.mode==='sequence')showSequence(time);updateButtons();};
function customItems(action){return decodeAction(action,state.root);}
function previewCustom(action){
 state.playing=false;state.customPreview={id:action.id,name:action.name,sequence:compileSequence(customItems(action),state.sampler)};state.mode='custom';state.customTime=0;
 $('clips').querySelectorAll('button').forEach(row=>row.classList.toggle('active',row.dataset.customId===action.id));showCustom(0);updateButtons();
}
function showCustom(time){const preview=state.customPreview;if(!preview)return;state.customTime=Math.min(time,preview.sequence.duration);const result=sampleSequence(preview.sequence,state.customTime,state.sampler);if(result)applyPose(state.root,result.pose);$('currentClip').textContent=preview.name;}
function insertRecipe(items,name,targetKey,after=false){
 if(state.busy)return;const target=targetKey?state.items.findIndex(i=>i.id===targetKey):state.items.length;if(target<0){message('放置目标已变化',true);return;}
 const clip=makeCompositeClip(items,name);history.run(()=>{const empty=!state.items.length,added={id:crypto.randomUUID(),kind:'action',name,clip,transition:0};state.items.splice(target+(targetKey&&after?1:0),0,added);if(empty){state.editingActionId=null;$('actionTitle').textContent=name;}state.selection=new Set([added.id]);state.selected=state.items.indexOf(added);state.selectedTransition=false;state.playing=false;rebuild();showSequence(state.sequence.spans.find(s=>s.id===added.id).start);});message('已加入自定义动作');
}
async function resetAction(){if(state.items.length&&!await prompts.ask('清空当前编排？已保存的动作不会删除，此操作可撤销。','清空','清空编排'))return;history.run(()=>{state.items=[];state.selection.clear();state.selected=-1;state.selectedTransition=false;state.playing=false;state.editingActionId=null;$('actionTitle').textContent='未命名动作';rebuild();showSource(0);});}
$('newAction').onclick=resetAction;
$('saveAction').onclick=()=>{state.playing=false;updateButtons();$('actionName').value=state.customs.find(a=>a.id===state.editingActionId)?.name??($('actionTitle').textContent==='未命名动作'?'':$('actionTitle').textContent);$('saveActionDialog').showModal();$('actionName').focus();};
for(const id of ['cancelSave','closeSaveDialog'])$(id).onclick=()=>$('saveActionDialog').close();
$('saveActionForm').onsubmit=async event=>{
 event.preventDefault();const name=$('actionName').value.trim();if(!name){$('actionName').setCustomValidity('请输入动作名称');$('actionName').reportValidity();return;}
 if(state.busy||!state.items.length)return;const duplicate=state.customs.find(a=>a.name===name);if(duplicate&&duplicate.id!==state.editingActionId&&!await prompts.ask('已有同名动作，是否覆盖？','覆盖','覆盖动作'))return;
 const id=duplicate?.id??(state.customs.find(a=>a.id===state.editingActionId)?.name===name?state.editingActionId:crypto.randomUUID());
 state.busy=true;$('confirmSave').disabled=true;updateButtons();
 try{const action=encodeAction(state.items,id,name,state.root),actions=state.customs.filter(a=>a.id!==id);actions.push(action);await saveLibrary(libraryData(actions),state.modelFiles);state.customs=actions;state.editingActionId=id;$('actionTitle').textContent=name;activeLibrary='custom';filterLibrary();$('saveActionDialog').close();message('动作已保存到当前模型的自定义库');}catch(error){message('保存失败：'+error.message,true);}finally{state.busy=false;$('confirmSave').disabled=false;updateButtons();}
};
$('actionName').oninput=()=>$('actionName').setCustomValidity('');
// 启动只恢复模型与素材库，不把保存动作展开为当前编排。
async function restoreLastSaved(){state.busy=true;updateButtons();try{await removeLegacyTestModels();await refreshModelMenu();const record=await lastSavedModel();if(!record)return;state.busy=false;await importModel(record.files);if(state.modelKey===record.data.modelKey&&state.customs.length){activeLibrary='custom';filterLibrary();message('已恢复模型和素材库');}else if(state.modelKey===record.data.modelKey&&state.poses.length){activeLibrary='pose';filterLibrary();previewPose(state.poses.at(-1));message('已恢复上次保存的姿势库');}}catch(error){message('恢复失败：'+error.message,true);}finally{state.busy=false;updateButtons();}}
function editPoint(){
 if(state.busy||state.mode!=='sequence'||state.selection.size!==1)return null;
 const id=[...state.selection][0],item=state.items.find(i=>i.id===id),span=state.sequence?.spans.find(s=>s.id===id);
 if(!item||item.kind!=='action'||!span)return null;const local=state.time-span.start;if(local<.05||local>span.duration-.05)return null;
 return {item,span,local,cut:span.in+local/span.duration*(span.out-span.in)};
}
function editToolsUI(){exportButton.disabled=!state.root||state.busy;for(const id of ['splitAction','trimLeft','trimRight'])$(id).disabled=!editPoint();}
function cutAction(mode){const point=editPoint();if(!point)return;const {item,span,local,cut}=point;
 history.run(()=>{state.playing=false;if(mode==='split'){const tail={...item,id:crypto.randomUUID(),in:cut,out:span.out,duration:span.duration-local,transition:0};item.in=span.in;item.out=cut;item.duration=local;state.items.splice(state.items.indexOf(item)+1,0,tail);state.selection=new Set([tail.id]);state.selected=state.items.indexOf(tail);}else if(mode==='left'){item.in=cut;item.out=span.out;item.duration=span.duration-local;}else{item.in=span.in;item.out=cut;item.duration=local;}rebuild();showSequence(Math.min(state.time,state.sequence.duration));});
}
for(const [id,icon,mode] of [['splitAction','scissors','split'],['trimLeft','panel-left-close','left'],['trimRight','panel-right-close','right']]){$(id).innerHTML=icons[icon];$(id).classList.add('icon-button');$(id).onclick=()=>cutAction(mode);}
function selectedControls(){transitionControls();editToolsUI();}
function updatePlayhead(){const total=state.sequence?.duration??0,ratio=total?Math.min(state.time,total)/total:0;$('playhead').hidden=!total;$('playhead').style.left=`${ratio*100}%`;if(state.playing){const scroll=$('timelineScroll'),x=6+ratio*$('timelineTrack').clientWidth;if(x<scroll.scrollLeft+6||x>scroll.scrollLeft+scroll.clientWidth-6)scroll.scrollLeft=Math.max(0,x-scroll.clientWidth*.75);}}
function layoutTimeline(){const total=state.sequence?.duration??0,width=state.timelineScale?total*state.timelineScale:Math.max($('timelineScroll').clientWidth-12,total*100);$('timelineTrack').style.width=`${width}px`;$('timelineTrack').style.minWidth=state.timelineScale?'0':'100%';$('timeRuler').replaceChildren();if(total){const step=Math.max(1,Math.ceil(total/100)),times=[];for(let t=0;t<total;t+=step)if(t===0||(total-t)/total*width>50)times.push(t);times.push(total);for(const t of times){const label=document.createElement('span');label.style.left=`${t/total*100}%`;label.textContent=`${Number(t.toFixed(2))}s`;$('timeRuler').append(label);}}updatePlayhead();}
function showSequence(time){state.mode='sequence';state.time=Math.max(0,Math.min(time,state.sequence?.duration||0));const result=state.sequence&&sampleSequence(state.sequence,state.time,state.sampler);if(result){applyPose(state.root,result.pose);$('currentClip').textContent=result.span.kind==='transition'?`过渡 · 末帧 → 首帧 (${Math.round(result.local/result.span.duration*100)}%)`:displaySpan(result.span);$('segments').querySelectorAll('button').forEach(b=>b.classList.toggle('playing',Number(b.dataset.start)===result.span.start));}$('seek').value=state.time;updatePlayhead();boneValues();editToolsUI();}
function rebuild(){
 const visible=state.root&&capturePose(state.root);state.sequence=compileSequence(state.items,state.sampler);if(visible)applyPose(state.root,visible);$('total').textContent=`${state.sequence.duration.toFixed(2)} 秒`;$('seek').max=state.sequence.duration;state.time=Math.min(state.time,state.sequence.duration);
 // 按稳定身份更新，不让输入框失焦提交移除正在点击的片段。
 const container=$('segments'),existing=new Map([...container.children].map(n=>[n.dataset.key,n])),kept=new Set();
 state.sequence.spans.forEach((span,index)=>{const key=span.kind==='transition'?`transition:${span.targetId}`:span.id,button=existing.get(key)||document.createElement('button');kept.add(button);button.dataset.key=key;button.dataset.start=span.start;button.dataset.duration=span.duration;button.style.flexBasis=`${span.duration/state.sequence.duration*100}%`;button.className=span.kind;const itemIndex=state.items.findIndex(i=>i.id===(span.kind==='transition'?span.targetId:span.id));if(itemIndex===state.selected&&(span.kind==='transition')===!!state.selectedTransition)button.classList.add('selected');
 const name=button.querySelector('span')||document.createElement('span'),duration=button.querySelector('small')||document.createElement('small');name.textContent=span.kind==='transition'?'过渡':`${span.kind==='pose'?'姿势':'动作'} · ${displaySpan(span)}`;duration.textContent=`${span.duration.toFixed(2)} s`;duration.className='segment-duration';if(!name.parentNode)button.append(name,duration);if(!button.querySelector('.resize-handle')){const handle=document.createElement('i');handle.className='resize-handle';handle.title=span.kind==='action'?'拖动裁剪；Alt拖动变速':'拖动调整时长';button.append(handle);if(span.kind==='action'){const left=handle.cloneNode();left.classList.add('resize-left');button.append(left);}}button.dataset.sourceIn=span.in??'';button.dataset.sourceOut=span.out??'';button.dataset.rawName=span.name;button.title=`${span.name} · ${span.start.toFixed(2)}—${(span.start+span.duration).toFixed(2)}秒`;button.setAttribute('aria-label',button.title);
 button.onclick=event=>{if(event.detail===0)selectSegment(button,event);};if(container.children[index]!==button)container.insertBefore(button,container.children[index]??null);
 });for(const node of [...container.children])if(!kept.has(node))node.remove();if(!state.items.length){const empty=document.createElement('span');empty.className='empty';empty.textContent='将动作或姿势拖到这里';container.append(empty);}selectionUI();layoutTimeline();selectedControls();updateButtons();
}
function add(item,targetKey,after=false){history.run(()=>{state.playing=false;state.selectedTransition=false;const index=targetKey?state.items.findIndex(i=>i.id===targetKey)+(after?1:0):state.items.length;if(index<0)throw new Error('放置目标已不存在');const added={...item,id:crypto.randomUUID(),transition:item.transition??0};state.items.splice(index,0,added);state.selected=index;state.selection=new Set([added.id]);rebuild();});message('已添加片段');}
async function importModel(files,builtin=null){
 if(state.busy)return false;state.busy=true;updateButtons();message('正在导入模型…');let result,published=false;
 try{
  const retainedFiles=[...files],key=await modelKey(retainedFiles),savedLibrary=await readLibrary(key);result=await loadFiles(retainedFiles);
  for(const action of [...savedLibrary.actions,...(savedLibrary.thirdParty??[])])decodeAction(action,result.root);validatePoses(savedLibrary.poses??[],result.root);
  const box=new THREE.Box3().setFromObject(result.root),size=box.getSize(new THREE.Vector3()).length();
  if(box.isEmpty()||!Number.isFinite(size)||size<=0)throw new Error('没有有效网格');
  const metadata=builtin?{name:builtin.name,builtinId:builtin.id}:savedLibrary.model??{name:result.name.slice(0,80)};
  const owner=builtins.find(b=>b.id===metadata.builtinId),rig=result.root.clone(true);
  if(owner)metadata.name=owner.name;
  // 内置姿势包携带自己的模型，固定姿势不再重复列为连续动作。仅首次载入种入默认姿势。
  let defaults=owner?.poses?importPoseClips(result.root,rig,result.root,result.clips).map((pose,index)=>({...pose,id:'builtin:'+owner.id+':'+index})):[];
  if(owner?.id==='quaternius'){
   const response=await fetch('/fixtures/poses/MakeHumanPoses.glb');if(!response.ok)throw new Error('内置姿势未准备，请运行 node scripts/prepare-pose-demo.mjs');
   const pack=await loadFiles([new File([await response.blob()],'MakeHumanPoses.glb')]);try{defaults=mappedDefaultPoses(result.root,pack.root,pack.clips);}finally{disposeModel(pack.root);}
   const actionsResponse=await fetch('/fixtures/candidates/ual2/Universal%20Animation%20Library%202%5BStandard%5D/Unreal-Godot/UAL2_Standard.glb');if(!actionsResponse.ok)throw new Error('内置动作②未准备，请运行 node scripts/prepare-motion-candidates.mjs');
   const actionsPack=await loadFiles([new File([await actionsResponse.blob()],'UAL2_Standard.glb')]);try{result.clips.push(...mappedDefaultActions(result.root,actionsPack.root,actionsPack.clips));}finally{disposeModel(actionsPack.root);}
   const rmPack=await loadFiles([await verifiedBuiltinFile('/fixtures/candidates/ual2/Universal%20Animation%20Library%202%5BStandard%5D/Unreal-Godot/UAL2_Standard_RM.glb','UAL2_Standard_RM.glb','814eee878f82934992d3ea746c539df25e981487109c591f5efbb8dd03286f99')]);try{result.clips.push(...quaterniusRootMotionActions(result.root,rmPack.root,rmPack.clips,result.clips));}finally{disposeModel(rmPack.root);}
   const onePrefix='/fixtures/candidates/ual1/Universal%20Animation%20Library%5BStandard%5D/Unreal-Godot/';
   const standard1=await loadFiles([await verifiedBuiltinFile(onePrefix+'UAL1_Standard.glb','UAL1_Standard.glb','69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997')]);try{const rm1=await loadFiles([await verifiedBuiltinFile(onePrefix+'UAL1_Standard_RM.glb','UAL1_Standard_RM.glb','be684571ed655a1b892c2c07e6e2aeca053b606c442d34004adaf1d944090d01')]);try{result.clips.push(...quaterniusRootMotionActions(result.root,rm1.root,rm1.clips,mappedDefaultActions(result.root,standard1.root,standard1.clips),'UAL1'));}finally{disposeModel(rm1.root);}}finally{disposeModel(standard1.root);}
  }
  if(owner?.id==='mesh2motion'){
   const addon=await loadFiles([await verifiedBuiltinFile('/fixtures/candidates/m2m-human-addon-animations.glb','m2m-human-addon-animations.glb','a0d64d555e0d492026b72d58bf8e16c5e86779295f9093e376dcc001915c2c95')]);try{const clips=mesh2motionAddonActions(result.root,addon.root,addon.clips);result.clips.push(...clips);defaults.push(...mesh2motionAddonPoses(result.root,clips));}finally{disposeModel(addon.root);}
  }
  const retained=(savedLibrary.poses??[]).filter(pose=>savedLibrary.testPoseCleanup===1||owner?.id!=='quaternius'||pose.name!=='基础'||isDefaultPose(pose));
  const poses=[...new Map([...retained,...defaults].map(pose=>[pose.id,pose])).values()];
  const data={...savedLibrary,model:metadata,poses,testPoseCleanup:1};
  // 模型、目录、素材库和恢复指针先整笔提交；失败仍保留旧视口和编排。
  await saveLibrary(data,retainedFiles);await refreshModelMenu();
  if(state.root){state.sampler.dispose();scene.remove(state.root,state.helper);disposeModel(state.root);state.helper.geometry.dispose();state.helper.material.dispose();}
  state.selection.clear();state.anchor=null;history.reset();
  state.root=result.root;published=true;state.rig=rig;state.sampler=new PoseSampler(state.root);
  state.clips=owner?.poses?[]:result.clips.filter(c=>Number.isFinite(c.duration)&&c.duration>0);
  for(const entry of savedLibrary.thirdParty??[]){const clip=decodeAction(entry,result.root)[0].clip;clip.thirdParty=true;clip.libraryId=entry.id;state.clips.push(clip);}
  state.model=metadata;state.modelKey=key;state.modelFiles=retainedFiles;state.customs=savedLibrary.actions;state.editingActionId=null;activeLibrary=owner?.poses?'pose':'default';$('actionTitle').textContent='未命名动作';
  const info=modelInfo(state.root);state.bones=info.bones;state.poses=structuredClone(poses);state.items=[];state.selected=-1;state.selectedTransition=false;state.sequence=null;state.time=0;state.sourceTime=0;state.customPreview=null;state.playing=false;
  state.helper=new THREE.SkeletonHelper(state.root);state.helper.visible=$('skeleton').checked;scene.add(state.root,state.helper);state.size=size;state.bounds=box.clone();state.viewBounds=null;state.center=box.getCenter(new THREE.Vector3());grid.position.y=box.min.y;grid.scale.setScalar(size/4);
  $('modelName').textContent=metadata.name;$('modelName').title=owner?owner.source+' · '+owner.url:result.name;
  $('bones').textContent=info.bones.length;$('skins').textContent=info.skins.length;$('placeholder').hidden=true;options($('bone'),state.bones.map(b=>b.name));options($('poses'),state.poses.map(p=>p.name));
  renderClips();rebuild();frame();state.busy=false;if(owner?.poses&&state.poses.length)previewPose(state.poses[0]);else showSource(0,false);syncModelMenu();
  message(`已载入 · ${info.bones.length} 骨骼 · ${state.clips.length} 动作${state.poses.length?' · '+state.poses.length+' 姿势':''}`);return true;
 }catch(error){if(result&&!published)disposeModel(result.root);message(`导入失败：${error.message}${state.root?'（原模型保留）':''}`,true);return false;}
 finally{state.busy=false;syncModelMenu();updateButtons();}
}
async function allowModelSwitch(){return !state.busy&&(!state.items.length||await prompts.ask('切换模型会清空当前未保存的编排，已保存内容保留。是否继续？','切换','切换模型'));}
$('modelFiles').onchange=async e=>{if(e.target.files.length&&await allowModelSwitch())await importModel(e.target.files);e.target.value='';};
$('animationFiles').onchange=async e=>{if(state.busy||!state.root)return;state.busy=true;updateButtons();let result;try{result=await loadFiles(e.target.files);assertSameRig(state.rig,result.root);const clips=compatibleClips(state.root,result.clips).map(c=>{const copy=c.clone();copy.name=`${result.name} · ${c.name}`;copy.thirdParty=true;copy.libraryId=crypto.randomUUID();return copy;});await saveLibrary(libraryData(state.customs,state.poses,[...state.clips.filter(c=>c.thirdParty),...clips]),state.modelFiles);state.clips.push(...clips);activeLibrary='thirdparty';renderClips();message(`已追加 ${clips.length} 个同骨架动作`);}catch(error){message(`动作未追加：${error.message}`,true);}finally{if(result)disposeModel(result.root);state.busy=false;e.target.value='';updateButtons();}};
$('poseFiles').onchange=async e=>{if(state.busy||!state.root)return;state.busy=true;updateButtons();let result;try{result=await loadFiles(e.target.files);const imported=importPoseClips(state.root,state.rig,result.root,result.clips);const names=new Set(state.poses.map(p=>p.name));for(const pose of imported){const base=`${result.name} · ${pose.name}`;let name=base,n=2;while(names.has(name))name=base+' ('+(n++)+')';pose.name=name.slice(0,80);if(names.has(pose.name))throw new Error('姿势名称过长或重复');names.add(pose.name);}const poses=[...state.poses,...imported];await saveLibrary(libraryData(state.customs,poses),state.modelFiles);state.poses=poses;options($('poses'),poses.map(p=>p.name));activeLibrary='pose';filterLibrary();message(`已导入 ${imported.length} 个同骨架姿势`);}catch(error){message('姿势未导入：'+error.message,true);}finally{if(result)disposeModel(result.root);state.busy=false;e.target.value='';updateButtons();}};
async function demo(names,prefix,builtin=null){
 if(state.busy||!await allowModelSwitch())return;state.busy=true;updateButtons();
 try{const files=await Promise.all(names.map(async name=>{const r=await fetch(prefix+name);if(!r.ok)throw new Error('模型资源未准备，请运行 '+(builtin?.prepare??'npm.cmd run prepare:motion-demo'));return new File([await r.blob()],name);}));state.busy=false;await importModel(files,builtin);}
 catch(error){message(error.message,true);}finally{state.busy=false;syncModelMenu();updateButtons();}
}
function syncModelMenu(){
 $('replaceModel').value=builtins.some(model=>model.id===state.model?.builtinId)?state.model.builtinId:state.modelKey??'';
 $('renameModel').hidden=!state.root||!!state.model?.builtinId;
}
async function refreshModelMenu(){
 const catalog=await readCatalog(),select=$('replaceModel');select.replaceChildren();
 const builtinGroup=document.createElement('optgroup');builtinGroup.label='内置模型';for(const model of builtins){const option=new Option(model.name,model.id);option.title=model.source;builtinGroup.append(option);}select.append(builtinGroup);
 const external=catalog.models.filter(model=>!model.builtinId);if(external.length){const group=document.createElement('optgroup');group.label='已导入模型';for(const model of external)group.append(new Option(model.name,model.key));select.append(group);}
 select.append(new Option('导入模型…','import'));syncModelMenu();
}
$('replaceModel').onchange=async event=>{
 const value=event.target.value;syncModelMenu();if(value==='import'){$('modelFiles').click();return;}
 const builtin=builtins.find(model=>model.id===value);if(builtin){if(state.model?.builtinId!==value)await demo(builtin.files,builtin.prefix,builtin);return;}
 if(value&&value!==state.modelKey&&await allowModelSwitch()){state.busy=true;updateButtons();try{const record=await savedModel(value);state.busy=false;await importModel(record.files);}catch(error){message('切换失败：'+error.message,true);}finally{state.busy=false;syncModelMenu();updateButtons();}}
};
$('renameModel').textContent='重命名';$('renameModel').onclick=()=>{$('modelDisplayName').value=state.model.name;$('renameModelDialog').showModal();};
for(const id of ['cancelModelRename','closeModelRename'])$(id).onclick=()=>$('renameModelDialog').close();
$('renameModelForm').onsubmit=async event=>{
 event.preventDefault();const name=$('modelDisplayName').value.trim();if(!name||state.busy)return;state.busy=true;updateButtons();
 try{const model={name};await saveLibrary({...libraryData(),model},state.modelFiles);state.model=model;$('modelName').textContent=name;await refreshModelMenu();$('renameModelDialog').close();message('模型名称已保存');}
 catch(error){message('重命名失败：'+error.message,true);}finally{state.busy=false;updateButtons();}
};
$('humanDemo').onclick=()=>{const model=builtins[0];return demo(model.files,model.prefix,model);};$('demo').onclick=()=>demo(['RobotExpressive.glb'],'/fixtures/');
function resetRange(){const clip=state.clips[Number($('source').value)];writeTime('trimIn',0);writeTime('trimOut',clip?.duration??0);$('sourceSeek').max=clip?.duration??0;sourceCardUI();}
function sourceCardUI(){const clip=state.clips[Number($('source').value)],ready=!!clip&&!state.busy,a=readTime('trimIn'),b=readTime('trimOut');$('addAction').setAttribute('aria-disabled',String(!ready));$('dragSourceName').textContent=clip?.name??'未选择动作';$('dragSourceRange').textContent=clip&&Number.isFinite(a)&&Number.isFinite(b)?`${Number(a.toFixed(2))}—${Number(b.toFixed(2))} 秒 · 拖到时间轴`:clip?'范围待设置 · 拖到时间轴':'拖到时间轴';}
for(const id of ['trimIn','trimOut'])$(id).oninput=sourceCardUI;
function prepareInsert(button){if(!state.root||state.busy)return null;if(button.dataset.poseId){const pose=state.poses.find(p=>p.id===button.dataset.poseId);return pose?{kind:'pose',name:pose.name,pose:structuredClone(pose.pose),duration:1,modelKey:state.modelKey,poseId:pose.id}:null;}if(button.dataset.customId){const action=state.customs.find(a=>a.id===button.dataset.customId);return action?{kind:'recipe',name:action.name,modelKey:state.modelKey,items:decodeAction(action,state.root)}:null;}if(button.id==='transitionSource')return state.items.length>1?{kind:'transition',root:state.root}:null;const index=button.dataset.clipIndex===undefined?Number($('source').value):Number(button.dataset.clipIndex),clip=state.clips[index];if(!clip)return null;const current=index===Number($('source').value),item={kind:'action',name:clip.name,clip,...(current?{in:readTime('trimIn'),out:readTime('trimOut')}:{})};try{actionRange(item);return item;}catch(error){message(error.message,true);return null;}}
// 过渡仍归属后段；这里只解析用户指定的片段边界，不自动补齐。
function transitionTarget(key,after=false){const index=state.items.findIndex(i=>i.id===key);if(index<0)return null;const target=index+(after?1:0);return target>0&&target<state.items.length?state.items[target]:null;}
function canInsert(item,key,after){if(state.busy)return false;if(item.kind==='recipe')return item.modelKey===state.modelKey;if(item.kind==='pose')return item.modelKey===state.modelKey&&state.poses.some(p=>p.id===item.poseId);if(item.kind!=='transition')return state.clips.includes(item.clip);const target=transitionTarget(key,after);return item.root===state.root&&!!target&&!target.transition;}
function transitionControls(){const ready=!!state.root&&!state.busy;const item=state.items[state.selected];$('transitionSource').setAttribute('aria-disabled',String(!ready||state.items.length<2));$('addTransition').disabled=!ready||state.selection.size!==1||state.selectedTransition||!transitionTarget(item?.id)||!!item?.transition;}
function addTransition(key,after=false){const request={kind:'transition',root:state.root};if(!canInsert(request,key,after))return;const item=transitionTarget(key,after);history.run(()=>{item.transition=.35;state.playing=false;state.selected=state.items.indexOf(item);state.selectedTransition=true;state.selection=new Set([`transition:${item.id}`]);rebuild();showSequence(state.sequence.spans.find(s=>s.targetId===item.id&&s.kind==='transition').start);});$('segments').querySelector('.selected')?.focus();message('已添加过渡');}
function insertAction(item,targetKey,after){if(item.kind==='recipe'){if(canInsert(item,targetKey,after))insertRecipe(item.items,item.name,targetKey,after);return;}if(item.kind==='transition'){if(canInsert(item,targetKey,after))addTransition(targetKey,after);return;}if(item.kind==='pose'){if(canInsert(item,targetKey,after)){const {modelKey,poseId,...saved}=item;add(saved,targetKey,after);showSequence(state.sequence.spans.find(s=>s.id===state.items[state.selected].id).start);}return;}if(state.busy||!state.clips.includes(item.clip)){message('素材已变化，未放置动作',true);return;}if(targetKey&&!state.items.some(i=>i.id===targetKey)){message('放置目标已变化，请重新拖动',true);return;}add(item,targetKey,after);showSequence(state.sequence.spans.find(s=>s.id===state.items[state.selected].id).start);$('segments').querySelector('.selected')?.focus();}
$('addTransition').onclick=()=>addTransition(state.items[state.selected]?.id);$('transitionSource').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();if(!$('addTransition').disabled)$('addTransition').click();}};
$('source').onchange=()=>{resetRange();showSource();};$('sourceTime').onchange=()=>{const t=$('sourceTime').valueAsNumber;if(!Number.isFinite(t)){message('预览时间无效',true);return;}showSource(t);};
$('sourceSeek').oninput=()=>showSource($('sourceSeek').valueAsNumber);
$('markIn').onclick=()=>{writeTime('trimIn',state.sourceTime);sourceCardUI();};$('markOut').onclick=()=>{writeTime('trimOut',state.sourceTime);sourceCardUI();};
$('quickSequence').onclick=()=>{const clips=quickActions.map(([key,name])=>({name,clip:state.clips.find(c=>c.name===key)}));if(clips.some(c=>!c.clip)){message('当前模型没有挥剑示例所需动作',true);return;}history.run(()=>{for(const [index,item] of clips.entries())add({kind:'action',...item,transition:index?.35:0});});showSequence(state.sequence.spans.find(s=>s.id===state.items.at(-clips.length).id).start);state.playing=true;updateButtons();message('示例已加入时间轴');};
$('bone').onchange=()=>{state.playing=false;if(!advancedTools&&$('posePanel').open)bodyControls.chooseBone(state.bones[Number($('bone').value)]);boneValues();updateButtons();};for(const id of ['rx','ry','rz'])$(id).onchange=()=>{const values=['rx','ry','rz'].map(i=>$(i).valueAsNumber);if(!values.every(Number.isFinite)){message('关节角度无效',true);return;}state.playing=false;state.mode='pose';state.bones[Number($('bone').value)].quaternion.setFromEuler(new THREE.Euler(...values.map(THREE.MathUtils.degToRad),'XYZ'));state.root.updateMatrixWorld(true);$('currentClip').textContent='自定义姿势';updateButtons();};
$('savePose').onclick=()=>savePoseEntry(`姿势 ${state.poses.length+1}`,capturePose(state.root));$('poses').onchange=()=>{state.playing=false;state.mode='pose';applyPose(state.root,state.poses[Number($('poses').value)].pose);boneValues();updateButtons();};
$('addAction').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();const item=prepareInsert($('addAction'));if(item)insertAction(item);}};$('addPose').onclick=()=>{const pose=state.poses[Number($('poses').value)];add({kind:'pose',name:pose.name,pose:structuredClone(pose.pose),duration:1});};
function moveItem(key,targetKey,after,swap=false){const source=state.items.filter(i=>state.selection.has(i.id)),target=state.items.findIndex(i=>i.id===targetKey);if(!source.length||target<0||source.some(i=>i.id===targetKey))return;history.run(()=>{if(swap){const targets=state.items.slice(target,target+source.length);if(targets.length!==source.length||targets.some(i=>source.includes(i))){message('交换需要同数量且不重叠的目标片段',true);return;}const positions=source.map(i=>state.items.indexOf(i));positions.forEach((position,i)=>{state.items[position]=targets[i];state.items[target+i]=source[i];});}else{state.items=state.items.filter(i=>!source.includes(i));const to=state.items.findIndex(i=>i.id===targetKey);state.items.splice(to+(after?1:0),0,...source);}state.selected=state.items.findIndex(i=>i.id===key);state.selectedTransition=false;state.playing=false;rebuild();showSequence(state.sequence.spans.find(s=>s.id===key).start);});}
function removeSelected(){if(!state.selection.size)return;history.run(()=>{state.playing=false;for(const item of state.items)if(state.selection.has(`transition:${item.id}`))item.transition=0;state.items=state.items.filter(i=>!state.selection.has(i.id));state.selection.clear();state.selectedTransition=false;state.selected=-1;rebuild();if(state.items.length)showSequence(state.time);else showSource(0);updateButtons();});}
$('timelineRemove').onclick=removeSelected;
function timelineItem(key){const transition=key.startsWith('transition:');return {item:state.items.find(i=>i.id===(transition?key.slice(11):key)),field:transition?'transition':'duration'};}
const disposeTimeline=bindTimelineEdit({container:$('segments'),scroll:$('timelineScroll'),track:$('timelineTrack'),library:$('clips'),sourceCard:$('addAction'),transitionSource:$('transitionSource'),prepareInsert,canInsert,insert:insertAction,select:selectSegment,selected:key=>state.selection.has(key),begin:history.begin,end:history.end,scale:value=>{state.timelineScale=value;},snapshot:key=>{const {item}=timelineItem(key);return {...item};},restore:(key,value)=>{const {item}=timelineItem(key);for(const field of Object.keys(item))delete item[field];Object.assign(item,value);},refresh:()=>{rebuild();showSequence(state.time);},move:moveItem,remove:removeSelected,resize:(key,value,side,original,mode)=>{
 if(state.busy)return;const {item,field}=timelineItem(key);if(!item)return;
 if(field==='duration'&&item.kind==='action'&&mode!=='duration'){
  const range=actionRange(original),rate=range.duration/(original.duration??range.duration),max=side==='left'?range.out/rate:(item.clip.duration-range.in)/rate,duration=Math.max(.05,Math.min(value,max));
  item.in=side==='left'?range.out-duration*rate:range.in;item.out=side==='left'?range.out:range.in+duration*rate;item.duration=duration;
 }else item[field]=Math.max(.05,Math.min(value,field==='transition'?5:item.kind==='pose'?30:300));
 state.playing=false;rebuild();showSequence(state.time);
},canEdit:()=>!state.busy});
$('timelineUndo').onclick=()=>history.undo();$('timelineRedo').onclick=()=>history.redo();$('timelineAll').onclick=()=>{state.selection=new Set(state.items.map(i=>i.id));selectionUI();selectedControls();};$('timelineNone').onclick=()=>{state.selection.clear();state.selected=-1;selectionUI();selectedControls();};
document.querySelector('.timeline').addEventListener('keydown',event=>{if(event.target.matches('input,textarea,select'))return;if(event.ctrlKey||event.metaKey){if(event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?history.redo():history.undo();}else if(event.key.toLowerCase()==='y'){event.preventDefault();history.redo();}else if(event.key.toLowerCase()==='a'){event.preventDefault();$('timelineAll').click();}}});
$('seek').oninput=()=>{state.playing=false;showSequence($('seek').valueAsNumber);updateButtons();};$('play').onclick=()=>{if(state.mode==='custom'&&state.customTime>=state.customPreview.sequence.duration)showCustom(0);if(state.mode==='pose'){if(!state.items.length)return;showSequence(0);}if(state.mode==='sequence'&&state.time>=state.sequence.duration)showSequence(0);state.playing=!state.playing;updateButtons();};$('restart').onclick=()=>{if(state.mode==='pose'){if(!state.items.length){state.playing=false;updateButtons();return;}showSequence(0);}else if(state.mode==='custom')showCustom(0);else if(state.mode==='sequence')showSequence(0);else showSource(0);state.playing=true;updateButtons();};
$('viewPreset').onchange=()=>frame();$('fit').onclick=fitCurrentMotion;$('side').onclick=()=>frame(true);$('skeleton').onchange=()=>{if(state.helper)state.helper.visible=$('skeleton').checked;};$('green').onchange=()=>{scene.background.set($('green').checked?'#00ff00':(advancedTools?'#13171c':'#121416'));grid.visible=!$('green').checked;};
const observer=new ResizeObserver(()=>{const {width,height}=stage.getBoundingClientRect();renderer.setSize(width,height,false);resizeView(camera,width/Math.max(height,1));layoutTimeline();});observer.observe(stage);let previous=performance.now(),disposed=false;
function tick(now){if(disposed)return;const wallDelta=Math.min((now-previous)/1000,.1),delta=wallDelta*Number($('speed').value);previous=now;freeView.update(wallDelta);if(state.playing&&!state.busy){if(state.mode==='sequence'){showSequence(state.time+delta);if(state.time>=state.sequence.duration){state.playing=false;updateButtons();}}else if(state.mode==='custom'){showCustom(state.customTime+delta);if(state.customTime>=state.customPreview.sequence.duration){state.playing=false;updateButtons();}}else if(state.mode==='source'){const clip=state.clips[Number($('source').value)];if(clip){state.sourceTime=(state.sourceTime+delta)%clip.duration;applyPose(state.root,state.sampler.sample(clip,state.sourceTime));$('sourceTime').value=state.sourceTime.toFixed(2);}}}$('sourceSeek').value=state.sourceTime;syncPreviewSeek();if(!freeView.active)controls.update();poseDrag.update();bodyControls.update();renderer.render(scene,camera);$('clock').textContent=`${(state.mode==='sequence'?state.time:state.mode==='custom'?state.customTime:state.sourceTime).toFixed(2)} s`;requestAnimationFrame(tick);}requestAnimationFrame(tick);updateButtons();selectedControls();
restoreLastSaved();
window.addEventListener('pagehide',()=>{referenceCapture?.dispose();disposed=true;freeView.dispose();disposeTimeline();observer.disconnect();bodyControls.dispose();poseDrag.dispose();controls.dispose();state.sampler?.dispose();if(state.root)disposeModel(state.root);renderer.dispose();});
