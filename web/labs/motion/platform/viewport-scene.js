import {THREE} from './three-adapter.js';
import {ViewControls} from './view-controls.js';
import {resizeView} from './view-camera.js';

// 只创建视口基础资源，不载入模型、不管理会话或运行第二个渲染循环。
export function createViewportScene({stage,advancedTools,pixelRatio,onError}){
 let renderer;
 try{renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});}
 catch{onError('WebGL 初始化失败，请启用硬件加速');throw new Error('WebGL unavailable');}
 renderer.setPixelRatio(Math.min(pixelRatio,2));stage.append(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color(advancedTools?'#13171c':'#121416');
 const camera=new THREE.PerspectiveCamera(38,1,.01,1000),controls=new ViewControls(camera,renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xdbefff,0x424850,2.2));
 const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(4,7,5);scene.add(light);
 const grid=new THREE.GridHelper(12,24,advancedTools?0x435364:0x39404a,advancedTools?0x252e37:0x23282f);scene.add(grid);
 function observe({getCamera,onResize,Observer=ResizeObserver}){
  const observer=new Observer(()=>{
   const {width,height}=stage.getBoundingClientRect();renderer.setSize(width,height,false);
   resizeView(getCamera(),width/Math.max(height,1));controls.handleResize();onResize();
  });
  observer.observe(stage);return ()=>observer.disconnect();
 }
 return {scene,renderer,camera,controls,grid,observe};
}
