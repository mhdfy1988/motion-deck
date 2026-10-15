// 每个工作台只有一份模型与编辑状态；入口不另建镜像状态。
export function createSessionState(center){
 return {aiWorkspace:{version:1,activeTaskId:null,tasks:[]},rootMotion:{horizontal:true,vertical:true},root:null,rig:null,sampler:null,helper:null,clips:[],bones:[],poses:[],items:[],selected:-1,sequence:null,mode:'source',time:0,sourceTime:0,sourceIndex:0,playing:false,busy:false,size:2,center,modelKey:null,customs:[],selection:new Set(),revision:0,poseDraft:null,closed:false};
}
