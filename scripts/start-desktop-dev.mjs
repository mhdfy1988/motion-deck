import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import electron from 'electron';

const root=resolve(import.meta.dirname,'..');
const dataDir=process.env.MOTIONDECK_DATA_DIR??resolve(root,'output/dev-preview/personal');
const child=spawn(electron,['.'],{cwd:root,stdio:'inherit',env:{...process.env,MOTIONDECK_DATA_DIR:dataDir,MOTIONDECK_DEV_AUTO_CONTROL:'1'}});
child.on('error',error=>{console.error('开发客户端启动失败',error);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
