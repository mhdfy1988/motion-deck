import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordingType,ReferenceCapture} from '../../web/labs/motion/reference-capture.js';
test('录像格式显式探测，不把WebM伪装成MP4，不支持时拒绝',()=>{
 assert.match(recordingType({isTypeSupported:type=>type.startsWith('video/mp4')}),/^video\/mp4/);
 assert.match(recordingType({isTypeSupported:type=>type.endsWith('vp9')}),/^video\/webm/);
 assert.throws(()=>recordingType(null),/不支持录像/);assert.throws(()=>recordingType({isTypeSupported:()=>false}),/没有可用/);
});
test('录制预算在创建轨道前校验',async()=>{
 const capture=new ReferenceCapture({canvas:null,draw:()=>{},onStatus:()=>{}});
 await assert.rejects(capture.record({duration:301,speed:1}),/300秒/);await assert.rejects(capture.record({duration:0}),/300秒/);
});
