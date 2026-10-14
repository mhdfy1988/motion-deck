import {readFile,mkdir,mkdtemp,writeFile,stat} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {_electron as electron} from '@playwright/test';
const root=resolve(import.meta.dirname,'..'),pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8')),tag='v'+pkg.version;
const repository='https://github.com/mhdfy1988/motion-deck',directory=join(root,'output/desktop/installer');
const response=await fetch('https://api.github.com/repos/mhdfy1988/motion-deck/releases/tags/'+tag,{headers:{accept:'application/vnd.github+json'}});if(!response.ok)throw new Error('公开发布不可读 '+response.status);const release=await response.json();if(release.draft!==false||release.prerelease!==true||release.tag_name!==tag)throw new Error('发布状态不符');
const files=[`MotionDeck-${pkg.version}-setup-x64.exe`,`MotionDeck-${pkg.version}-setup-x64.exe.blockmap`,'latest.yml','SHA256SUMS.txt'],proof=[];
for(const name of files){const local=await readFile(join(directory,name)),expected=createHash('sha256').update(local).digest('hex');const asset=release.assets.find(item=>item.name===name);if(!asset||asset.digest!=='sha256:'+expected||asset.size!==local.length)throw new Error('发布元数据不符 '+name);
 const downloaded=await fetch(repository+'/releases/download/'+tag+'/'+encodeURIComponent(name));if(!downloaded.ok)throw new Error('匿名下载失败 '+name+' '+downloaded.status);const hash=createHash('sha256');let bytes=0;for await(const chunk of downloaded.body){hash.update(chunk);bytes+=chunk.length;}if(bytes!==local.length||hash.digest('hex')!==expected)throw new Error('匿名下载内容不符 '+name);proof.push({name,bytes,sha256:expected});console.log('Anonymous download verified '+name+' '+bytes);
}
function command(executable,args){return new Promise((resolve,reject)=>{const child=spawn(executable,args,{windowsHide:true,stdio:'ignore'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('验收安装器退出 '+code)));});}
// 仅安装独立验收身份，真实公开更新源只检查，不将正式安装器装进验收目录。
const installer=join(root,'output/update-acceptance/old/installer/MotionDeckAcceptance-0.0.1-setup-x64.exe');await stat(installer);const base=await mkdtemp(join(root,'output/update-acceptance','public-feed-')),installDir=join(base,'installed');if(!installDir.startsWith(join(root,'output/update-acceptance')+sep))throw new Error('安装目标越界');
let client;
try{await command(installer,['/S','/currentuser','/D='+installDir]);const env={...process.env,MOTIONDECK_DATA_DIR:join(base,'personal')};delete env.MOTIONDECK_TEST_UPDATE_URL;delete env.ELECTRON_RUN_AS_NODE;client=await electron.launch({executablePath:join(installDir,'MotionDeckAcceptance.exe'),args:['--smoke-hidden'],env,timeout:30000});const page=await client.firstWindow();await page.waitForSelector('#desktopUpdates');const state=await page.evaluate(()=>motionDeckDesktop.checkUpdate());if(state.status!=='available'||state.nextVersion!==pkg.version)throw new Error('真实GitHub更新源未识别发布版本 '+JSON.stringify(state));proof.push({publicFeed:state});await client.close();client=undefined;
}finally{if(client)await client.close();await command(join(installDir,'Uninstall MotionDeckAcceptance.exe'),['/S','_?='+installDir]);}
await mkdir(join(root,'output/acceptance'),{recursive:true});await writeFile(join(root,'output/acceptance/published-release-proof.json'),JSON.stringify({url:release.html_url,tag,verifiedAt:new Date().toISOString(),proof},null,2)+'\n','utf8');console.log('Published release and official GitHub feed verified');
