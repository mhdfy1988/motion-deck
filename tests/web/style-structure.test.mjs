import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {build} from 'esbuild';
const root=resolve('web/labs/motion');

test('旧视觉层不重复声明已统一到尺度层的常量字段',async()=>{
 const files={
  'theme/workspace-player.css':[['body:not(.advanced-tools) .section-head h2',['font-size','font-weight','letter-spacing']],['body:not(.advanced-tools) .library-tabs button',['font-size','height','min-height']],['body:not(.advanced-tools) .toggle input',['width','height']],['body:not(.advanced-tools) .clips button',['font-size','font-weight','min-height','padding']]],
  'theme/timeline.css':[['body:not(.advanced-tools) #timelineTrack #segments button',['font-size']],['body:not(.advanced-tools) .timeline-head .icon-button',['width','height']]],
  'theme/library-inputs.css':[['#viewPreset option',['font-size']]]
 };
 for(const [file,checks] of Object.entries(files)){
  const source=await readFile(resolve(root,'styles',file),'utf8');
  for(const [selector,properties] of checks){
   const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),body=new RegExp('(?:^|\\n)'+escaped+'\\{([^{}]*)\\}').exec(source)?.[1]??'';
   for(const property of properties)assert.doesNotMatch(body,new RegExp('(?:^|;)'+property+':'),`${file}: ${selector}不应重复${property}`);
  }
 }
 const base=await readFile(resolve(root,'styles/base/timeline.css'),'utf8');assert.doesNotMatch(base,/#timeRuler span:last-child\{/,'末刻度按统一规则处理，不恢复旧端点反向平移');
});
test('样式入口顺序明确、无重复加载，所有分片可独立解析且不越界',async()=>{
 const expected={
  'motion.css':['base/foundation','base/pose-input','base/timeline','base/workspace','base/library-player'],
  'motion-theme.css':['theme/pose-editor','theme/controls','theme/workspace-player','theme/timeline','theme/library-inputs','theme/desktop-dialogs','theme/layout-sizing','theme/assistant-activity','theme/library-settings','theme/pose-modes']
 };
 for(const [entry,names] of Object.entries(expected)){
  const source=await readFile(resolve(root,entry),'utf8'),paths=[...source.matchAll(/@import url\('\.\/styles\/(.*?)\.css'\);/g)].map(match=>match[1]);assert.deepEqual(paths,names);
  const result=await build({entryPoints:[resolve(root,entry)],bundle:true,write:false,metafile:true,logLevel:'silent'});
  assert.equal(result.warnings.length,0);const inputs=Object.keys(result.metafile.inputs);
  assert.equal(inputs.length,names.length+1);assert.equal(new Set(inputs).size,inputs.length);
  for(const path of inputs)assert.equal(relative(root,resolve(path)).startsWith('..'),false);
 }
});
