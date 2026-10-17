import {THREE} from './three-adapter.js';
import {ReferenceCapture} from './reference-capture.js';
import {resizeView} from './view-camera.js';

// 用户拍摄和命令媒体共用工厂；独立渲染器/相机不改变预览画布。
export function createReferenceCaptureFactory({scene,renderer,grid,getCamera,getRoot,getHelper,onStatus,onRelease}){
 return function createCapture(options={}){
  const sourceCamera=options.camera??getCamera(),aspect=sourceCamera.aspect;
  const width=options.width??(aspect>=1920/1080?1920:Math.max(2,Math.round(1080*aspect/2)*2));
  const height=options.height??(aspect>=1920/1080?Math.max(2,Math.round(1920/aspect/2)*2):1080);
  const captureRenderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'}),view=sourceCamera.clone();
  const output=document.createElement('canvas');output.width=width;output.height=height;
  const ctx=output.getContext('2d',{alpha:false,colorSpace:'srgb'});
  captureRenderer.setPixelRatio(1);captureRenderer.setSize(width,height,false);
  captureRenderer.outputColorSpace=renderer.outputColorSpace;captureRenderer.toneMapping=renderer.toneMapping;captureRenderer.toneMappingExposure=renderer.toneMappingExposure;resizeView(view,width/height);
  const capture=new ReferenceCapture({canvas:output,onStatus,release:()=>{captureRenderer.dispose();captureRenderer.forceContextLoss();onRelease();},draw:()=>{
   const saved=scene.children.map(node=>[node,node.visible]);
   try{
    for(const [node] of saved)if(node!==getRoot()&&!node.isLight)node.visible=node===grid?!!options.ground:node===getHelper()?!!options.skeleton:false;
    captureRenderer.render(scene,view);ctx.drawImage(captureRenderer.domElement,0,0);
    if(capture.label){ctx.font='16px sans-serif';ctx.fillStyle='#101214dd';ctx.fillRect(12,12,280,32);ctx.fillStyle='#ffffff';ctx.fillText(capture.label,22,34);}
   }finally{for(const [node,visible] of saved)node.visible=visible;}
  }});
  return capture;
 };
}
