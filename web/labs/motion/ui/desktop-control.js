import {answerControlQuery} from '../application/control-queries.js';
export function bindDesktopControl(workbench){
 const bridge=globalThis.motionDeckDesktop;if(!bridge)return ()=>{};
 const indicator=document.createElement('div');indicator.id='assistantActivity';indicator.className='assistant-pose-tools';indicator.hidden=true;indicator.setAttribute('role','status');indicator.setAttribute('aria-live','polite');indicator.innerHTML='<span class="assistant-activity-dot" aria-hidden="true"></span><span>AI 助手正在操作</span>';document.querySelector('#status').after(indicator);
 let queue=Promise.resolve(),closed=false,received=false,waitingTimer=null,operatingUntil=0;
 const render=value=>{const active=!closed&&['operating','waiting'].includes(value?.status);indicator.hidden=!active;indicator.lastElementChild.textContent=value?.status==='operating'?'AI 助手正在操作':'等待 AI';document.body.classList.toggle('assistant-operating',active);document.body.classList.toggle('assistant-waiting',active&&value.status==='waiting');};
 // 仅缓冲可见提示，不改变真实命令状态、会话期限或权限。
 const update=value=>{
  clearTimeout(waitingTimer);waitingTimer=null;
  if(value?.status==='operating'){operatingUntil=performance.now()+1500;render(value);}
  else if(value?.status==='waiting'&&operatingUntil>performance.now())waitingTimer=setTimeout(()=>{waitingTimer=null;render(value);},operatingUntil-performance.now());
  else{if(value?.status!=='waiting')operatingUntil=0;render(value);}
 };
 const disposeState=bridge.onAssistantState(value=>{received=true;update(value);});
 const dispose=bridge.onControlQuery(({bridgeId,query})=>{queue=queue.then(async()=>{if(closed)return;let reply;try{reply=await answerControlQuery(workbench,query);}catch(error){reply={requestId:query.requestId,sessionId:query.sessionId,ok:false,error:{code:error.code??'INVALID_ARGUMENT',message:'客户端操作被拒绝'}};}await bridge.answerControlQuery({bridgeId,reply});}).catch(error=>console.error('命令回复失败',error.code??'ERROR'));});
 void bridge.controlReady().then(()=>bridge.controlState()).then(value=>{if(!received&&!closed)update(value.assistant);}).catch(()=>{if(!received&&!closed)update(null);});
 return ()=>{closed=true;clearTimeout(waitingTimer);dispose();disposeState();render(null);indicator.remove();};
}
