// 按抽取时记录的哈希只读核对源目录，不作为启动或构建依赖。
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
if(!process.argv[2])throw new Error('请显式提供原项目目录');
const source=resolve(process.argv[2]),root=resolve(import.meta.dirname,'..'),proofs=JSON.parse(await readFile(resolve(root,'docs/extraction-proofs.json'),'utf8'));
for(const item of proofs){const path=resolve(source,item.source);if(!path.startsWith(source+sep))throw new Error('核对路径超出源目录');const hash=createHash('sha256').update(await readFile(path)).digest('hex');if(hash!==item.sha256)throw new Error('源文件已变化：'+item.source);}
console.log(`Source unchanged: ${proofs.length} files`);
