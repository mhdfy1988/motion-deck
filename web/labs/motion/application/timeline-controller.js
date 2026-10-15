import {actionRange} from '../core/sequence-core.js';

// 操作层只修改共享状态，不读取DOM；撤销事务与界面刷新由调用入口组织。
export function createTimelineController(state){
 function itemFor(key){const transition=key.startsWith('transition:');return {item:state.items.find(item=>item.id===(transition?key.slice(11):key)),field:transition?'transition':'duration'};}
 return {
  itemFor,
  move(key,targetKey,after,swap=false){
   if(state.busy)return false;
   const source=state.items.filter(item=>state.selection.has(item.id)),target=state.items.findIndex(item=>item.id===targetKey);
   if(!source.length||target<0||source.some(item=>item.id===targetKey))return false;
   if(swap){
    const targets=state.items.slice(target,target+source.length);
    if(targets.length!==source.length||targets.some(item=>source.includes(item)))throw new Error('交换需要同数量且不重叠的目标片段');
    const positions=source.map(item=>state.items.indexOf(item));
    positions.forEach((position,index)=>{state.items[position]=targets[index];state.items[target+index]=source[index];});
   }else{
    state.items=state.items.filter(item=>!source.includes(item));
    const to=state.items.findIndex(item=>item.id===targetKey);state.items.splice(to+(after?1:0),0,...source);
   }
   state.selected=state.items.findIndex(item=>item.id===key);state.selectedTransition=false;state.playing=false;return true;
  },
  remove(){
   if(state.busy||!state.selection.size)return false;
   for(const item of state.items)if(state.selection.has(`transition:${item.id}`))item.transition=0;
   state.items=state.items.filter(item=>!state.selection.has(item.id));state.selection.clear();
   state.selectedTransition=false;state.selected=-1;state.playing=false;return true;
  },
  resize(key,value,side,original,mode){
   if(state.busy)return false;
   if(!Number.isFinite(value))throw new Error('片段时长必须是有限数值');
   const {item,field}=itemFor(key);if(!item)return false;
   if(field==='duration'&&item.kind==='action'&&mode!=='duration'){
    const range=actionRange(original),rate=range.duration/(original.duration??range.duration);
    const max=side==='left'?range.out/rate:(item.clip.duration-range.in)/rate,duration=Math.max(.05,Math.min(value,max));
    item.in=side==='left'?range.out-duration*rate:range.in;item.out=side==='left'?range.out:range.in+duration*rate;item.duration=duration;
   }else item[field]=Math.max(field==='duration'&&item.kind==='pose'&&item.interpolation==='continuous'?0:.05,Math.min(value,field==='transition'?5:item.kind==='pose'?30:300));
   state.playing=false;return true;
  },
 };
}
