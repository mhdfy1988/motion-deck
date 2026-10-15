import {query as validateQuery} from '../core/control-validator.generated.js';

// 固定白名单映射；绝不按外部字符串索引整个工作台对象。
export function answerControlQuery(workbench,query){
 if(!validateQuery(query)||query.operation==='request.status')throw Object.assign(new Error('不支持的客户端查询'),{code:'INVALID_ARGUMENT'});
 const expected={modelKey:query.modelKey,revision:query.expectedRevision};
 const operations={'session.inspect':()=>workbench.inspect(),'model.inspect':()=>workbench.modelInspect(),'rig.list':()=>workbench.rigList(query.args),'library.list':()=>workbench.libraryList(query.args),
 'pose.fromClip':()=>workbench.fromClip({...query.args,...expected}),
 'pose.fromLibrary':()=>workbench.fromLibrary({...query.args,...expected}),
 'pose.fromSequence':()=>workbench.fromSequence({...query.args,...expected}),
 'timeline.insertPoseAt':()=>workbench.timeline.insertPoseAt(query.args,expected),
 'sequence.sample':()=>workbench.sampleSequenceRange(query.args,expected),
 'view.captureSequence':()=>workbench.captureSequence(query.args,expected),
 'export.video':()=>workbench.exportVideo(query.args,expected),
 'pose.setRootTransform':()=>workbench.setRootTransform(query.args,expected),
 'timeline.inspect':()=>workbench.timeline.inspect(),
 'timeline.append':()=>workbench.timeline.append(query.args,expected),'timeline.move':()=>workbench.timeline.move(query.args,expected),
 'timeline.remove':()=>workbench.timeline.remove(query.args,expected),'timeline.resize':()=>workbench.timeline.resize(query.args,expected),
 'timeline.trim':()=>workbench.timeline.trim(query.args,expected),'timeline.transition':()=>workbench.timeline.transition(query.args,expected),
 'timeline.undo':()=>workbench.timeline.history('undo',expected),'timeline.redo':()=>workbench.timeline.history('redo',expected),
 'timeline.saveAction':()=>workbench.timeline.save({...query.args,assistant:true},expected),'preview.sequence':()=>workbench.preview(query.args,expected),
 'export.glb':()=>workbench.exportGLB(query.args,expected),
 'preview.setRootMotion':()=>workbench.setRootMotion(query.args,expected),
 'pose.setBones':()=>workbench.setBones(query.args.changes,expected),
 'pose.undo':()=>workbench.draftHistory('undo',expected),'pose.redo':()=>workbench.draftHistory('redo',expected),
 'pose.discard':()=>{workbench.discardDraft(expected);return {revision:workbench.inspect().revision};},
 'pose.save':()=>workbench.saveDraft({...query.args,assistant:true},expected),'view.capture':()=>workbench.captureViews(query.args.views,expected,query.args.options),
 'workspace.list':()=>workbench.aiWorkspace.list(query.args),'workspace.create':()=>workbench.aiWorkspace.create(query.args,expected),'workspace.activate':()=>workbench.aiWorkspace.activate(query.args,expected),'workspace.update':()=>workbench.aiWorkspace.update(query.args,expected),'workspace.cleanup':()=>workbench.aiWorkspace.cleanup(query.args,expected),'workspace.restore':()=>workbench.aiWorkspace.restore(query.args,expected)};
 const success=result=>({requestId:query.requestId,sessionId:query.sessionId,ok:true,revision:result.revision,result});
 const failed=error=>({requestId:query.requestId,sessionId:query.sessionId,ok:false,error:{code:error.code??'QUERY_FAILED',message:error.message.slice(0,300)}});
 try{const result=operations[query.operation]();return result?.then?result.then(success,failed):success(result);}
 catch(error){return failed(error);}
}
