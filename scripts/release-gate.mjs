import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {valid} from 'semver';
import yaml from 'js-yaml';
const root=resolve(import.meta.dirname,'..'),pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
if(!valid(pkg.version))throw new Error('版本无效');
const changelog=await readFile(join(root,'CHANGELOG.md'),'utf8'),heading='## ['+pkg.version+'] - ',sections=changelog.split(/^## /m);
const found=sections.filter(section=>section.startsWith('['+pkg.version+'] - '));
if(found.length!==1||!changelog.includes('## [Unreleased]'))throw new Error('缺少或重复版本段');
const section=found[0],date=section.match(/^\[[^\]]+\] - (\d{4}-\d{2}-\d{2})\r?\n/)?.[1];
if(!date||new Date(date).toISOString().slice(0,10)!==date)throw new Error('发布日期无效');
for(const category of section.split(/^### /m).slice(1)){const name=category.split(/\r?\n/)[0];if(!['Added','Changed','Deprecated','Removed','Fixed','Security'].includes(name)||!/^[-*] .+/m.test(category))throw new Error('分类或分类内容无效');}
const directory=join(root,'output/desktop/installer'),filename=`MotionDeck-${pkg.version}-setup-x64.exe`,meta=yaml.load(await readFile(join(directory,'latest.yml'),'utf8'));
const bytes=await readFile(join(directory,filename));if(meta.version!==pkg.version||meta.path!==filename||meta.sha512!==createHash('sha512').update(bytes).digest('base64')||meta.files[0].size!==bytes.length)throw new Error('更新元数据与安装包不匹配');
const files=[filename,filename+'.blockmap','latest.yml'],hashes=[];
for(const file of files){const raw=await readFile(join(directory,file));if(!(await stat(join(directory,file))).isFile())throw new Error('产物非文件');hashes.push(createHash('sha256').update(raw).digest('hex')+'  '+file);}
await writeFile(join(directory,'SHA256SUMS.txt'),hashes.join('\n')+'\n','utf8');
await writeFile(join(directory,'release-notes.md'),section.replace(/^\[[^\]]+\] - [^\n]+\n/,'').replace(/^\[.*\]:.*$/gm,'').trim()+'\n','utf8');
console.log(JSON.stringify({version:pkg.version,date,installerBytes:bytes.length,checksums:hashes},null,2));
