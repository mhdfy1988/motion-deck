import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const {resolveResource}=createRequire(import.meta.url)('../../desktop/resource-policy.cjs');
test('桌面资源仅加载应用文件，拒绝跨主机、穿越和写请求',()=>{
 const root=resolve('output/desktop-fixture');
 assert.equal(resolveResource({url:'motiondeck://app/',method:'GET'},root).file,resolve(root,'web/labs/motion/index.html'));
 assert.equal(resolveResource({url:'motiondeck://app/fixtures/test.glb',method:'HEAD'},root).file,resolve(root,'fixtures/test.glb'));
 for(const [url,method] of [['motiondeck://evil/fixtures/test.glb','GET'],['motiondeck://app/fixtures/%2e%2e%5csecret','GET'],['motiondeck://app/fixtures/%252e%252e/secret','POST'],['file:///secret','GET']])assert.notEqual(resolveResource({url,method},root).status,200);
 assert.equal(resolveResource({url:'motiondeck://app/index.html',method:'POST'},root).status,405);
});
