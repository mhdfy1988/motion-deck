export const READ_OPERATIONS=['session.inspect','model.inspect','rig.list','library.list','request.status','timeline.inspect','sequence.sample','workspace.list'];
export const WRITE_OPERATIONS=['pose.fromClip','pose.fromLibrary','pose.fromSequence','pose.setRootTransform','pose.setBones','pose.undo','pose.redo','pose.discard','pose.save','view.capture','view.captureSequence','timeline.insertPoseAt','timeline.append','timeline.move','timeline.remove','timeline.resize','timeline.trim','timeline.transition','timeline.undo','timeline.redo','timeline.saveAction','preview.sequence','preview.setRootMotion','export.glb','export.video'];
const propertyObject=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const time={type:'number',minimum:0,maximum:100000},range={times:{type:'array',minItems:1,maxItems:600,items:time},start:time,end:time,step:{type:'number',exclusiveMinimum:0,maximum:100000}};
const views={type:'array',minItems:1,maxItems:3,uniqueItems:true,items:{enum:['front','right','front-right','back','left','front-left']}};
const options=propertyObject({width:{type:'integer',minimum:320,maximum:1920},height:{type:'integer',minimum:240,maximum:1080},framing:{enum:['motion','pose','current']},ground:{type:'boolean'},skeleton:{type:'boolean'}},[]);
export const mediaManifestSchema=propertyObject({modelKey:{type:'string',pattern:'^[a-f0-9]{64}$'},revision:{type:'integer',minimum:0},options,frames:{type:'array',minItems:1,maxItems:24,items:propertyObject({path:{type:'string',maxLength:2000},width:{type:'integer',minimum:2,maximum:4096},height:{type:'integer',minimum:2,maximum:4096},bytes:{type:'integer',minimum:24,maximum:20971520},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},view:views.items,time})}});
const argumentSchemas={
 'workspace.create':propertyObject({name:{type:'string',minLength:1,maxLength:80}}),
 'workspace.activate':propertyObject({taskId:{type:'string',minLength:1,maxLength:80}}),
 'workspace.update':propertyObject({taskId:{type:'string',minLength:1,maxLength:80},assetId:{type:'string',minLength:1,maxLength:300},role:{enum:['temporary','key','result']},stage:{type:'string',maxLength:80},iteration:{type:'integer',minimum:1,maximum:10000},state:{enum:['active','superseded']},protected:{const:true}},['taskId','assetId']),
 'workspace.cleanup':propertyObject({taskId:{type:'string',minLength:1,maxLength:80},keep:{enum:['action','keyframes','all']},confirmed:{const:true}},['taskId','keep']),
 'workspace.restore':propertyObject({taskId:{type:'string',minLength:1,maxLength:80}}),
 'preview.setRootMotion':propertyObject({horizontal:{type:'boolean'},vertical:{type:'boolean'}}),
 'pose.fromSequence':propertyObject({time}),
 'timeline.insertPoseAt':propertyObject({time,poseId:{type:'string',minLength:1,maxLength:300}}),
 'sequence.sample':propertyObject({...range,boneIds:{type:'array',minItems:1,maxItems:64,uniqueItems:true,items:{type:'string',pattern:'^node:[0-9]+$'}}},['boneIds']),
 'view.captureSequence':propertyObject({...range,views,options},['views']),
 'export.video':propertyObject({name:{type:'string',minLength:1,maxLength:80},confirmed:{const:true},start:time,end:time,view:views.items,options},['name','confirmed','start','end']),
 'timeline.inspect':propertyObject({}),
 'pose.fromLibrary':propertyObject({poseId:{type:'string',minLength:1,maxLength:300}}),
 'pose.setRootTransform':propertyObject({position:{type:'array',minItems:3,maxItems:3,items:{type:'number',minimum:-100,maximum:100}},quaternion:{type:'array',minItems:4,maxItems:4,items:{type:'number',minimum:-1,maximum:1}}}),
 'timeline.append':propertyObject({assetId:{type:'string',minLength:1,maxLength:300},duration:{type:'number',minimum:0,maximum:300},transition:{type:'number',minimum:0,maximum:5},interpolation:{const:'continuous'}},['assetId','duration']),
 'timeline.move':propertyObject({id:{type:'string',minLength:1,maxLength:80},targetId:{type:'string',minLength:1,maxLength:80},after:{type:'boolean'}},['id','targetId']),
 'timeline.remove':propertyObject({ids:{type:'array',minItems:1,maxItems:256,uniqueItems:true,items:{type:'string',minLength:1,maxLength:80}}}),
 'timeline.resize':propertyObject({id:{type:'string',minLength:1,maxLength:80},duration:{type:'number',minimum:0,maximum:300}}),
 'timeline.trim':propertyObject({id:{type:'string',minLength:1,maxLength:80},in:{type:'number',minimum:0},out:{type:'number',minimum:0},duration:{type:'number',minimum:.05,maximum:300}}),
 'timeline.transition':propertyObject({id:{type:'string',minLength:1,maxLength:80},duration:{type:'number',minimum:0,maximum:5}}),
 'timeline.undo':propertyObject({}),'timeline.redo':propertyObject({}),
 'timeline.saveAction':propertyObject({name:{type:'string',minLength:1,maxLength:80},confirmed:{const:true}}),
 'preview.sequence':propertyObject({time:{type:'number',minimum:0,maximum:100000},playing:{type:'boolean'}}),
 'export.glb':propertyObject({name:{type:'string',minLength:1,maxLength:80},confirmed:{const:true},rootMotion:propertyObject({horizontal:{type:'boolean'},vertical:{type:'boolean'}})},['name','confirmed']),
 'pose.fromClip':propertyObject({clipId:{type:'string',minLength:1,maxLength:300},time:{type:'number',minimum:0}}),
 'pose.setBones':propertyObject({changes:{type:'array',minItems:1,maxItems:256,items:propertyObject({id:{type:'string',pattern:'^node:[0-9]+$'},quaternion:{type:'array',minItems:4,maxItems:4,items:{type:'number',minimum:-1,maximum:1}},position:{type:'array',minItems:3,maxItems:3,items:{type:'number',minimum:-100,maximum:100}}},['id','quaternion'])}}),
 'pose.undo':propertyObject({}),'pose.redo':propertyObject({}),'pose.discard':propertyObject({}),
 'pose.save':propertyObject({name:{type:'string',minLength:1,maxLength:80},confirmed:{const:true}}),
 'view.capture':propertyObject({views,options},['views']),
};
const id={type:'string',pattern:'^[a-zA-Z0-9-]{1,80}$'};
WRITE_OPERATIONS.push('workspace.create','workspace.activate','workspace.update','workspace.cleanup','workspace.restore');
const workspaceFields={taskId:{type:'string',minLength:1,maxLength:80},role:{enum:['temporary','key','result']},stage:{type:'string',maxLength:80},iteration:{type:'integer',minimum:1,maximum:10000}};
for(const operation of ['pose.save','timeline.saveAction'])Object.assign(argumentSchemas[operation].properties,workspaceFields);
const page={type:'object',additionalProperties:false,properties:{offset:{type:'integer',minimum:0,maximum:100000},limit:{type:'integer',minimum:1,maximum:100}}};
export const querySchema={type:'object',additionalProperties:false,required:['requestId','sessionId','operation','args'],properties:{requestId:id,sessionId:id,modelKey:{type:'string',pattern:'^[a-f0-9]{64}$'},expectedRevision:{type:'integer',minimum:0},operation:{enum:[...READ_OPERATIONS,...WRITE_OPERATIONS]},args:{type:'object'}},allOf:[
 {if:{properties:{operation:{enum:['session.inspect','model.inspect']}}},then:{properties:{args:{type:'object',additionalProperties:false}}}},
 {if:{properties:{operation:{const:'rig.list'}}},then:{properties:{args:page}}},
 {if:{properties:{operation:{const:'workspace.list'}}},then:{properties:{args:propertyObject({...page.properties,query:{type:'string',maxLength:80}},[])}}},
 {if:{properties:{operation:{const:'library.list'}}},then:{properties:{args:propertyObject({...page.properties,...workspaceFields,kind:{enum:['action','pose','custom']},scope:{enum:['all','custom','ai']},query:{type:'string',maxLength:80},includeTrash:{type:'boolean'}},[])}}},
 {if:{properties:{operation:{const:'request.status'}}},then:{properties:{args:{type:'object',required:['requestId'],additionalProperties:false,properties:{requestId:id}}}}},
 ...Object.entries(argumentSchemas).map(([operation,args])=>({if:{properties:{operation:{const:operation}}},then:{...(WRITE_OPERATIONS.includes(operation)||operation==='sequence.sample'?{required:['modelKey','expectedRevision']}:{}),properties:{args}}})),
]};
export const requestSchema={...querySchema,required:[...querySchema.required,'protocolVersion','token'],properties:{...querySchema.properties,protocolVersion:{const:1},token:{type:'string',pattern:'^[a-f0-9]{64}$'}}};
export const replySchema={
 type:'object',additionalProperties:false,required:['requestId','sessionId','ok'],
 properties:{requestId:id,sessionId:id,ok:{type:'boolean'},revision:{type:'integer',minimum:0},result:{type:'object'},error:{type:'object',additionalProperties:false,required:['code','message'],properties:{code:{type:'string',maxLength:80},message:{type:'string',maxLength:300}}}},
 oneOf:[{properties:{ok:{const:true}},required:['result','revision'],not:{required:['error']}},{properties:{ok:{const:false}},required:['error'],not:{required:['result']}}],
};
