// 模型就绪由已发布的骨架/动作和可操作状态共同确认，不依赖短暂状态文案。
export const MODEL_LOAD_TIMEOUT=15000;
export async function waitForModel(page,{actions,timeout=MODEL_LOAD_TIMEOUT}={}){
 const start=performance.now();
 try{
  // 沿用Playwright可点击性检查，让既有切换确认handler正常执行；trial不真的点击。
  await page.locator('#replaceModel').click({trial:true,timeout});
  const result=await page.waitForFunction(expected=>{
   const error=document.querySelector('#error');
   if(error&&!error.hidden&&error.textContent.trim())return {error:error.textContent.trim()};
   const menu=document.querySelector('#replaceModel'),capture=document.querySelector('#capturePose');
   const count=document.querySelector('#source')?.options.length;
   const bones=Number(document.querySelector('#bones')?.textContent);
   if(menu&&!menu.disabled&&capture&&!capture.disabled&&document.querySelector('#placeholder')?.hidden&&bones>0&&(expected===undefined||count===expected))return {actions:count,bones};
   return false;
  },actions,{timeout:Math.max(1,timeout-(performance.now()-start))});
  const state=await result.jsonValue();await result.dispose();
  if(state.error)throw new Error('模型加载失败：'+state.error);
  return state;
 }catch(error){throw new Error(`模型未就绪（等待${Math.round(performance.now()-start)}毫秒，预期${actions??'任意'}动作）：${error.message}`,{cause:error});}
}
