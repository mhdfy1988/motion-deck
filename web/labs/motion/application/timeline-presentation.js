// 只派生展示字段，不携带素材快照或修改编排。
export function createTimelinePresentation({spans=[],duration=0,items=[],selected=-1,selectedTransition=false},displaySpan){
 return {duration,entries:spans.map(span=>{
  const transition=span.kind==='transition';
  return {
   key:transition?`transition:${span.targetId}`:span.id,kind:span.kind,
   start:span.start,duration:span.duration,sourceIn:span.in??'',sourceOut:span.out??'',rawName:span.name,
   selected:items.findIndex(item=>item.id===(transition?span.targetId:span.id))===selected&&transition===!!selectedTransition,
   label:transition?'过渡':`${span.kind==='pose'?'姿势':'动作'} · ${displaySpan(span)}`,
   durationLabel:`${span.duration.toFixed(2)} s`,
   title:`${span.name} · ${span.start.toFixed(2)}—${(span.start+span.duration).toFixed(2)}秒`
  };
 })};
}
