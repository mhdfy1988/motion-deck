import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {packageSkills,skillFiles} from '../../scripts/package-skills.mjs';

const root=resolve(import.meta.dirname,'../..');
test('技能可独立复制到含空格中文路径，版本与文件哈希一致，额外文件不会泄漏',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'motiondeck-skill-'));
 try{
  const source=join(temp,'源码'),destination=join(temp,'独立 安装','skills');
  await cp(join(root,'skills'),source,{recursive:true});
  await writeFile(join(source,'motiondeck-director','private-token.txt'),'must-not-package');
  const manifest=await packageSkills(destination,{source});
  const version=(await readFile(join(source,'motiondeck-director/SKILL.md'),'utf8')).match(/  version: "([^"]+)"/)[1];
  assert.equal(manifest.skills[0].version,version);
  assert.equal(manifest.skills[0].files.length,skillFiles.length);
  for(const file of manifest.skills[0].files){
   const bytes=await readFile(join(destination,file.path));
   assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);assert.equal(bytes.length,file.bytes);
  }
  await assert.rejects(readFile(join(destination,'motiondeck-director/private-token.txt')),{code:'ENOENT'});
  assert.match(await readFile(join(destination,'使用说明.md'),'utf8'),/整个/);
 }finally{await rm(temp,{recursive:true,force:true});}
});

for(const [label,file,transform,expected] of [
 ['非法版本','SKILL.md',text=>text.replace(/version: "[^"]+"/,'version: "invalid"'),/metadata.version/],
 ['本机路径','SKILL.md',text=>text+'\nC:/private/secret\n',/本机绝对路径/],
 ['失效引用','SKILL.md',text=>text+'\n[缺失](references/missing.md)\n',/引用未随包/],
 ['过期命令','references/command-schema.json',text=>text+' ',/快照过期/],
])test('打包拒绝'+label,async()=>{
 const temp=await mkdtemp(join(tmpdir(),'motiondeck-skill-'));
 try{
  const source=join(temp,'source'),destination=join(temp,'result');
  await cp(join(root,'skills'),source,{recursive:true});
  const path=join(source,'motiondeck-director',file);await writeFile(path,transform(await readFile(path,'utf8')));
  await assert.rejects(packageSkills(destination,{source}),expected);
  await assert.rejects(readFile(join(destination,'manifest.json')),{code:'ENOENT'});
 }finally{await rm(temp,{recursive:true,force:true});}
});
