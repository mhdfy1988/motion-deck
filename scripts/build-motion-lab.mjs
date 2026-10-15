import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import {schema,catalogSchema} from '../web/labs/motion/core/library-schema.js';
import {querySchema,requestSchema,replySchema,mediaManifestSchema} from '../web/labs/motion/core/control-schema.js';
const root=resolve(import.meta.dirname,'..');
// 沿用项目已有的独立校验器生成方式，浏览器不使用动态代码求值。
const ajv=new Ajv({strict:false,allowUnionTypes:true,code:{source:true,esm:true}});
for(const [name,definition] of [['library',schema],['catalog',catalogSchema]]){
 const validator=await build({stdin:{contents:standaloneCode(ajv,ajv.compile(definition)),resolveDir:root,sourcefile:`motion-${name}-validator.js`},bundle:true,format:'esm',platform:'browser',write:false});
 await writeFile(resolve(root,`web/labs/motion/core/${name}-validator.generated.js`),validator.outputFiles[0].text,'utf8');
}
// 同一协议生成浏览器ESM与桌面CJS，运行时不使用动态编译。
await mkdir(resolve(root,'desktop/control'),{recursive:true});
const controlAjv=new Ajv({strict:false,code:{source:true,esm:true}});
for(const [name,definition] of [['query',querySchema],['request',requestSchema],['reply',replySchema],['mediaManifest',mediaManifestSchema]])controlAjv.addSchema(definition,name);
const controlSource=standaloneCode(controlAjv,{query:'query',request:'request',reply:'reply',mediaManifest:'mediaManifest'});
for(const [target,format,platform] of [['web/labs/motion/core/control-validator.generated.js','esm','browser'],['desktop/control/validators.generated.cjs','cjs','node']]){
 const compiled=await build({stdin:{contents:controlSource,resolveDir:root},bundle:true,format,platform,write:false});await writeFile(resolve(root,target),compiled.outputFiles[0].text,'utf8');
}
await build({entryPoints:[resolve(root,'web/labs/motion/motion.js')],outfile:resolve(root,'web/labs/motion/motion.bundle.js'),bundle:true,format:'esm',minify:true,target:'es2022',legalComments:'eof'});
await mkdir(resolve(root,'web/licenses'),{recursive:true});await writeFile(resolve(root,'web/licenses/three.txt'),await readFile(resolve(root,'node_modules/three/LICENSE'),'utf8'),'utf8');
console.log('Built local 3D motion lab');
await import('./build-desktop.mjs');
