import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
test('核心与应用操作不读取DOM，导出生成不依赖素材存储',async()=>{
 const root=resolve('web/labs/motion');
 for(const layer of ['core','application'])for(const file of await readdir(resolve(root,layer))){
  if(!file.endsWith('.js')||file.endsWith('.generated.js'))continue;
  const text=await readFile(resolve(root,layer,file),'utf8');
  assert.doesNotMatch(text,/\b(?:document|window)\s*\./,`${layer}/${file}不应控制界面`);
  if(layer==='core')assert.doesNotMatch(text,/from\s+['"][^'"]*(?:application|platform|ui)\//,`${file}不应反向依赖上层`);
 }
 const exporter=await readFile(resolve(root,'platform/motion-export.js'),'utf8');assert.doesNotMatch(exporter,/action-library|indexeddb-store/);
});
