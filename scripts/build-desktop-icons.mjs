import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {icons} from '../web/icons-data.js';

const root=resolve(import.meta.dirname,'..'),output=join(root,'desktop/assets');
// 复用标题栏的Lucide胶片标识；转换库只用于构建，不进入客户端。
const film=icons.film.replace('stroke="currentColor"','stroke="#72b7ff"').replace('width="24"','width="192"').replace('height="24"','height="192"');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect x="8" y="8" width="240" height="240" rx="48" fill="#191c20"/><g transform="translate(32 32)">${film}</g></svg>`;
await mkdir(output,{recursive:true});
await writeFile(join(output,'motiondeck.svg'),svg+'\n','utf8');
const sizes=[16,20,24,32,40,48,64,128,256];
const images=await Promise.all(sizes.map(size=>sharp(Buffer.from(svg)).resize(size,size).png().toBuffer()));
await writeFile(join(output,'motiondeck.png'),images.at(-1));
await writeFile(join(output,'motiondeck.ico'),await pngToIco(images));
console.log(`MotionDeck桌面图标已生成：${sizes.join(', ')}像素`);
