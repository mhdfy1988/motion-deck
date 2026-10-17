import {build} from 'esbuild';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readdir,readFile} from 'node:fs/promises';

const root=resolve(import.meta.dirname,'..');
const entries={
 workbench:['web/labs/motion/motion.js'],
 experiment:['web/labs/motion/fullbody.js'],
 // 工作线程、命令启动器及更新器有运行时入口，不能仅靠main的静态导入发现。
 desktop:['desktop/main.cjs','desktop/preload.cjs','desktop/control/cli.cjs','desktop/control/command.cjs','desktop/storage/worker.cjs','desktop/updates/runtime.cjs'],
 tooling:['scripts/build-motion-lab.mjs','scripts/build-fullbody-trial.mjs','scripts/package-desktop.mjs','scripts/package-installer.mjs','scripts/serve-motion-lab.mjs','scripts/local-acceptance-gate.mjs','scripts/start-desktop-dev.mjs','scripts/motion-command.mjs','scripts/release-gate.mjs','scripts/github-release.mjs','scripts/verify-published-release.mjs']
};

async function sourceInventory(directory){
 const files=[];
 for(const entry of await readdir(resolve(root,directory),{withFileTypes:true})){
  const path=directory+'/'+entry.name;
  if(entry.isDirectory())files.push(...await sourceInventory(path));
  else if(/\.(?:js|mjs|cjs|css|html)$/.test(entry.name)&&!/(?:\.bundle\.|\.generated\.)/.test(entry.name)){
   const text=await readFile(resolve(root,path),'utf8');
   files.push({path,lines:text.split('\n').length,bytes:Buffer.byteLength(text)});
  }
 }
 return files;
}

// 只分析静态依赖，不启动桌面、HTTP服务或打包任务；第三方包保持外部依赖。
export async function auditModuleStructure(){
 const report={};
 for(const [name,entryPoints] of Object.entries(entries)){
  const {metafile}=await build({absWorkingDir:root,entryPoints,bundle:true,packages:'external',platform:name==='workbench'||name==='experiment'?'browser':'node',format:'esm',write:false,metafile:true,outdir:resolve(root,'output/module-audit')});
  const graph=new Map(Object.entries(metafile.inputs).map(([path,input])=>[path.replaceAll('\\','/'),input.imports.filter(item=>!item.external).map(item=>item.path.replaceAll('\\','/'))]));
  const active=new Set(),done=new Set(),stack=[],cycles=[];
  function visit(path){
   if(active.has(path)){cycles.push([...stack.slice(stack.indexOf(path)),path]);return;}
   if(done.has(path))return;
   active.add(path);stack.push(path);
   for(const dependency of graph.get(path)??[])visit(dependency);
   stack.pop();active.delete(path);done.add(path);
  }
  for(const path of graph.keys())visit(path);
  const directories={};
  for(const path of graph.keys()){
   const directory=path.includes('/')?path.slice(0,path.lastIndexOf('/')):'.';
   directories[directory]=(directories[directory]??0)+1;
  }
  report[name]={entries:entryPoints,modules:graph.size,edges:[...graph.values()].reduce((sum,items)=>sum+items.length,0),cycles,directories};
 }
 const files=(await Promise.all(['web/labs/motion','desktop','scripts','tests','experiments'].map(sourceInventory))).flat();
 return {graphs:report,inventory:{files:files.length,bytes:files.reduce((sum,file)=>sum+file.bytes,0),largest:files.sort((a,b)=>b.bytes-a.bytes).slice(0,12)}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const report=await auditModuleStructure();
 console.log(JSON.stringify(report,null,2));
 if(Object.values(report.graphs).some(group=>group.cycles.length))process.exitCode=1;
}
