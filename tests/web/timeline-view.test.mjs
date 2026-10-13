import {test} from 'node:test';
import assert from 'node:assert/strict';
import {timelineMetrics,timelineTicks,fitTimeline} from '../../web/labs/motion/timeline-view.js';
test('默认显示比例不随片段添加或窗口改变',()=>{
 assert.equal(timelineMetrics(2,1000,100).contentWidth,200);
 assert.equal(timelineMetrics(5,1000,100).contentWidth,500);
 assert.equal(timelineMetrics(5,500,100).contentWidth,500);
 assert.equal(fitTimeline(20,1000),50);
});
test('刻度自适应缩放，长编排只绘制可见区域',()=>{
 for(const scale of [1,25,100,800,10000]){
  const ticks=timelineTicks(scale,100000,1000,200000);
  assert.ok(ticks.length<90);
  const major=ticks.filter(tick=>tick.major);
  for(let i=1;i<major.length;i++)assert.ok(major[i].x-major[i-1].x>=79.99);
 }
});
