const number={type:'number'},vector=size=>({type:'array',items:number,minItems:size,maxItems:size});
const poseSchema={type:'array',minItems:1,items:{type:'object',required:['p','q','s'],properties:{p:vector(3),q:vector(4),s:vector(3),m:{type:'array',items:number}}}};
const trackSchema={type:'object',required:['name','type','times','values'],properties:{
 name:{type:'string'},nodeIndex:{type:'integer',minimum:0},type:{enum:['vector','quaternion','number','bool','color','string']},
 times:{type:'array',minItems:1,items:number},values:{type:'array',minItems:1,items:{type:['number','string','boolean']}}
}};
const clipSchema={type:'object',required:['name','duration','tracks'],properties:{
 name:{type:'string'},duration:{type:'number',exclusiveMinimum:0},tracks:{type:'array',items:trackSchema},recipe:{$ref:'#/$defs/embeddedAction'}
}};
const itemSchema={type:'object',additionalProperties:false,required:['kind','name','transition'],allOf:[{if:{properties:{kind:{const:'action'}}},then:{required:['clipIndex']}},{if:{properties:{kind:{const:'pose'}}},then:{required:['pose','duration']}}],properties:{
 kind:{enum:['action','pose']},name:{type:'string'},transition:{type:'number',minimum:0,maximum:5},
 clipIndex:{type:'integer',minimum:0},in:{type:'number',minimum:0},out:{type:'number',exclusiveMinimum:0},
 duration:{type:'number',minimum:0,maximum:300},interpolation:{const:'continuous'},
 pose:poseSchema
}};
itemSchema.allOf.push({if:{required:['duration'],properties:{duration:{const:0}}},then:{required:['interpolation'],properties:{kind:{const:'pose'}}}},{if:{required:['interpolation']},then:{properties:{kind:{const:'pose'}}}});
const actionSchema={type:'object',additionalProperties:false,required:['id','name','clips','items'],properties:{
 id:{type:'string',minLength:1},name:{type:'string',minLength:1,maxLength:80},clips:{type:'array',items:clipSchema},
 items:{type:'array',minItems:1,maxItems:1000,items:itemSchema}
}};
export const modelSchema={type:'object',additionalProperties:false,required:['name'],properties:{name:{type:'string',minLength:1,maxLength:80},builtinId:{enum:['quaternius','mesh2motion','makehuman']}}};
export const catalogSchema={type:'object',additionalProperties:false,required:['version','models'],properties:{version:{const:1},models:{type:'array',maxItems:200,items:{type:'object',additionalProperties:false,required:['key','name'],properties:{key:{type:'string',pattern:'^[a-f0-9]{64}$'},...modelSchema.properties}}}}};
const workspaceEntrySchema={type:'object',additionalProperties:false,required:['assetId','kind','role','stage','iteration','state','protected'],allOf:[{if:{properties:{state:{const:'trash'}}},then:{required:['trashFrom']},else:{not:{required:['trashFrom']}}}],properties:{assetId:{type:'string',minLength:1,maxLength:300},kind:{enum:['pose','custom']},role:{enum:['temporary','key','result']},stage:{type:'string',maxLength:80},iteration:{type:'integer',minimum:1,maximum:10000},state:{enum:['active','superseded','trash']},trashFrom:{enum:['active','superseded']},protected:{type:'boolean'}}};
const workspaceSchema={type:'object',additionalProperties:false,required:['version','activeTaskId','tasks'],properties:{version:{const:1},activeTaskId:{type:['string','null'],maxLength:80},tasks:{type:'array',maxItems:100,items:{type:'object',additionalProperties:false,required:['id','name','status','createdAt','entries'],properties:{id:{type:'string',minLength:1,maxLength:80},name:{type:'string',minLength:1,maxLength:80},status:{enum:['working','archived']},createdAt:{type:'integer',minimum:0},entries:{type:'array',maxItems:700,items:workspaceEntrySchema}}}}}};
export const schema={type:'object',$defs:{embeddedAction:actionSchema},additionalProperties:false,required:['version','modelKey','actions'],allOf:[{if:{required:['aiWorkspace']},then:{properties:{version:{const:4}}}},{if:{properties:{version:{const:4}}},then:{required:['aiWorkspace']}}],properties:{
 aiWorkspace:workspaceSchema,
 model:modelSchema,
 testPoseCleanup:{const:1},
 thirdParty:{type:'array',maxItems:500,items:actionSchema},version:{enum:[1,2,3,4]},modelKey:{type:'string',pattern:'^[a-f0-9]{64}$'},actions:{type:'array',maxItems:200,items:actionSchema},
 poses:{type:'array',maxItems:500,items:{type:'object',additionalProperties:false,required:['id','name','pose'],properties:{id:{type:'string',minLength:1},name:{type:'string',minLength:1,maxLength:80},pose:poseSchema}}}
}};
