import {readFile,readdir,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join,basename} from 'node:path';
import config from '../playwright.config.js';

// 复用Playwright真实JSON报告，不以手填“通过”或定向少量测试替代完整验收。
export function validateLocalReport(report,minimum,required){
 const start=Date.parse(report.stats?.startTime),counts=report.stats;
 if(!Number.isFinite(start)||start>Date.now()||!Number.isInteger(counts?.expected)||counts.expected<minimum||!Number.isFinite(counts.duration)||counts.duration<=0||counts.unexpected!==0||counts.flaky!==0||counts.skipped!==0||report.errors?.length)throw new Error('本地完整验收未通过或有跳过');
 const files=new Set();const collect=suites=>{for(const suite of suites??[]){if(suite.file)files.add(basename(suite.file.replaceAll('\\','/')));collect(suite.suites);}};collect(report.suites);
 if(required.some(name=>!files.has(name)))throw new Error('本地报告缺少测试文件');
 return start;
}
export async function assertLocalAcceptance(root){
 const desktopFiles=(await readdir(join(root,'tests/desktop'))).filter(name=>name.endsWith('.spec.js'));
 const specs=[['local-web.json',138,config.testMatch],['local-desktop.json',31,desktopFiles]];
 let earliest=Infinity;const counts={};
 for(const [file,minimum,required] of specs){
  const report=JSON.parse(await readFile(join(root,'output/acceptance',file),'utf8'));
  const start=validateLocalReport(report,minimum,required);
  counts[file]=report.stats.expected;
  earliest=Math.min(earliest,start);
 }
 // NUL分隔保留中文、空格及引号，不把Git展示用转义文本当作真实路径。
 const paths=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard','web','desktop','fixtures','skills','tests','package.json','package-lock.json','playwright.config.js','playwright.desktop.config.js','scripts','.github/workflows'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
 for(const path of paths)if((await stat(join(root,path))).mtimeMs>earliest)throw new Error('验收后实现或测试已变更，需重跑：'+path);
 const archive=join(root,'output/desktop/MotionDeck-win32-x64/resources/app.asar');
 if((await stat(archive)).mtimeMs>earliest)throw new Error('验收后客户端已重新打包，需重跑');
 return {web:counts['local-web.json'],desktop:counts['local-desktop.json']};
}
