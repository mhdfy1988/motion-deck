import electronBuilder from 'electron-builder';
import {cp,mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {packaged} from './package-desktop.mjs';
import {serializeToYaml} from 'builder-util';

const {build}=electronBuilder;
const {packageDir,output,version,productName,appId,variant}=packaged;
await mkdir(join(output,'installer'),{recursive:true});
const input=await mkdtemp(join(output,'installer-input-'));await cp(packageDir,input,{recursive:true});
await writeFile(join(input,'resources/motiondeck-distribution.json'),JSON.stringify({format:'motiondeck-distribution',kind:'nsis',variant,productName,appId,version})+'\n','utf8');
// prepackaged跳过afterPack事件；按构建器PublishManager相同字段生成固定官方更新源。
await writeFile(join(input,'resources/app-update.yml'),serializeToYaml({provider:'github',owner:'mhdfy1988',repo:'motion-deck',updaterCacheDirName:variant==='acceptance'?'motiondeck-acceptance-updater':'motion-deck-updater'}),'utf8');
const files=await build({projectDir:packaged.root,prepackaged:input,win:['nsis'],x64:true,publish:'never',config:{appId,productName,electronVersion:packaged.electronVersion,extraMetadata:{version},directories:{output:join(output,'installer'),buildResources:join(packaged.root,'desktop')},publish:{provider:'github',owner:'mhdfy1988',repo:'motion-deck',releaseType:'prerelease'},win:{target:'nsis',icon:join(packaged.root,'desktop/assets/motiondeck.ico'),verifyUpdateCodeSignature:false},nsis:{oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,deleteAppDataOnUninstall:false,createDesktopShortcut:false,createStartMenuShortcut:variant==='public',runAfterFinish:false,packElevateHelper:false,include:join(packaged.root,'desktop/installer.nsh'),artifactName:`${productName}-${version}-setup-x64.exe`}}});
console.log(JSON.stringify({installerFiles:files,input},null,2));
