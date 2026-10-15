import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {shouldAutoEnableControl}=createRequire(import.meta.url)('../../desktop/control/dev-policy.cjs');

test('开发控制仅在显式隔离资料的开发或验收实例自动开放',()=>{
 const base={flag:'1',dataDir:'D:\\isolated',packaged:true,packageName:'motiondeck-acceptance'};
 assert.equal(shouldAutoEnableControl(base),true);
 assert.equal(shouldAutoEnableControl({...base,packaged:false,packageName:'motion-deck'}),true);
 for(const change of [{flag:'0'},{dataDir:undefined},{packageName:'motion-deck'}])assert.equal(shouldAutoEnableControl({...base,...change}),false);
});
