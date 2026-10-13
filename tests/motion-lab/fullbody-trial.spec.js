import {test,expect} from '@playwright/test';
async function center(locator){const b=await locator.boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};}
async function drag(page,name,dx,dy,cancel=false){const p=await center(page.getByRole('button',{name:'联动'+name,exact:true}));await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+dx,p.y+dy,{steps:12});await page.waitForTimeout(150);if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}
for(const model of ['mesh2motion','quaternius'])test(`${model}：隔离全身联动试摆真实拖动、固定点、撤销与取消`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/labs/motion/fullbody.html');if(model==='quaternius'){await expect(page.locator('#status')).toContainText('双脚已保持');await page.locator('#model').selectOption(model);}
 await expect(page.locator('#status')).toContainText('双脚已保持');await expect(page.locator('.point')).toHaveCount(19);
 await page.locator('#view').selectOption('side');
 const chest=page.getByRole('button',{name:'联动胸',exact:true}),pelvis=page.getByRole('button',{name:'联动骨盆',exact:true}),foot=page.getByRole('button',{name:'联动左脚',exact:true}),knee=page.getByRole('button',{name:'联动左膝',exact:true});
 const start=await center(chest),p0=await center(pelvis),f0=await center(foot),k0=await center(knee);
 await drag(page,'胸',35,28);await expect(page.locator('#status')).toContainText('位置误差');
 const after=await center(chest),p1=await center(pelvis),f1=await center(foot),k1=await center(knee);
 expect(Math.hypot(after.x-start.x,after.y-start.y)).toBeGreaterThan(20);expect(Math.hypot(p1.x-p0.x,p1.y-p0.y)).toBeGreaterThan(3);expect(Math.hypot(k1.x-k0.x,k1.y-k0.y)).toBeGreaterThan(3);expect(Math.hypot(f1.x-f0.x,f1.y-f0.y)).toBeLessThan(4);
 await page.screenshot({path:`output/acceptance/fullbody-${model}.png`});
 await page.locator('#undo').click();const restored=await center(chest);expect(Math.hypot(restored.x-start.x,restored.y-start.y)).toBeLessThan(.5);
 await drag(page,'胸',30,20,true);const canceled=await center(chest);expect(Math.hypot(canceled.x-start.x,canceled.y-start.y)).toBeLessThan(.5);
 await page.locator('#part').selectOption('左手');await page.locator('#pinPosition').check();await expect(page.getByRole('button',{name:'联动左手',exact:true})).toHaveClass(/pinned/);await page.locator('#pinPosition').uncheck();
 await page.locator('#rotate').click();await expect(page.locator('#rotate')).toHaveClass(/active/);await page.locator('#move').click();await page.locator('#reset').click();await expect(page.locator('#status')).toContainText('重置');expect(errors).toEqual([]);
});

for(const model of ['mesh2motion','quaternius'])test(`${model}：拖手局部优先，不带乱头、骨盆和另一只手`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/labs/motion/fullbody.html');await expect(page.locator('#status')).toContainText('双脚已保持');if(model==='quaternius'){await page.locator('#model').selectOption(model);await expect(page.locator('#status')).toContainText('双脚已保持');}await page.locator('#view').selectOption('front');
 const positions={};for(const name of ['左手','右手','胸','头','骨盆','左脚'])positions[name]=await center(page.getByRole('button',{name:'联动'+name,exact:true}));
 const hand=positions['左手'];await drag(page,'左手',(positions['胸'].x-hand.x)*.2,-30);await expect(page.locator('#status')).toContainText('局部调整');
 const moved=await center(page.getByRole('button',{name:'联动左手',exact:true}));expect(Math.hypot(moved.x-hand.x,moved.y-hand.y)).toBeGreaterThan(15);
 for(const name of ['头','右手']){const after=await center(page.getByRole('button',{name:'联动'+name,exact:true}));expect(Math.hypot(after.x-positions[name].x,after.y-positions[name].y)).toBeLessThan(12);}
 for(const name of ['骨盆','左脚']){const after=await center(page.getByRole('button',{name:'联动'+name,exact:true}));expect(Math.hypot(after.x-positions[name].x,after.y-positions[name].y)).toBeLessThan(4);}
 await page.screenshot({path:`output/acceptance/fullbody-stable-hand-${model}.png`});await page.locator('#undo').click();const restored=await center(page.getByRole('button',{name:'联动左手',exact:true}));expect(Math.hypot(restored.x-hand.x,restored.y-hand.y)).toBeLessThan(.5);
 expect(errors).toEqual([]);
});

test('白模连续拖动：局部→邻近部分配合→周边配合，拉回不累积',async({page})=>{
 await page.goto('/labs/motion/fullbody.html');await expect(page.locator('#status')).toContainText('双脚已保持');await page.locator('#view').selectOption('front');
 const hand=page.getByRole('button',{name:'联动左手',exact:true}),start=await center(hand),shoulder=await center(page.getByRole('button',{name:'联动左肩',exact:true})),head=await center(page.getByRole('button',{name:'联动头',exact:true}));
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x-15,start.y-15,{steps:10});await expect(page.locator('#status')).toContainText('局部调整');const stableHead=await center(page.getByRole('button',{name:'联动头',exact:true}));expect(Math.hypot(stableHead.x-head.x,stableHead.y-head.y)).toBeLessThan(1);
 const dx=start.x-shoulder.x,dy=start.y-shoulder.y,length=Math.hypot(dx,dy);await page.mouse.move(start.x+dx/length*12,start.y+dy/length*12,{steps:15});await expect(page.locator('#status')).toContainText(/邻近配合 (?!100%)[1-9]\d?%/);
 await page.screenshot({path:'output/acceptance/fullbody-progressive-near.png'});await page.mouse.move(start.x+dx/length*65,start.y+dy/length*65,{steps:30});await expect(page.locator('#status')).toContainText('周边配合');
 await page.screenshot({path:'output/acceptance/fullbody-progressive-support.png'});await page.mouse.move(start.x,start.y,{steps:30});await expect(page.locator('#status')).toContainText('局部调整');const back=await center(hand);expect(Math.hypot(back.x-start.x,back.y-start.y)).toBeLessThan(1);await page.keyboard.press('Escape');await page.mouse.up();
});
