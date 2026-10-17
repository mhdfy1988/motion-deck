import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Object3D,PerspectiveCamera} from 'three';
import {pointerRay} from '../../web/labs/motion/pose/pose-picking.js';
import {beginBodyPointer,moveBodyPointer,finishBodyPointer} from '../../web/labs/motion/pose/body-pointer.js';

function fixture(kind){
 const calls=[],root=new Object3D(),upper=new Object3D(),middle=new Object3D(),end=new Object3D();
 root.add(upper);upper.add(middle);middle.add(end);end.position.set(0,1,0);root.updateMatrixWorld(true);
 const camera=new PerspectiveCamera(40,1,.1,100);camera.position.set(0,0,5);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 const canvas={getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})},captured=new Set(),classes=new Set();
 const button={setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id),classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}};
 const solver={bones:[upper,middle],feedback:[],begin:()=>calls.push('solver.begin'),move:()=>calls.push('body.move'),moveJoint:()=>calls.push('limb.moveJoint'),moveEnd:()=>calls.push('limb.moveEnd')};
 const part={node:kind==='whole'?root:end,button};
 if(kind==='whole')part.whole=true;
 else if(kind==='body')part.bodyDrag=solver;
 else{part.limb={chain:{upper,middle},ik:solver};part.middleDrag=kind==='joint';}
 const state={busy:false,playing:false,poseDraft:{origin:'user'}};
 const host={root,camera,controls:{enabled:true},getState:()=>state,gizmo:{detach:()=>calls.push('detach')},pointerRay:event=>pointerRay(event,canvas,camera),onBegin:(bones,options)=>calls.push({bones,options}),onConstrain:()=>[],onEdit:()=>calls.push('edit'),onFinish:cancel=>calls.push({cancel}),choose:()=>calls.push('choose'),setMoveHover:()=>calls.push('hover'),onError:error=>{throw error;}};
 host.finishPointer=cancel=>finishBodyPointer(host,cancel);
 const event=(x=50,y=50)=>({pointerId:1,button:0,clientX:x,clientY:y,preventDefault(){},stopPropagation(){}});
 return {host,part,state,event,calls,captured,classes,upper,middle,solver};
}

test('3像素内不提交事务，普通点击松手仍选择，捕获与相机恢复',()=>{
 const f=fixture('end');beginBodyPointer(f.host,f.event(),f.part);assert.equal(f.host.controls.enabled,false);
 moveBodyPointer(f.host,f.event(53));assert.equal(f.host.pointerDrag.active,false);
 finishBodyPointer(f.host,false);assert.equal(f.host.controls.enabled,true);assert.equal(f.captured.size,0);assert.equal(f.classes.size,0);
 assert.deepEqual(f.calls,['detach','choose']);
});

for(const kind of ['end','joint','body','whole'])test(kind+'拖动分派不改允许骨骼与事务参数，松手只结束一次',()=>{
 const f=fixture(kind);beginBodyPointer(f.host,f.event(),f.part);moveBodyPointer(f.host,f.event(60));moveBodyPointer(f.host,f.event(65));
 const begins=f.calls.filter(call=>call?.bones);assert.equal(begins.length,1);
 if(kind==='end')assert.deepEqual(begins[0],{bones:[f.middle],options:undefined});
 if(kind==='joint')assert.deepEqual(begins[0],{bones:[f.upper],options:undefined});
 if(kind==='body')assert.deepEqual(begins[0],{bones:f.solver.bones,options:{positionBones:[]}});
 if(kind==='whole')assert.deepEqual(begins[0],{bones:[f.host.root],options:{rootTranslation:true}});
 finishBodyPointer(f.host,true);finishBodyPointer(f.host,true);
 assert.deepEqual(f.calls.filter(call=>typeof call==='object'&&'cancel' in call),[{cancel:true}]);assert.equal(f.captured.size,0);assert.equal(f.host.controls.enabled,true);
 if(kind!=='whole')assert.equal(f.calls.filter(call=>call==='solver.begin').length,1);
});

test('忙碌、播放或非用户草稿不抢指针，非当前指针不能推进手势',()=>{
 for(const state of [{busy:true},{playing:true},{poseDraft:{origin:'assistant'}}]){
  const f=fixture('end');Object.assign(f.state,state);beginBodyPointer(f.host,f.event(),f.part);assert.equal(f.host.pointerDrag,undefined);assert.equal(f.captured.size,0);
 }
 const f=fixture('end');beginBodyPointer(f.host,f.event(),f.part);moveBodyPointer(f.host,{...f.event(60),pointerId:2});assert.equal(f.host.pointerDrag.active,false);finishBodyPointer(f.host,true);
});

test('约束触边沿原规则重置增量，求解失败只取消本次事务并释放捕获',()=>{
 const f=fixture('end');beginBodyPointer(f.host,f.event(),f.part);
 f.solver.feedback=[{joint:'test'}];moveBodyPointer(f.host,f.event(60));assert.equal(f.calls.filter(call=>call==='solver.begin').length,2);
 f.host.onError=error=>f.calls.push(error.message);f.solver.moveEnd=()=>{throw new Error('求解失败');};moveBodyPointer(f.host,f.event(65));
 assert.equal(f.host.pointerDrag,null);assert.equal(f.host.controls.enabled,true);assert.equal(f.captured.size,0);
 assert.deepEqual(f.calls.filter(call=>typeof call==='object'&&'cancel' in call),[{cancel:true}]);assert.ok(f.calls.includes('求解失败'));
});
