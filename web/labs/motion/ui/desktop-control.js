import {answerControlQuery} from '../application/control-queries.js';
export function bindDesktopControl(workbench){
 const bridge=globalThis.motionDeckDesktop;if(!bridge)return ()=>{};
 let queue=Promise.resolve();
 const dispose=bridge.onControlQuery(({bridgeId,query})=>{queue=queue.then(async()=>{let reply;try{reply=await answerControlQuery(workbench,query);}catch(error){reply={requestId:query.requestId,sessionId:query.sessionId,ok:false,error:{code:error.code??'INVALID_ARGUMENT',message:'客户端操作被拒绝'}};}await bridge.answerControlQuery({bridgeId,reply});}).catch(error=>console.error('命令回复失败',error.code??'ERROR'));});
 void bridge.controlReady();return dispose;
}
