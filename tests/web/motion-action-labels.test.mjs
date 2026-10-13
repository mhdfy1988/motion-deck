import {test} from 'node:test';
import assert from 'node:assert/strict';
import {actionLabel,actionDisplayNames} from '../../web/labs/motion/action-labels.js';
test('显示只保留动作名和根位移，重名编号不改来源标识',()=>{
 assert.equal(actionLabel('Chop_Tree'),'砍树');assert.equal(actionLabel('Idle_Loop'),'站立待机');assert.equal(actionLabel('Walk_RM'),'行走 · 根位移');assert.equal(actionLabel('UAL2 · Sword_Heavy_Combo'),'重剑连击');assert.equal(actionLabel('M2M Addon · Pushup'),'俯卧撑');assert.equal(actionLabel('UAL1 · Walk_Loop · 根位移'),'行走 · 根位移');assert.equal(actionLabel('外部自定义名'),'外部自定义名');
 const names=actionDisplayNames(['Consume','M2M Addon · Consume Item','Yes','M2M Addon · Head Nod','Walk_RM','UAL1 · Walk_Loop · 根位移']);assert.equal(names.get('Consume'),'使用物品');assert.equal(names.get('M2M Addon · Consume Item'),'使用物品②');assert.equal(names.get('M2M Addon · Head Nod'),'点头②');assert.equal(names.get('UAL1 · Walk_Loop · 根位移'),'行走② · 根位移');
});
