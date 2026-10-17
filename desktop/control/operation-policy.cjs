const READ=new Set(['session.inspect','model.inspect','rig.list','library.list','request.status','timeline.inspect','sequence.sample','workspace.list']);
const LONG=new Set(['view.captureSequence','export.video']);
const isRead=operation=>READ.has(operation)||operation.startsWith('assistant.');
const timeout=operation=>LONG.has(operation)?90000:isRead(operation)?10000:30000;
module.exports={isRead,timeout};
