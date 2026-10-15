import {packager} from '@electron/packager';
import {mkdir,mkdtemp,cp,readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,join,relative,sep} from 'node:path';
import {valid} from 'semver';
import {packageSkills} from './package-skills.mjs';

const root=resolve(import.meta.dirname,'..'),variant=process.env.MOTIONDECK_BUILD_VARIANT??'public';
if(!['public','acceptance'].includes(variant))throw new Error('构建类型无效');
const output=resolve(root,'output',process.env.MOTIONDECK_BUILD_OUTPUT??'desktop');
if(!output.startsWith(join(root,'output')+sep))throw new Error('构建输出必须位于项目output内');
await import('./build-desktop-icons.mjs');
await import('./verify-assets.mjs');
await mkdir(output,{recursive:true});
// 使用显式暂存清单，打包源目录绝不指向整个仓库或开发node_modules。
const stage=await mkdtemp(join(output,'stage-'));
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const version=process.env.MOTIONDECK_BUILD_VERSION??pkg.version;if(!valid(version))throw new Error('构建版本无效');
const productName=variant==='acceptance'?'MotionDeckAcceptance':'MotionDeck',appId=variant==='acceptance'?'dev.motiondeck.acceptance':'dev.motiondeck.desktop';
await cp(join(root,'desktop'),join(stage,'desktop'),{recursive:true});
await cp(join(root,'web'),join(stage,'web'),{recursive:true,filter:file=>!relative(join(root,'web'),file).split(/[\\/]/).some(part=>part.startsWith('fullbody'))});
for(const resource of JSON.parse(await readFile(join(root,'fixtures/manifest.json'),'utf8'))){
 const target=resolve(stage,resource.path);if(!target.startsWith(stage+'/')&&!target.startsWith(stage+'\\'))throw new Error('资源超出暂存目录');
 await mkdir(resolve(target,'..'),{recursive:true});await cp(join(root,resource.path),target);
}
await cp(join(root,'fixtures/manifest.json'),join(stage,'fixtures/manifest.json'));
for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md'])await cp(join(root,file),join(stage,file));
await writeFile(join(stage,'package.json'),JSON.stringify({name:variant==='acceptance'?'motiondeck-acceptance':'motion-deck',productName,version,license:'MIT',main:'desktop/main.cjs',description:pkg.description},null,2)+'\n','utf8');
const paths=await packager({dir:stage,name:productName,platform:'win32',arch:'x64',electronVersion:pkg.devDependencies.electron,out:output,icon:join(root,'desktop/assets/motiondeck.ico'),overwrite:true,asar:{unpack:'**/desktop/control/protect-directory.ps1'},prune:false,win32metadata:{CompanyName:'MotionDeck',FileDescription:'MotionDeck 动作编排工具',ProductName:productName}});
const packageDir=paths[0],archive=join(packageDir,'resources/app.asar');
// 技能保留在归档外，NSIS沿用整个免安装目录，用户可直接复制使用。
const skills=await packageSkills(join(packageDir,'skills'));
// 官方Node模式复用客户端内置运行时；命令子进程不创建GUI或初始化素材库。
await writeFile(join(packageDir,'MotionDeck-command.cmd'),['@echo off','setlocal','set ELECTRON_RUN_AS_NODE=1',`"%~dp0${productName}.exe" "%~dp0resources\\app.asar\\desktop\\control\\command.cjs" %*`,'exit /b %errorlevel%',''].join('\r\n'),'ascii');
await writeFile(join(packageDir,'resources/motiondeck-distribution.json'),JSON.stringify({format:'motiondeck-distribution',kind:'portable',variant,productName,appId,version})+'\n','utf8');
export const packaged={root,packageDir,stage,output,version,productName,appId,variant,electronVersion:pkg.devDependencies.electron};
console.log(JSON.stringify({packageDir,executable:join(packageDir,productName+'.exe'),archive,archiveBytes:(await stat(archive)).size,skills:skills.skills.map(({name,version})=>({name,version})),stage},null,2));
