import {build} from 'esbuild';
import {copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
await build({entryPoints:[resolve(root,'web/labs/motion/fullbody.js')],outfile:resolve(root,'web/labs/motion/fullbody.bundle.js'),bundle:true,format:'esm',minify:true,target:'es2022',legalComments:'eof'});
await copyFile(resolve(root,'node_modules/closed-chain-ik/LICENSE'),resolve(root,'web/licenses/closed-chain-ik.txt'));
await copyFile(resolve(root,'node_modules/gl-matrix/LICENSE.md'),resolve(root,'web/licenses/gl-matrix.txt'));
await copyFile(resolve(root,'node_modules/svd-js/LICENSE'),resolve(root,'web/licenses/svd-js.txt'));
// linear-solve分发包只声明MIT、无独立LICENSE，保留上游README及包元数据。
await copyFile(resolve(root,'node_modules/linear-solve/README.md'),resolve(root,'web/licenses/linear-solve-readme.txt'));
await copyFile(resolve(root,'node_modules/linear-solve/package.json'),resolve(root,'web/licenses/linear-solve-package.json'));
console.log('Built isolated full-body trial');
