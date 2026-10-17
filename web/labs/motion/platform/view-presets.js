// 朝向以人偶绑定姿势的+Z为前方；名称表示所见面，不改变模型或动作坐标。
const facing=[
 ['front','正面',0],['front-right','右前',-45],['right','横版侧视 · 向右',-90],['back-right','右后',-135],
 ['back','背面',180],['back-left','左后',135],['left','横版侧视 · 向左',90],['front-left','左前',45]
];
const direction=(yaw,elevation)=>{const a=yaw*Math.PI/180,b=elevation*Math.PI/180;return [Math.sin(a)*Math.cos(b),Math.sin(b),Math.cos(a)*Math.cos(b)];};
const flat=facing.map(([id,label,yaw])=>({id,label:label.includes('侧视')?label:'平视 · '+label,group:Math.abs(yaw)%90===0?'平视 · 四向':'平视 · 补充斜向',family:'flat',direction:direction(yaw,0)}));
const overhead=facing.map(([id,label,yaw])=>({id:'overhead-'+id,label:'斜俯视 · '+(id==='right'?'右侧':id==='left'?'左侧':label),group:'斜俯视 · 八向',family:'overhead',direction:direction(yaw,45)}));
const isometric=facing.filter(([, ,yaw])=>Math.abs(yaw)%90===45).map(([id,label,yaw])=>({id:'iso-'+id,label:'等角 · '+label,group:'等角 · 四向',family:'isometric',direction:direction(yaw,Math.atan(1/Math.sqrt(2))*180/Math.PI)}));
export const viewPresets=[{id:'perspective',label:'透视编辑',group:'自由视角',family:'perspective',direction:[.75,.25,1]},...flat.filter(p=>p.group==='平视 · 四向'),...flat.filter(p=>p.group!=='平视 · 四向'),...overhead,...isometric];
export function viewPreset(id){const preset=viewPresets.find(p=>p.id===id);if(!preset)throw new Error('未知视角：'+id);return preset;}
export function framingDirections(preset){return viewPresets.filter(p=>p.family===preset.family).map(p=>p.direction);}
