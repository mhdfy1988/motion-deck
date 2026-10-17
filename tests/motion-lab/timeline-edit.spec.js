import {waitForModel} from './model-ready-helper.js';
import {test,expect} from '@playwright/test';

// 同源独立夹具使用真实浏览器事件，不绑定或修改用户工作台。
async function lifetimeFixture(page){
 await page.route('**/timeline-lifetime-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:30px}button{width:120px;height:45px}.timeline{margin-top:30px}.timeline-head{height:50px}#test-scroll{width:600px}#test-track{position:relative;width:600px;height:90px}#test-segments{display:flex;height:60px}.resize-handle{display:inline-block;width:20px;height:45px;float:right}.timeline-drag-ghost{position:fixed;pointer-events:none}</style><div id="test-library"><button data-clip-index="0">素材</button></div><button id="addAction">源动作</button><button id="transitionSource">过渡</button><input id="seek" max="6"><div class="timeline"><div class="timeline-head"></div><div id="test-scroll"><div id="test-track"><div id="test-segments"><button class="action selected" data-key="a" data-duration="1">动作<span class="resize-handle"></span></button><button class="action" data-key="b" data-duration="1">动作二</button></div></div></div></div>'}));
 await page.goto('/timeline-lifetime-fixture');
 await page.evaluate(async()=>{
  const {bindTimelineEdit}=await import('/labs/motion/ui/timeline-edit.js');
  const $=id=>document.getElementById(id);window.logs=[];
  // 记录真实add/remove配对，包含不能仅靠一次点击覆盖的捕获和取消监听。
  const targets=new Set([window,document,$('test-segments'),$('test-library'),$('addAction'),$('transitionSource')]),registered=[];
  const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
  const capture=options=>typeof options==='boolean'?options:!!options?.capture;
  const tracked=target=>targets.has(target)||target instanceof Element&&!!target.closest('.timeline-duration-tools');
  EventTarget.prototype.addEventListener=function(type,handler,options){if(tracked(this)&&!registered.some(item=>item.target===this&&item.type===type&&item.handler===handler&&item.capture===capture(options)))registered.push({target:this,type,handler,capture:capture(options)});return add.call(this,type,handler,options);};
  EventTarget.prototype.removeEventListener=function(type,handler,options){const index=registered.findIndex(item=>item.target===this&&item.type===type&&item.handler===handler&&item.capture===capture(options));if(index>=0)registered.splice(index,1);return remove.call(this,type,handler,options);};
  window.fixtureListenerCount=()=>registered.length;
  window.bindFixture=()=>{
   const log={select:0,begin:0,end:0,resize:0,restore:0,remove:0,prepare:0,insert:0};logs.push(log);
   window.disposeFixture=bindTimelineEdit({container:$('test-segments'),scroll:$('test-scroll'),track:$('test-track'),library:$('test-library'),sourceCard:$('addAction'),transitionSource:$('transitionSource'),
    select:()=>log.select++,begin:()=>log.begin++,end:()=>log.end++,resize:()=>log.resize++,restore:()=>log.restore++,remove:()=>log.remove++,prepareInsert:()=>{log.prepare++;return {kind:'action'};},insert:()=>log.insert++,
    canInsert:()=>true,selected:key=>key==='a',snapshot:()=>({duration:1}),refresh:()=>{},scale:()=>{},move:()=>{$('test-segments').append($('test-segments').firstElementChild);}});
  };bindFixture();
 });
}

test('时间轴手势生命周期：销毁后无旧响应，原DOM重新绑定仅响应一次',async({page})=>{
 await lifetimeFixture(page);
 const first=page.locator('[data-key="a"]');await first.click({position:{x:20,y:20}});
 expect(await page.evaluate(()=>logs[0].select)).toBe(2);
 await page.evaluate(()=>disposeFixture());
 expect(await page.evaluate(()=>fixtureListenerCount())).toBe(0);
 const stopped=await page.evaluate(()=>({...logs[0]}));
 await first.click({position:{x:20,y:20}});await first.focus();await page.keyboard.press('Delete');
 for(const source of ['#test-library button','#addAction','#transitionSource'])await page.locator(source).click();
 expect(await page.evaluate(()=>logs[0])).toEqual(stopped);
 await expect(page.locator('.timeline-drop,.timeline-duration-tools')).toHaveCount(0);
 await page.evaluate(()=>bindFixture());
 await first.click({position:{x:20,y:20}});await first.focus();await page.keyboard.press('Delete');
 for(const source of ['#test-library button','#addAction','#transitionSource'])await page.locator(source).click();
 expect(await page.evaluate(()=>logs[0])).toEqual(stopped);
 expect(await page.evaluate(()=>({select:logs[1].select,remove:logs[1].remove,prepare:logs[1].prepare}))).toEqual({select:2,remove:1,prepare:3});
 await expect(page.locator('.timeline-drop')).toHaveCount(1);
 await page.evaluate(()=>{disposeFixture();disposeFixture();});
 expect(await page.evaluate(()=>fixtureListenerCount())).toBe(0);
 await expect(page.locator('.timeline-drop,.timeline-duration-tools')).toHaveCount(0);
});

test('时间轴手势生命周期：调整中销毁只回滚一次，素材拖动取消并清理副本',async({page})=>{
 await lifetimeFixture(page);
 const edge=await page.locator('[data-key="a"] .resize-handle').boundingBox();
 await page.mouse.move(edge.x+10,edge.y+20);await page.mouse.down();await page.mouse.move(edge.x+60,edge.y+20);
 expect(await page.evaluate(()=>logs[0].resize)).toBeGreaterThan(0);
 await page.evaluate(()=>{disposeFixture();disposeFixture();});
 await page.mouse.up();expect(await page.evaluate(()=>({restore:logs[0].restore,end:logs[0].end}))).toEqual({restore:1,end:1});
 const stopped=await page.evaluate(()=>({...logs[0]}));
 await page.evaluate(()=>bindFixture());
 const source=await page.locator('#test-library button').boundingBox(),target=await page.locator('#test-segments').boundingBox();
 await page.mouse.move(source.x+30,source.y+20);await page.mouse.down();await page.mouse.move(target.x+40,target.y+20,{steps:3});
 await expect(page.locator('.timeline-drag-ghost')).toHaveCount(1);
 await page.evaluate(()=>{disposeFixture();disposeFixture();});await page.mouse.up();
 expect(await page.evaluate(()=>logs[1].insert)).toBe(0);expect(await page.evaluate(()=>logs[0])).toEqual(stopped);
 await expect(page.locator('.timeline-drop,.timeline-duration-tools,.timeline-drag-ghost,.timeline-swap-preview,.timeline-settle,.library-drag-source,.drop-ready,.timeline-resizing')).toHaveCount(0);
});

test('时间轴手势生命周期：销毁停止本实例的回位动画并移除副本',async({page})=>{
 await lifetimeFixture(page);
 // 保留真实Web Animation但暂停时钟，避免220ms动画的断言依赖机器速度。
 await page.evaluate(()=>{const animate=Element.prototype.animate;window.settleAnimations=[];Element.prototype.animate=function(...args){const animation=animate.apply(this,args);if(this.classList.contains('timeline-settle')){animation.pause();settleAnimations.push(animation);}return animation;};});
 const first=await page.locator('[data-key="a"]').boundingBox(),second=await page.locator('[data-key="b"]').boundingBox();
 await page.mouse.move(first.x+20,first.y+20);await page.mouse.down();await page.mouse.move(second.x+second.width-5,second.y+20,{steps:3});await page.mouse.up();
 await expect(page.locator('.timeline-settle')).toHaveCount(2);
 await page.evaluate(()=>disposeFixture());
 await expect(page.locator('.timeline-settle,.timeline-drop')).toHaveCount(0);
 expect(await page.evaluate(()=>settleAnimations.map(animation=>animation.playState))).toEqual(['idle','idle']);
});
test('直接拖动时间轴调整时长、取消、排序和删除',async({page})=>{
 await page.goto('/labs/motion/index.html?tools=1');await page.locator('#humanDemo').click();await waitForModel(page,{actions:117});await expect(page.locator('#status')).toContainText('117 动作');await page.locator('#quickSequence').click();await page.locator('#play').click();
 const first=page.locator('#segments .action').first(),key=await first.getAttribute('data-key');
 let handle=await first.locator('.resize-handle:not(.resize-left)').boundingBox();const old=Number(await first.getAttribute('data-duration'));
 const pps=await page.evaluate(()=>document.getElementById('timelineTrack').clientWidth/Number(document.getElementById('seek').max));
 await page.keyboard.down('Alt');await page.mouse.move(handle.x+handle.width/2,handle.y+25);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+pps,handle.y+25,{steps:5});
 await expect(first).toContainText('3.50 s');await page.mouse.up();
 handle=await first.locator('.resize-handle:not(.resize-left)').boundingBox();await page.mouse.move(handle.x+5,handle.y+25);await page.mouse.down();await page.mouse.move(handle.x+70,handle.y+25,{steps:4});await page.keyboard.press('Escape');await page.mouse.up();expect(Number(await first.getAttribute('data-duration'))).toBeCloseTo(old+1,2);await page.keyboard.up('Alt');
 const source=await first.boundingBox(),target=await page.locator('#segments .action').nth(2).boundingBox();await page.mouse.move(source.x+30,source.y+25);await page.mouse.down();await page.mouse.move(target.x+target.width*.8,target.y+25,{steps:12});await expect(page.locator('.timeline-drop')).toBeVisible();await page.mouse.up();await expect(page.locator('#segments .action').nth(2)).toHaveAttribute('data-key',key);
 const transition=page.locator('#segments .transition').first(),edge=await transition.locator('.resize-handle:not(.resize-left)').boundingBox(),scale=await page.evaluate(()=>document.getElementById('timelineTrack').clientWidth/Number(document.getElementById('seek').max));await page.mouse.move(edge.x+5,edge.y+25);await page.mouse.down();await page.mouse.move(edge.x+5+scale*.5,edge.y+25,{steps:5});await expect(transition).toContainText('0.85 s');await page.mouse.up();
 const transitionCount=await page.locator('#segments .transition').count();await transition.click();await page.locator('#timelineRemove').click();await expect(page.locator('#segments .transition')).toHaveCount(transitionCount-1);await expect(page.locator('#segments .action')).toHaveCount(5);
 await page.locator('#segments .action').nth(2).click();await page.keyboard.press('Delete');await expect(page.locator('#segments .action')).toHaveCount(4);
 await page.screenshot({path:'output/acceptance/motion-timeline-edit.png'});
 for(let i=0;i<4;i++){await page.locator('#segments .action').first().click();await page.locator('#timelineRemove').click();}await expect(page.locator('#segments button')).toHaveCount(0);await expect(page.locator('#timelineRemove')).toBeDisabled();
});
