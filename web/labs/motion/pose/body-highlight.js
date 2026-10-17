import * as THREE from 'three';

// 仅编辑场景中的显示副本，共享几何/骨架但不改变原材质，也不进入姿势或导出模型。
export class BodyHighlight{
 constructor(scene){this.group=new THREE.Group();this.group.name='editor-body-highlight';this.group.visible=false;scene.add(this.group);this.items=[];}
 rebuild(root){
  this.clear();if(!root)return;
  root.traverse(source=>{if(!source.isMesh)return;
   for(const [band,opacity] of [[0,.16],[.0025,.75],[.006,.16]]){
    const material=new THREE.MeshBasicMaterial({color:0x59baff,transparent:true,opacity,depthWrite:false,side:band?THREE.BackSide:THREE.FrontSide,toneMapped:false,polygonOffset:!band,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    const width={value:0};
    if(band){material.onBeforeCompile=shader=>{shader.uniforms.highlightWidth=width;shader.vertexShader='uniform float highlightWidth;\n'+shader.vertexShader.replace('#include <skinning_vertex>','#include <skinning_vertex>\n#if !defined(USE_ENVMAP) && !defined(USE_SKINNING)\nvec3 objectNormal = vec3(normal);\n#endif\ntransformed += normalize(objectNormal) * highlightWidth;');};material.customProgramCacheKey=()=> 'body-highlight-shell-v1';}
    const mesh=source.clone(false);mesh.name='editor-highlight-surface';mesh.material=material;mesh.matrixAutoUpdate=false;mesh.frustumCulled=false;mesh.renderOrder=20;mesh.castShadow=false;mesh.receiveShadow=false;this.group.add(mesh);this.items.push({source,mesh,material,width,band,opacity});
   }
  });
 }
 update(visible,active,size){
  this.group.visible=visible;if(!visible)return;
  for(const item of this.items){const {source,mesh,material,width,band,opacity}=item;mesh.matrix.copy(source.matrixWorld);mesh.visible=source.visible;mesh.morphTargetInfluences=source.morphTargetInfluences;const scale=source.getWorldScale(new THREE.Vector3());width.value=band*size/Math.max(Math.abs(scale.x),1e-6);material.opacity=active?Math.min(.95,opacity*1.6):opacity;}
 }
 clear(){for(const {material} of this.items)material.dispose();this.items=[];this.group.clear();this.group.visible=false;}
 dispose(){this.clear();this.group.removeFromParent();}
}
