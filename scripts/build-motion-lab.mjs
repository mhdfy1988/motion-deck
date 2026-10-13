import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import {schema,catalogSchema} from '../web/labs/motion/library-schema.js';
const root=resolve(import.meta.dirname,'..');
// 沿用项目已有的独立校验器生成方式，浏览器不使用动态代码求值。
const ajv=new Ajv({strict:false,allowUnionTypes:true,code:{source:true,esm:true}});
for(const [name,definition] of [['library',schema],['catalog',catalogSchema]]){
 const validator=await build({stdin:{contents:standaloneCode(ajv,ajv.compile(definition)),resolveDir:root,sourcefile:`motion-${name}-validator.js`},bundle:true,format:'esm',platform:'browser',write:false});
 await writeFile(resolve(root,`web/labs/motion/${name}-validator.generated.js`),validator.outputFiles[0].text,'utf8');
}
await build({entryPoints:[resolve(root,'web/labs/motion/motion.js')],outfile:resolve(root,'web/labs/motion/motion.bundle.js'),bundle:true,format:'esm',minify:true,target:'es2022',legalComments:'eof'});
await mkdir(resolve(root,'web/licenses'),{recursive:true});await writeFile(resolve(root,'web/licenses/three.txt'),await readFile(resolve(root,'node_modules/three/LICENSE'),'utf8'),'utf8');
console.log('Built local 3D motion lab');
