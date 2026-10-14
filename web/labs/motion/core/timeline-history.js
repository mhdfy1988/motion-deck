// 只保存编排元数据，模型、动画与姿势快照保持引用，不复制网格。
export function createTimelineHistory(read,restore,changed){
 const undo=[],redo=[];let before=null,depth=0;
 const same=(a,b)=>a.items.length===b.items.length&&a.items.every((item,i)=>{const next=b.items[i],keys=new Set([...Object.keys(item),...Object.keys(next)]);return [...keys].every(key=>item[key]===next[key]);});
 function begin(){if(depth++===0)before=read();}
 function end(){if(!depth||--depth)return;if(!same(before,read())){undo.push(before);if(undo.length>100)undo.shift();redo.length=0;}before=null;changed();}
 return {begin,end,run(fn){begin();try{return fn();}finally{end();}},cancel(){if(before)restore(before);depth=0;before=null;changed();},reset(){undo.length=0;redo.length=0;depth=0;before=null;changed();},undo(){if(depth)return;if(!undo.length)return;redo.push(read());restore(undo.pop());changed();},redo(){if(depth)return;if(!redo.length)return;undo.push(read());restore(redo.pop());changed();},get canUndo(){return undo.length>0;},get canRedo(){return redo.length>0;}};
}
