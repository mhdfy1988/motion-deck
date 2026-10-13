import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),manifest=JSON.parse(await readFile(resolve(root,'fixtures/manifest.json'),'utf8'));
for(const item of manifest){
 const file=resolve(root,item.path);if(!file.startsWith(resolve(root,'fixtures')+sep))throw new Error('资源路径超出fixtures');
 const bytes=await readFile(file);if(bytes.length!==item.bytes||createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('资源校验失败：'+item.path);
}
console.log(`MotionDeck assets verified: ${manifest.length}`);
