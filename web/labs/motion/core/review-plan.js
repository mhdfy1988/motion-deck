const fail=message=>Object.assign(new Error(message),{code:'INVALID_ARGUMENT'});
// 所有批量检查共用取样口径：端点只出现一次，不用累计浮点步长。
export function reviewTimes(args,duration,max=600){
 if(!Number.isFinite(duration)||duration<=0)throw fail('当前没有有效编排');
 const hasTimes=args.times!==undefined,hasRange=['start','end','step'].some(k=>args[k]!==undefined);
 if(hasTimes===hasRange)throw fail('指定times或完整start/end/step，二选一');
 let times;
 if(hasTimes){times=args.times;if(!Array.isArray(times)||!times.length||times.length>max||times.some((t,i)=>!Number.isFinite(t)||t<0||t>duration||i>0&&t<=times[i-1]))throw fail('取样时间必须递增、不重复且位于编排内');}
 else{const {start,end,step}=args;if(![start,end,step].every(Number.isFinite)||start<0||end>duration||end<start||step<=0)throw fail('取样范围无效');const count=Math.floor((end-start)/step+1e-9)+1;if(count>max)throw fail('取样数量超限');times=Array.from({length:count},(_,i)=>Math.min(end,start+i*step));if(end-times.at(-1)>1e-8)times.push(end);}
 if(times.length>max)throw fail('取样数量超限');return times.slice();
}
export function captureOptions(options={}){
 const result={width:1280,height:720,framing:'motion',ground:false,skeleton:false,...options};
 if(Object.keys(result).some(k=>!['width','height','framing','ground','skeleton'].includes(k))||!Number.isInteger(result.width)||!Number.isInteger(result.height)||result.width<320||result.height<240||result.width>1920||result.height>1080||!['motion','pose','current'].includes(result.framing)||typeof result.ground!=='boolean'||typeof result.skeleton!=='boolean')throw fail('取景选项无效');
 return result;
}
