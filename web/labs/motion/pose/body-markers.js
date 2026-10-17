import * as THREE from 'three';

function markerTexture(square){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#47748c';ctx.strokeStyle='#9acdeb';ctx.lineWidth=6;ctx.beginPath();if(square)ctx.roundRect(7,7,50,50,8);else ctx.arc(32,32,25,0,Math.PI*2);ctx.fill();ctx.stroke();const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

// 圆点在WebGL内绘制，骨矩阵在绘制时读取；DOM只保留透明命中区和无障碍入口。
export class BodyMarkers{
 constructor(scene,getSize){this.getSize=getSize;this.group=new THREE.Group();this.group.name='editor-body-markers';this.group.visible=false;scene.add(this.group);this.textures=[markerTexture(false),markerTexture(true)];this.items=[];}
 add(part){
  const material=new THREE.SpriteMaterial({map:this.textures[part.limb&&!part.middleDrag?1:0],depthTest:false,depthWrite:false,toneMapped:false});
  const sprite=new THREE.Sprite(material);sprite.name='editor-joint-marker';sprite.frustumCulled=false;sprite.renderOrder=40;sprite.matrixAutoUpdate=false;sprite.matrixWorldAutoUpdate=false;
  const position=new THREE.Vector3(),edge=new THREE.Vector3(),projected=new THREE.Vector3(),scale=new THREE.Vector3(),up=new THREE.Vector3(),viewport=new THREE.Vector4();
  sprite.onBeforeRender=(renderer,scene,camera)=>{
   // 此回调在场景矩阵更新后、实际画点前执行，不依赖DOM布局或事件刷新时机。
   if(part.worldPosition)position.copy(part.worldPosition());else position.setFromMatrixPosition(part.node.matrixWorld);renderer.getViewport(viewport);up.set(0,1,0).applyQuaternion(camera.quaternion).multiplyScalar(this.getSize()*.018);projected.copy(position).project(camera);edge.copy(position).add(up).project(camera);
   const raw=Math.abs(edge.y-projected.y)*viewport.w/2,diameter=THREE.MathUtils.clamp(raw,3,12)*(part.markerScale??1),factor=raw>1e-8?diameter/raw:1,worldSize=this.getSize()*.018*factor*(sprite.userData.emphasized?1.2:1);
   sprite.userData.diameter=diameter;sprite.matrixWorld.compose(position,camera.quaternion,scale.setScalar(worldSize));
  };
  this.group.add(sprite);this.items.push({part,sprite,material});part.marker=sprite;return sprite;
 }
 update(visible,selected,hovered,dragged){this.group.visible=visible;for(const {part,sprite,material} of this.items){const emphasized=part===selected||part===hovered||part===dragged;sprite.userData.emphasized=emphasized;material.color.setHex(emphasized?0xc8efff:0xffffff);}}
 clear(){for(const {part,material} of this.items){delete part.marker;material.dispose();}this.items=[];this.group.clear();}
 dispose(){this.clear();this.textures.forEach(t=>t.dispose());this.group.removeFromParent();}
}
