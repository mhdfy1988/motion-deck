// 命令教学验收：只在新建、隔离的验收客户端运行，不接管用户预览。
import {mkdir,mkdtemp,readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {execFileSync} from 'node:child_process';
import {_electron} from '@playwright/test';
import {Quaternion,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import sharp from 'sharp';
import {READ_OPERATIONS,WRITE_OPERATIONS} from '../../web/labs/motion/core/control-schema.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const {sendQuery}=createRequire(import.meta.url)('../../desktop/control/client.cjs');
const {values}=parseArgs({options:{exe:{type:'string'}},strict:true});
if(!values.exe)throw new Error('需要 --exe <MotionDeckAcceptance.exe绝对路径>；本脚本不连接现有实例');
const exe=resolve(values.exe);
assert.equal(exe.split(/[\\/]/).at(-1),'MotionDeckAcceptance.exe','只运行验收身份');
await stat(exe);
const baseOutput=join(root,'output/command-handbook');await mkdir(baseOutput,{recursive:true});
const output=await mkdtemp(join(baseOutput,'run-'));
const personal=join(output,'personal');await mkdir(personal);
const env={...process.env,MOTIONDECK_DATA_DIR:personal,MOTIONDECK_DEV_AUTO_CONTROL:'1'};
delete env.ELECTRON_RUN_AS_NODE;
const calls=[],coverage=new Set();let client;
async function command(operation,args={}){
 const bound=WRITE_OPERATIONS.includes(operation)||operation==='sequence.sample';
 const state=bound?await sendQuery(personal,{operation:'session.inspect'}):null;
 if(state)assert.equal(state.ok,true,JSON.stringify(state));
 const request={operation,args,requestId:randomUUID(),...(bound?{modelKey:state.result.modelKey,expectedRevision:state.revision}:{})};
 // 不含令牌；记录可复核的实际请求与结果，不输出整份骨架到终端。
 const reply=await sendQuery(personal,request);calls.push({request,reply});
 assert.equal(reply.ok,true,JSON.stringify(reply));coverage.add(operation);return reply.result;
}
async function pages(operation){let entries=[],offset=0;for(;;){const r=await command(operation,{offset,limit:100});entries.push(...r.entries);offset+=r.entries.length;if(offset>=r.total)return entries;assert(r.entries.length>0);}}
try{
 client=await _electron.launch({executablePath:exe,args:['--smoke-hidden'],env,timeout:30000});
 const deadline=Date.now()+30000;
 for(;;){try{const s=await command('session.inspect');if(s.status==='ready'&&s.modelKey)break;}catch(error){if(Date.now()>deadline)throw error;}if(Date.now()>deadline)throw new Error('模型就绪超时');await new Promise(r=>setTimeout(r,500));}
 const initial=await command('session.inspect');assert.equal(initial.draft,null);assert.equal(initial.counts.items,0);
 const model=await command('model.inspect'),rig=await pages('rig.list'),library=await pages('library.list');
 const clip=library.find(x=>x.kind==='action'&&x.name==='Idle_A');assert(clip,'教学示例需要Mesh2Motion的Idle_A站立底姿，不以其他待机静默代替');
 await command('pose.fromClip',{clipId:clip.id,time:0});
 const base=(await command('model.inspect')).rootTransform;assert(base);
 const bone=rig.find(b=>/head/i.test(b.name))??rig.find(b=>b.id!==base.id);assert(bone);
 const currentRig=await pages('rig.list'),local=currentRig.find(b=>b.id===bone.id);
 const q=new Quaternion().fromArray(local.quaternion).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.08)).normalize().toArray();
 await command('pose.setBones',{changes:[{id:bone.id,quaternion:q,position:local.position}]});
 await command('pose.undo');await command('pose.redo');await command('pose.undo');
 const single=await command('view.capture',{views:['right'],options:{width:640,height:480,framing:'pose',ground:true,skeleton:true}});
 const standing=await command('pose.save',{name:'教学·站立',confirmed:true});
 await command('pose.fromLibrary',{poseId:standing.id});await command('pose.discard');
 await command('pose.fromLibrary',{poseId:standing.id});
 await command('pose.setRootTransform',{position:[base.position[0],base.position[1]+.5,base.position[2]],quaternion:base.quaternion});
 const high=await command('pose.save',{name:'教学·高度示意（非自然跳跃）',confirmed:true});
 const first=await command('timeline.append',{assetId:standing.id,duration:.2,interpolation:'continuous'});
 const apex=await command('timeline.append',{assetId:high.id,duration:0,transition:.4,interpolation:'continuous'});
 const last=await command('timeline.append',{assetId:standing.id,duration:.2,transition:.4,interpolation:'continuous'});
 await command('timeline.inspect');
 await command('preview.setRootMotion',{horizontal:true,vertical:false});
 await command('preview.setRootMotion',{horizontal:true,vertical:true});
 await command('preview.sequence',{time:.4,playing:false});
 await command('pose.fromSequence',{time:.4});const middle=await command('pose.save',{name:'教学·过渡取帧',confirmed:true});
 await command('timeline.insertPoseAt',{time:.4,poseId:middle.id});
 assert(Math.abs((await command('timeline.inspect')).duration-1.2)<1e-8);
 await command('timeline.undo');await command('timeline.redo');
 await command('timeline.resize',{id:apex.id,duration:.05});await command('timeline.undo');
 await command('timeline.transition',{id:last.id,duration:.3});await command('timeline.undo');
 const temp=await command('timeline.append',{assetId:clip.id,duration:.5,transition:0});
 await command('timeline.trim',{id:temp.id,in:0,out:.1,duration:.2});
 await command('timeline.move',{id:temp.id,targetId:first.id,after:false});
 await command('timeline.undo');await command('timeline.remove',{ids:[temp.id]});
 await command('preview.sequence',{time:0,playing:true});await command('preview.sequence',{time:.3,playing:false});
 const before=await command('session.inspect');
 const samples=await command('sequence.sample',{start:0,end:1.2,step:.05,boneIds:[base.id]});
 const batch=await command('view.captureSequence',{times:[0,.4,.6,1.2],views:['right','front-right'],options:{width:640,height:480,framing:'motion',ground:true}});
 const video=await command('export.video',{name:'教学·命令闭环',confirmed:true,start:0,end:1.2,view:'front-right',options:{width:640,height:480,framing:'motion',ground:true}});
 assert.deepEqual(await command('session.inspect'),before,'采样和媒体必须恢复状态');
 const saved=await command('timeline.saveAction',{name:'教学·命令闭环（非自然跳跃）',confirmed:true});
 const glb=await command('export.glb',{name:'教学·命令闭环',confirmed:true});
 const original=calls.find(x=>x.request.operation==='timeline.saveAction');
 const status=await command('request.status',{requestId:original.request.requestId});assert.equal(status.status,'done');
 const glbPath=glb.file?.path??glb.path;assert(glbPath,JSON.stringify(glb));
 const bytes=await readFile(glbPath),parsed=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 assert(parsed.animations.length>0);assert(parsed.animations[0].tracks.some(t=>t.name.endsWith('.position')));
 const index=JSON.parse(await readFile(batch.manifest.path,'utf8'));assert.equal(index.frames.length,8);
 for(const file of [...single.files,...batch.files,video.file]){
  const data=await readFile(file.path);assert.equal(createHash('sha256').update(data).digest('hex'),file.sha256);
  if(file.path.endsWith('.png')){const m=await sharp(data).metadata();assert.equal(m.width,640);assert.equal(m.height,480);}
 }
 const ffprobe=process.env.FFMPEG_BIN?join(process.env.FFMPEG_BIN,'ffprobe.exe'):'ffprobe.exe';
 const media=JSON.parse(execFileSync(ffprobe,['-v','error','-count_frames','-show_streams','-show_format','-of','json',video.file.path],{encoding:'utf8'}));
 assert(Number(media.streams.find(s=>s.codec_type==='video').nb_read_frames)>8);
 const ffmpeg=process.env.FFMPEG_BIN?join(process.env.FFMPEG_BIN,'ffmpeg.exe'):'ffmpeg.exe';
 const hashes=execFileSync(ffmpeg,['-v','error','-i',video.file.path,'-f','framemd5','-'],{encoding:'utf8'}).split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1).trim());
 assert(new Set(hashes).size>3,'视频必须存在动态画面');
 const missing=[...READ_OPERATIONS,...WRITE_OPERATIONS].filter(op=>!coverage.has(op));assert.deepEqual(missing,[]);
 await writeFile(join(output,'proof.json'),JSON.stringify({testedAt:new Date().toISOString(),exe,personal,covered:[...coverage],calls,single,batch,video,glb,saved,samples,media},null,2),'utf8');
 console.log(JSON.stringify({covered:coverage.size,proof:join(output,'proof.json'),images:batch.files.length,video:video.file.path,glb:glbPath}));
}finally{
 await writeFile(join(output,'calls.json'),JSON.stringify(calls,null,2),'utf8');
 if(client)await client.close();
}
