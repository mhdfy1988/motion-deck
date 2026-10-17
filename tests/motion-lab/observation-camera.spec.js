import {test,expect} from '@playwright/test';
import {waitForModel} from './model-ready-helper.js';
import {checkObservationCamera} from '../helpers/observe-camera.js';
import {build} from 'esbuild';

test('视口场景工厂保留灯光/网格/相机配置，尺寸观察使用当前相机',async({page})=>{
 const fixture=await build({stdin:{contents:"export {THREE} from './web/labs/motion/platform/three-adapter.js';export {createViewportScene} from './web/labs/motion/platform/viewport-scene.js';",resolveDir:process.cwd()},bundle:true,format:'esm',write:false});
 await page.route('**/viewport-fixture.js',route=>route.fulfill({contentType:'application/javascript',body:fixture.outputFiles[0].text}));
 await page.goto('/');await waitForModel(page,{actions:162});
 const results=await page.evaluate(async()=>{
  const {THREE,createViewportScene}=await import('/viewport-fixture.js'),results=[];
  for(const advancedTools of [false,true]){
   const stage=document.createElement('div');document.body.append(stage);stage.getBoundingClientRect=()=>({width:640,height:320});
   const errors=[],view=createViewportScene({stage,advancedTools,pixelRatio:3,onError:text=>errors.push(text)});let callback,observed=null,disconnects=0,resizes=0,current=view.camera;
   class Observer{constructor(fn){callback=fn;}observe(node){observed=node;}disconnect(){disconnects++;}}
   const stop=view.observe({getCamera:()=>current,onResize:()=>resizes++,Observer});callback();const originalAspect=view.camera.aspect;current=new THREE.PerspectiveCamera();callback();
   const color=view.scene.background.getHexString(),lights=view.scene.children.filter(node=>node.isLight),directional=lights.find(node=>node.isDirectionalLight);
   results.push({advancedTools,color,ratio:view.renderer.getPixelRatio(),originalAspect,currentAspect:current.aspect,resizes,observed:observed===stage,lights:lights.length,intensity:directional.intensity,position:directional.position.toArray(),grid:!!view.grid.isLineSegments,errors});
   stop();results.at(-1).disconnects=disconnects;view.controls.dispose();view.grid.geometry.dispose();view.grid.material.dispose();view.renderer.dispose();view.renderer.forceContextLoss();stage.remove();
  }return results;
 });
 for(const result of results)expect(result).toEqual({advancedTools:result.advancedTools,color:result.advancedTools?'13171c':'121416',ratio:2,originalAspect:2,currentAspect:2,resizes:2,observed:true,lights:2,intensity:3,position:[4,7,5],grid:true,errors:[],disconnects:1});
});

test('实际入口pagehide按阶段释放且仅执行一次，停止帧循环后可重新载入',async({page})=>{
 await page.addInitScript(()=>{
  const request=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window),pending=new Set();globalThis.frameProbe={pending,cancelled:[]};
  window.requestAnimationFrame=callback=>{let id;id=request(time=>{pending.delete(id);callback(time);});pending.add(id);return id;};
  window.cancelAnimationFrame=id=>{pending.delete(id);frameProbe.cancelled.push(id);cancel(id);};
 });
 await page.goto('/');await waitForModel(page,{actions:162});
 const result=await page.evaluate(async()=>{
  const {workbench,bodyControls}=await import('/labs/motion/motion.bundle.js');const state=bodyControls.getState();let disposals=0,closedEvents=0;
  const original=bodyControls.dispose.bind(bodyControls);bodyControls.dispose=()=>{disposals++;original();};
  const unsubscribe=workbench.subscribe(()=>{if(state.closed)closedEvents++;});
  window.dispatchEvent(new PageTransitionEvent('pagehide'));window.dispatchEvent(new PageTransitionEvent('pagehide'));
  await new Promise(resolve=>setTimeout(resolve,80));unsubscribe();
  return {closed:state.closed,disposals,closedEvents,pending:frameProbe.pending.size,cancelled:frameProbe.cancelled.length,redoRemoved:!document.getElementById('redoRotation')};
 });
 expect(result).toMatchObject({closed:true,disposals:1,closedEvents:1,pending:0,redoRemoved:true});expect(result.cancelled).toBeGreaterThan(0);
 await page.reload();await waitForModel(page,{actions:162});await expect(page.locator('#editPose')).toBeEnabled();
});

for(const model of ['Mesh2Motion','Quaternius'])test(model+'人物观察相机：定量转角、平移缩放、关闭飞行及近景恢复',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await waitForModel(page,{actions:162});
 if(model==='Quaternius'){await page.locator('#replaceModel').selectOption({label:model});await waitForModel(page,{actions:117});}
 await checkObservationCamera(page);expect(errors).toEqual([]);await page.screenshot({path:'output/acceptance/observe-camera-'+model+'.png'});
});
