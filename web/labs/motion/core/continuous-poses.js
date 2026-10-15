// 连续关键姿势的领域采样：共享切线，单调分量不越过端点；不承担IK或接触约束。
function tangents(times,values){
 const out=values.map(v=>v.map(()=>0));
 for(let i=1;i<values.length-1;i++){
  const a=times[i]-times[i-1],b=times[i+1]-times[i];
  for(let j=0;j<values[i].length;j++){
   const left=(values[i][j]-values[i-1][j])/a,right=(values[i+1][j]-values[i][j])/b;
   if(left*right>0){const w1=2*b+a,w2=b+2*a;out[i][j]=(w1+w2)/(w1/left+w2/right);}
  }
 }return out;
}
function channel(times,values){return {values,tangents:tangents(times,values)};}
function evaluate(c,index,t,dt){const t2=t*t,t3=t2*t;return c.values[index].map((v,j)=>(2*t3-3*t2+1)*v+(t3-2*t2+t)*dt*c.tangents[index][j]+(-2*t3+3*t2)*c.values[index+1][j]+(t3-t2)*dt*c.tangents[index+1][j]);}
export function attachContinuousCurves(spans){
 const visible=spans.filter(s=>s.duration>0);let start=0;
 while(start<visible.length){
  if(!visible[start].continuous){start++;continue;}
  let end=start+1;while(end<visible.length&&visible[end].continuous&&visible[end-1].b===visible[end].a)end++;
  const run=visible.slice(start,end),times=[run[0].start,...run.map(s=>s.start+s.duration)],poses=[run[0].a,...run.map(s=>s.b)];
  const nodes=poses[0].map((_,node)=>{
   const quaternions=poses.map(p=>p[node].q.slice());
   for(let i=1;i<quaternions.length;i++)if(quaternions[i].reduce((sum,v,j)=>sum+v*quaternions[i-1][j],0)<0)quaternions[i]=quaternions[i].map(v=>-v);
   return {p:channel(times,poses.map(p=>p[node].p)),s:channel(times,poses.map(p=>p[node].s)),q:channel(times,quaternions),m:poses[0][node].m?channel(times,poses.map(p=>p[node].m)):null};
  });
  run.forEach((span,index)=>{span.curve={nodes,index};});start=end;
 }
}
export function sampleContinuous(span,t){
 const {nodes,index}=span.curve;return nodes.map(n=>{
  const q=evaluate(n.q,index,t,span.duration),length=Math.hypot(...q);if(length<1e-10)throw new Error('连续姿势旋转曲线无效');
  return {p:evaluate(n.p,index,t,span.duration),s:evaluate(n.s,index,t,span.duration),q:q.map(v=>v/length),m:n.m?evaluate(n.m,index,t,span.duration):undefined};
 });
}
