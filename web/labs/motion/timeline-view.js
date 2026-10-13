// 仅管理显示比例与刻度，不修改动作或编排时间。
export const DEFAULT_PIXELS_PER_SECOND=100;
export function zoomScale(value){return Math.max(1,Math.min(10000,value));}
export function fitTimeline(total,width){return total>0?zoomScale(width/total):DEFAULT_PIXELS_PER_SECOND;}
export function timelineMetrics(total,width,scale){
 const contentWidth=total>0?total*scale:width;
 return {contentWidth,rulerWidth:Math.max(width,contentWidth)};
}
export function timelineTicks(scale,left,width,extent){
 const raw=80/scale,power=10**Math.floor(Math.log10(raw));
 const step=[1,2,5,10].map(value=>value*power).find(value=>value>=raw);
 const minor=step/5,first=Math.max(0,Math.floor(left/scale/minor)-1),last=Math.min(Math.ceil(extent/scale/minor),Math.ceil((left+width)/scale/minor)+1);
 const ticks=[];
 for(let index=first;index<=last;index++){
  const time=index*minor,major=index%5===0;
  ticks.push({time,x:time*scale,major,label:major?`${Number(time.toFixed(4))}s`:''});
 }
 return ticks;
}
