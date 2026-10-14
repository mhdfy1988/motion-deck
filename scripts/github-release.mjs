// 一次性发布运维脚本：Node官方fetch调用GitHub公开REST接口；沿用GCM，不另造OAuth。
import {spawnSync,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8')),mode=process.argv[2]??'status';
if(!['status','draft','publish','verify'].includes(mode))throw new Error('发布操作无效');
const credential=spawnSync('git',['-c','credential.interactive=never','credential','fill'],{cwd:root,input:'protocol=https\nhost=github.com\nusername=mhdfy1988\n\n',encoding:'utf8',windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});
if(credential.status!==0)throw new Error('无法读取已授权凭据，请由用户确认认证状态');
const token=credential.stdout.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9);if(!token)throw new Error('缺少已授权凭据');
const headers={accept:'application/vnd.github+json',authorization:'Bearer '+token,'X-GitHub-Api-Version':'2026-03-10'};
async function api(path,options={}){const response=await fetch('https://api.github.com'+path,{headers:{...headers,'content-type':'application/json'},...options});if(!response.ok)throw new Error('GitHub API '+response.status+' '+path);return response.json();}
const user=await api('/user');if(user.login!=='mhdfy1988')throw new Error('账号与用户确认不符');
const repository='/repos/mhdfy1988/motion-deck',sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(mode==='status'){const runs=await api(repository+'/actions/runs?head_sha='+sha),releases=await api(repository+'/releases');console.log(JSON.stringify({account:user.login,sha,runs:runs.workflow_runs.map(run=>({id:run.id,status:run.status,conclusion:run.conclusion,url:run.html_url})),releases:releases.map(release=>({id:release.id,tag:release.tag_name,draft:release.draft,url:release.html_url}))},null,2));}
else{
 const directory=join(root,'output/desktop/installer'),tag='v'+pkg.version;
 const releases=await api(repository+'/releases');let release=releases.find(item=>item.tag_name===tag);
 if(mode==='draft'){
  const runs=await api(repository+'/actions/runs?head_sha='+sha);if(!runs.workflow_runs.some(run=>run.status==='completed'&&run.conclusion==='success'))throw new Error('当前提交尚无成功远端门禁，拒绝发布');
  if(!release)release=await api(repository+'/releases',{method:'POST',body:JSON.stringify({tag_name:tag,target_commitish:sha,name:'MotionDeck '+tag+' · 未签名测试版',body:await readFile(join(directory,'release-notes.md'),'utf8'),draft:true,prerelease:true,generate_release_notes:false})});
  if(!release.draft)throw new Error('版本已公开，禁止覆盖发布文件');
  for(const name of [`MotionDeck-${pkg.version}-setup-x64.exe`,`MotionDeck-${pkg.version}-setup-x64.exe.blockmap`,'latest.yml','SHA256SUMS.txt']){
   const bytes=await readFile(join(directory,name)),digest='sha256:'+createHash('sha256').update(bytes).digest('hex');const existing=release.assets.find(asset=>asset.name===name);
   if(existing){if(existing.digest!==digest)throw new Error('已有发布资产内容不同，不自动删除：'+name);continue;}
   const response=await fetch(release.upload_url.split('{')[0]+'?name='+encodeURIComponent(name),{method:'POST',headers:{...headers,'content-type':'application/octet-stream','content-length':String(bytes.length)},body:bytes});if(!response.ok)throw new Error('上传失败 '+response.status+' '+name);const asset=await response.json();if(asset.digest!==digest||asset.size!==bytes.length)throw new Error('上传文件校验失败 '+name);console.log('Uploaded '+name+' '+asset.size);
  }
 }else{
  if(!release)throw new Error('发布不存在');
  for(const name of [`MotionDeck-${pkg.version}-setup-x64.exe`,`MotionDeck-${pkg.version}-setup-x64.exe.blockmap`,'latest.yml','SHA256SUMS.txt']){const bytes=await readFile(join(directory,name)),asset=release.assets.find(item=>item.name===name);if(!asset||asset.size!==bytes.length||asset.digest!=='sha256:'+createHash('sha256').update(bytes).digest('hex'))throw new Error('发布资产缺失或内容不符 '+name);}
  if(mode==='publish')release=await api(repository+'/releases/'+release.id,{method:'PATCH',body:JSON.stringify({draft:false,prerelease:true,make_latest:'false'})});
 }
 await writeFile(join(directory,'github-release.json'),JSON.stringify({id:release.id,url:release.html_url,tag,draft:release.draft,assets:release.assets.map(asset=>({name:asset.name,size:asset.size,digest:asset.digest,url:asset.browser_download_url}))},null,2)+'\n','utf8');console.log(JSON.stringify({url:release.html_url,draft:release.draft,tag},null,2));
}
