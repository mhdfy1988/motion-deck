import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createAssistantSession,IDLE_MS}=createRequire(import.meta.url)('../../desktop/control/assistant-session.cjs');
test('协作无心跳：开始等待、命令操作、完成等待、空闲到期和旧编号拒绝',()=>{
 let time=0,scheduled;const states=[];
 const session=createAssistantSession({now:()=>time,onChange:s=>states.push(s.status),schedule:fn=>{scheduled=fn;return 1;},cancel:()=>{}});
 assert.equal(session.inspect().status,'idle');const first=session.begin();assert.equal(first.status,'waiting');assert.throws(()=>session.begin(),{code:'ASSISTANT_SESSION_BUSY'});
 const finish=session.enter(first.id);assert.equal(session.inspect().status,'operating');time=IDLE_MS*2;assert.equal(session.inspect().status,'operating');assert.throws(()=>session.end(first.id),{code:'BUSY'});
 finish();assert.equal(session.inspect().status,'waiting');time+=IDLE_MS;scheduled();assert.equal(session.inspect().status,'idle');assert.throws(()=>session.enter(first.id),{code:'ASSISTANT_SESSION_EXPIRED'});
 const second=session.begin();assert.notEqual(second.id,first.id);const a=session.enter(second.id),b=session.enter(second.id);a();assert.equal(session.inspect().status,'operating');b();session.end(second.id);assert.equal(session.inspect().status,'idle');
 assert.throws(()=>session.end(second.id),{code:'ASSISTANT_SESSION_EXPIRED'});const third=session.begin();const late=session.enter(third.id);session.clear();late();assert.equal(session.inspect().status,'idle');assert.ok(states.includes('operating'));
});
