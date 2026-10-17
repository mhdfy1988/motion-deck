const {randomUUID}=require('node:crypto');
const IDLE_MS=10*60*1000;
function createAssistantSession({now=Date.now,onChange=()=>{},schedule=setTimeout,cancel=clearTimeout}={}){
 let session=null,timer=null;
 const snapshot=()=>session?{status:session.pending?'operating':'waiting',id:session.id,expiresAt:session.expiresAt}:{status:'idle'};
 const publish=()=>onChange(snapshot());
 function arm(){if(timer)cancel(timer);timer=null;if(session&&!session.pending){timer=schedule(()=>{timer=null;expire();},Math.max(0,session.expiresAt-now()));timer?.unref?.();}}
 function clear(){session=null;if(timer)cancel(timer);timer=null;publish();}
 function expire(){if(session&&!session.pending&&now()>=session.expiresAt)clear();}
 function requireSession(id){expire();if(!session||id!==session.id)throw Object.assign(new Error('协作会话已结束或过期，请重新开始'),{code:'ASSISTANT_SESSION_EXPIRED'});return session;}
 return {
  inspect(){expire();return snapshot();},
  begin(){expire();if(session)throw Object.assign(new Error('已有协作会话，请先结束'),{code:'ASSISTANT_SESSION_BUSY'});session={id:randomUUID(),pending:0,expiresAt:now()+IDLE_MS};arm();publish();return snapshot();},
  enter(id){const current=requireSession(id);current.pending++;current.expiresAt=now()+IDLE_MS;arm();publish();return ()=>{if(session!==current)return;current.pending--;current.expiresAt=now()+IDLE_MS;arm();publish();};},
  end(id){requireSession(id);if(session.pending)throw Object.assign(new Error('协作命令仍在执行'),{code:'BUSY'});clear();return snapshot();},
  clear,
 };
}
module.exports={createAssistantSession,IDLE_MS};
