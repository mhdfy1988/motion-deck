import {build} from 'esbuild';
import {resolve,dirname,join} from 'node:path';
import {readFile,readdir,mkdir,cp,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const root=resolve(import.meta.dirname,'..');
await build({entryPoints:[resolve(root,'desktop/storage/worker.cjs')],outfile:resolve(root,'desktop/storage/worker.bundle.cjs'),bundle:true,platform:'node',format:'cjs',target:'node24',legalComments:'eof'});
const updateBuild=await build({entryPoints:[resolve(root,'desktop/updates/runtime.cjs')],outfile:resolve(root,'desktop/updates/runtime.bundle.cjs'),bundle:true,platform:'node',format:'cjs',external:['electron'],target:'node24',legalComments:'eof',metafile:true});
await mkdir(resolve(root,'output/build'),{recursive:true});
await writeFile(resolve(root,'output/build/update-runtime-meta.json'),JSON.stringify(updateBuild.metafile,null,2)+'\n','utf8');
// bundle不附带node_modules，但运行依赖的完整许可必须随包保留。
const seen=new Set(),licenses=[];
async function includeLicense(name,from){
 let directory=dirname(createRequire(from).resolve(name)),pkg;
 for(;;){try{pkg=JSON.parse(await readFile(join(directory,'package.json'),'utf8'));if(pkg.name===name)break;}catch(error){if(error.code!=='ENOENT')throw error;}const parent=dirname(directory);if(parent===directory)throw new Error('无法定位依赖许可：'+name);directory=parent;}
 const key=pkg.name+'-'+pkg.version;if(seen.has(key))return;seen.add(key);
 const files=(await readdir(directory)).filter(file=>/^licen[cs]e(?:\.|$)|^copying(?:\.|$)/i.test(file));
 // 上游1.0.5仅在package.json声明MIT，没有许可文件；保留原声明及明确标注来源的标准文本。
 if(!files.length&&key==='lazy-val-1.0.5'&&pkg.license==='MIT'){
  const target=resolve(root,'desktop/licenses',key);await mkdir(target,{recursive:true});
  await cp(join(directory,'package.json'),join(target,'package.json'));
  await cp(resolve(root,'desktop/license-supplements/lazy-val-1.0.5.txt'),join(target,'NOTICE.txt'));
  licenses.push({name:pkg.name,version:pkg.version,license:pkg.license,files:[key+'/package.json',key+'/NOTICE.txt'],source:'https://github.com/develar/lazy-val/blob/master/package.json'});
 }else{
 if(!files.length)throw new Error('缺少依赖许可：'+key);
 const target=resolve(root,'desktop/licenses',key);await mkdir(target,{recursive:true});for(const file of files)await cp(join(directory,file),join(target,file));licenses.push({name:pkg.name,version:pkg.version,license:pkg.license,files:files.map(file=>key+'/'+file)});
 }
 for(const dependency of Object.keys(pkg.dependencies??{}))await includeLicense(dependency,join(directory,'package.json'));
}
for(const name of ['ajv','proper-lockfile','electron-updater'])await includeLicense(name,resolve(root,'package.json'));
await writeFile(resolve(root,'desktop/licenses/manifest.json'),JSON.stringify(licenses,null,2)+'\n','utf8');
console.log('Built desktop storage worker');
