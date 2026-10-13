// 仅录制画布，不请求摄像头、麦克风或桌面权限；编码格式按浏览器能力显式选择。
export function recordingType(Recorder=globalThis.MediaRecorder){
 if(!Recorder)throw new Error('当前浏览器不支持录像，请使用新版Chrome');
 const mime=['video/mp4;codecs=avc1.42002a','video/webm;codecs=vp9'].find(type=>Recorder.isTypeSupported(type));
 if(!mime)throw new Error('当前浏览器没有可用的视频编码器');return mime;
}
const verifiedEncoders=new Map();
async function verifyEncoder(canvas,onStatus){
 recordingType();const types=['video/mp4;codecs=avc1.42002a','video/webm;codecs=vp9'].filter(type=>MediaRecorder.isTypeSupported(type));
 for(const type of types){const key=canvas.width+'x'+canvas.height+':'+type;
  if(verifiedEncoders.get(key))return type;
  onStatus('检查视频编码器 · '+(type.startsWith('video/mp4')?'MP4':'WebM'));
  const probe=document.createElement('canvas');probe.width=canvas.width;probe.height=canvas.height;const ctx=probe.getContext('2d'),stream=probe.captureStream(30);let recorder;
  try{recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:24000000});}catch{stream.getTracks().forEach(t=>t.stop());continue;}
  const size=await new Promise(resolve=>{let bytes=0,frame=0;const timer=setInterval(()=>{ctx.fillStyle=frame++%2?'#ff0000':'#0000ff';ctx.fillRect(0,0,probe.width,probe.height);},33);
   const end=setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},2000);
   recorder.ondataavailable=e=>bytes+=e.data.size;recorder.onerror=()=>{if(recorder.state!=='inactive')recorder.stop();};recorder.onstop=()=>{clearInterval(timer);clearTimeout(end);resolve(bytes);};
   try{recorder.start(100);}catch{clearInterval(timer);clearTimeout(end);resolve(0);}
  });stream.getTracks().forEach(t=>t.stop());
  if(size>2048){verifiedEncoders.set(key,true);return type;}
  console.info('[reference-capture] 编码预检未通过',type,size);
 }
 throw new Error('视频编码预检失败，请检查浏览器硬件加速');
}
export function downloadReference(blob,name){
 if(!blob?.size)throw new Error('没有生成有效文件');
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export class ReferenceCapture{
 constructor({canvas,draw,onStatus,release}){Object.assign(this,{canvas,draw,onStatus,release});this.recorder=null;}
 async photo(){this.draw();return new Promise((resolve,reject)=>this.canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('图片编码失败')),'image/png'));}
 async record({duration,sample,speed=1}){
  if(this.recorder)throw new Error('正在录像');
  if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(speed)||speed<=0||duration/speed>300)throw new Error('录像时长须在0—300秒内');
  this.cancelled=false;const mime=await verifyEncoder(this.canvas,this.onStatus);if(this.cancelled)throw new Error('录像已取消');
  const stream=this.canvas.captureStream(0),track=stream.getVideoTracks()[0];let recorder;
  if(typeof track.requestFrame!=='function'){stream.getTracks().forEach(t=>t.stop());throw new Error('当前浏览器不支持逐帧捕获，请使用新版Chrome');}
  try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:24000000});}catch(error){stream.getTracks().forEach(t=>t.stop());throw error;}
  this.recorder=recorder;
  return new Promise((resolve,reject)=>{
   const chunks=[];let total=0,failed=null,frame,timer,start,last=-Infinity;
   const stop=()=>{if(recorder.state!=='inactive')recorder.stop();};
   this.cancel=()=>{failed=new Error('录像已取消');stop();};
   const hidden=()=>{if(document.hidden){failed=new Error('页面进入后台，录像已取消，请保持页面可见');stop();}};
   recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);total+=e.data.size;if(total>128*1024**2){failed=new Error('录像超过128 MiB，请缩短编排');stop();}}};
   recorder.onerror=e=>{failed=e.error??new Error('视频编码失败');stop();};
   recorder.onstop=()=>{cancelAnimationFrame(frame);clearTimeout(timer);document.removeEventListener('visibilitychange',hidden);stream.getTracks().forEach(t=>t.stop());this.cancel=null;this.recorder=null;const blob=new Blob(chunks,{type:mime});failed?reject(failed):blob.size?resolve({blob,extension:mime.startsWith('video/mp4')?'mp4':'webm'}):reject(new Error('录像为空，未下载'));};
   const tick=now=>{try{const time=Math.min((now-start)/1000*speed,duration);if(now-last>=1000/30||time>=duration){sample(time);this.draw();track.requestFrame();last=now;}this.onStatus(`录像 ${((now-start)/1000).toFixed(1)} 秒 · ${mime.startsWith('video/mp4')?'MP4':'WebM'}`);if(time>=duration)stop();else frame=requestAnimationFrame(tick);}catch(error){failed=error;stop();}};
   try{sample(0);this.draw();recorder.start(250);track.requestFrame();start=performance.now();document.addEventListener('visibilitychange',hidden);timer=setTimeout(()=>{failed=new Error('录像超时，未下载');stop();},(duration/speed+5)*1000);frame=requestAnimationFrame(tick);}catch(error){failed=error;if(recorder.state!=='inactive')stop();else{stream.getTracks().forEach(t=>t.stop());this.recorder=null;reject(error);}}
  });
 }
 stop(){if(this.recorder?.state==='recording')this.recorder.stop();else this.cancelled=true;}
 dispose(){this.cancelled=true;this.cancel?.();this.release?.();this.release=null;}
}
