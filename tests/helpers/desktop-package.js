import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';

// 自动授权验收不得混用正式包；缺少显式身份时立即失败，不回落开发源码。
export async function desktopPackage(variant){
 const variable=variant==='acceptance'?'MOTIONDECK_DEV_PREVIEW_EXE':'MOTIONDECK_PACKAGED_EXE';
 if(!['public','acceptance'].includes(variant))throw new Error('未知发行身份');
 const executable=process.env[variable];if(!executable)throw new Error('必须指定'+variable);
 const metadata=JSON.parse(await readFile(join(dirname(executable),'resources/motiondeck-distribution.json'),'utf8'));
 if(metadata.format!=='motiondeck-distribution'||metadata.variant!==variant)throw new Error(variable+'发行身份不符，预期'+variant);
 return executable;
}
