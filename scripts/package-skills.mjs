import {readFile,writeFile,mkdir,lstat,cp} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {valid} from 'semver';
import {querySchema,READ_OPERATIONS,WRITE_OPERATIONS} from '../web/labs/motion/core/control-schema.js';

const root=resolve(import.meta.dirname,'..');
export const skillFiles=['SKILL.md','LICENSE','references/command-guide.md','references/command-schema.json','references/jump-acceptance.md','references/tempo-review.md','references/mesh2motion-practice.md'];
// 协议快照由客户端唯一协议定义生成，不手写第二套命令参数。
export const skillSchema=()=>JSON.stringify({format:'motiondeck-skill-commands',protocolVersion:1,operations:{read:READ_OPERATIONS,write:WRITE_OPERATIONS},query:querySchema},null,2)+'\n';

export async function packageSkills(destination,{source=join(root,'skills')}={}){
 const skill='motiondeck-director',base=join(source,skill),entry=await readFile(join(base,'SKILL.md'),'utf8');
 // 只识别本项目固定的版本元数据行，不将其当作通用YAML解析器。
 const version=entry.match(/^metadata:\r?\n  version: "([^"]+)"\r?$/m)?.[1];
 if(!version||!valid(version))throw new Error('技能缺少合法metadata.version');
 if(!entry.startsWith('---\nname: '+skill+'\n')&&!entry.startsWith('---\r\nname: '+skill+'\r\n'))throw new Error('技能名称无效');
 const contents=new Map();
 for(const file of skillFiles){
  const path=join(base,file);
  if(!(await lstat(path)).isFile())throw new Error('技能资源必须为普通文件：'+file);
  const bytes=await readFile(path);contents.set(file,bytes);
  if(file.endsWith('.md')){
   const text=bytes.toString('utf8');
   if(/[A-Z]:[\\/]/i.test(text)||/file:\/\//i.test(text))throw new Error('技能含本机绝对路径：'+file);
   for(const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
    const target=resolve(dirname(path),match[1].split('#')[0]),local=relative(base,target).replaceAll('\\','/');
    if(isAbsolute(local)||local==='..'||local.startsWith('../')||!skillFiles.includes(local))throw new Error('技能引用未随包提供：'+match[1]);
   }
  }
 }
 if(contents.get('references/command-schema.json').toString('utf8')!==skillSchema())throw new Error('技能命令快照过期；运行node scripts/package-skills.mjs --refresh-schema，并检查技能版本');
 const files=[];
 // 仅在全部校验成功后复制显式清单，排除缓存、个人凭据与本地制作输出。
 for(const [file,bytes] of contents){
  const target=join(destination,skill,file);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);
  files.push({path:skill+'/'+file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 await cp(join(source,'使用说明.md'),join(destination,'使用说明.md'));
 const manifest={format:'motiondeck-skills',skills:[{name:skill,version,protocolVersion:1,files}]};
 await writeFile(join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
 return manifest;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 if(process.argv.slice(2).join(' ')!=='--refresh-schema')throw new Error('仅支持--refresh-schema；分发由桌面打包调用');
 await writeFile(join(root,'skills/motiondeck-director/references/command-schema.json'),skillSchema(),'utf8');
 console.log('已从当前协议生成技能命令快照，请同步检查技能版本。');
}
