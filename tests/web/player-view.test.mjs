import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerView} from '../../web/labs/motion/ui/player-view.js';

class Control extends EventTarget{
 constructor(value=''){super();this.value=value;this.dataset={};this.attributes={};}
 get valueAsNumber(){return Number(this.value);}
 setAttribute(key,value){this.attributes[key]=value;}
}

test('播放栏仅转交按钮/定位意图，倍速同步和销毁不残留监听',()=>{
 const elements=Object.fromEntries(['play','restart','seek','timelineSeek','sourceSeek','clock','context','speed'].map(key=>[key,new Control()]));
 elements.speed.value='1';elements.speedButtons=['0.5','1','2'].map(speed=>{const button=new Control();button.dataset.speed=speed;return button;});
 const calls=[],view=createPlayerView({elements,icons:{play:'P',pause:'S','rotate-ccw':'R'},onToggle:()=>calls.push('toggle'),onRestart:()=>calls.push('restart'),onSeek:time=>calls.push(['seek',time]),onTimelineSeek:time=>calls.push(['timeline',time])});
 elements.play.dispatchEvent(new Event('click'));elements.restart.dispatchEvent(new Event('click'));
 elements.seek.value='.4';elements.seek.dispatchEvent(new Event('input'));
 elements.timelineSeek.value='.6';elements.timelineSeek.dispatchEvent(new Event('input'));
 elements.speedButtons[2].dispatchEvent(new Event('click'));
 assert.deepEqual(calls,['toggle','restart',['seek',.4],['timeline',.6]]);assert.equal(view.getSpeed(),2);
 assert.deepEqual(elements.speedButtons.map(button=>button.attributes['aria-pressed']),['false','false','true']);
 view.render({context:'当前编排',canPlay:true,canRestart:true,playing:true});
 view.renderProgress({duration:2,busy:false,time:.6,sourceTime:.2,clockTime:.6});
 assert.equal(elements.play.innerHTML,'S');assert.equal(elements.context.textContent,'当前编排');assert.equal(elements.clock.textContent,'0.60 s');assert.equal(elements.seek.value,.6);
 view.dispose();elements.play.dispatchEvent(new Event('click'));elements.speedButtons[0].dispatchEvent(new Event('click'));
 assert.equal(calls.length,4);assert.equal(view.getSpeed(),2);
});
