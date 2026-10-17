import {test} from 'node:test';
import assert from 'node:assert/strict';
import {referenceFilename,bindPreviewMediaControls} from '../../web/labs/motion/ui/preview-media-controls.js';

test('文件名沿原非法字符替换、长度与固定视角后缀规则',()=>{
 assert.equal(referenceFilename('a/b:c','前视'),'a_b_c - 前视');assert.equal(referenceFilename(''),'动作参考');assert.equal(referenceFilename('字'.repeat(100)).length,60);
});
test('媒体按钮只转交意图、进度解析与锁还原，销毁解绑',()=>{
 const photoButton=new EventTarget(),recordButton=new EventTarget(),fitButton=new EventTarget(),indicator={hidden:true,textContent:''},controls={enabled:false},areas=[{inert:false},{inert:true}],calls=[];
 const view=bindPreviewMediaControls({photoButton,recordButton,fitButton,indicator,controls,getAreas:()=>areas,onPhoto:()=>calls.push('photo'),onRecord:()=>calls.push('record'),onFit:()=>calls.push('fit')});
 for(const button of [photoButton,recordButton,fitButton])button.dispatchEvent(new Event('click'));assert.deepEqual(calls,['photo','record','fit']);
 view.progress('检查视频编码器');assert.equal(indicator.hidden,true);view.progress('录像 1.2 秒 · MP4');assert.equal(indicator.hidden,false);assert.equal(indicator.textContent,'1.2 s');view.hideProgress();assert.equal(indicator.textContent,'1.2 s');view.hideProgress(true);assert.equal(indicator.textContent,'');
 const unlock=view.lock();assert.deepEqual(areas.map(area=>area.inert),[true,true]);unlock();assert.deepEqual(areas.map(area=>area.inert),[false,true]);assert.equal(controls.enabled,false);
 view.stopRequested();assert.equal(recordButton.disabled,true);view.dispose();photoButton.dispatchEvent(new Event('click'));assert.equal(calls.length,3);
});
