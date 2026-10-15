import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import sharp from 'sharp';
const {writeCapture,writeManifest,writeVideo}=createRequire(import.meta.url)('../../desktop/control/capture-files.cjs');
test('受控截图只写导出子目录、真实PNG可解码且不覆盖，非法字节拒绝',async()=>{
 await mkdir(resolve('output/capture-tests'),{recursive:true});const exports=await mkdtemp(resolve('output/capture-tests/exports-')),png=await sharp({create:{width:64,height:64,channels:3,background:'#ffffff'}}).png().toBuffer();
 const first=await writeCapture(exports,png),next=await writeCapture(exports,png);assert.notEqual(first.path,next.path);assert.ok(first.path.startsWith(exports));assert.equal((await sharp(await readFile(first.path)).metadata()).width,64);
 await assert.rejects(writeCapture(exports,new Uint8Array(30)),/PNG/);await assert.rejects(writeCapture(exports,new Uint8Array(21*1024*1024)),/超限/);
});
test('截图索引只引用真实受控PNG并核对摘要，视频写入拒绝路径及不符文件头',async()=>{
 await mkdir(resolve('output/capture-tests'),{recursive:true});const exports=await mkdtemp(resolve('output/capture-tests/manifest-')),png=await sharp({create:{width:64,height:64,channels:3,background:'#ffffff'}}).png().toBuffer();
 const frame={...await writeCapture(exports,png),view:'right',time:.2},manifest={modelKey:'a'.repeat(64),revision:1,options:{ground:true},frames:[frame]};
 const written=await writeManifest(exports,manifest);assert.equal(JSON.parse(await readFile(written.path,'utf8')).frames[0].path,frame.path);
 await assert.rejects(writeManifest(exports,{...manifest,frames:[{...frame,path:resolve('README.md')}]}),/受控/);
 await assert.rejects(writeManifest(exports,{...manifest,frames:[{...frame,sha256:'b'.repeat(64)}]}),/摘要/);
 await assert.rejects(writeVideo(exports,{extension:'mp4',bytes:new Uint8Array(64)}),/文件头/);
 await assert.rejects(writeVideo(exports,{extension:'mp4',bytes:new Uint8Array(64),path:'outside'}),/无效/);
});
