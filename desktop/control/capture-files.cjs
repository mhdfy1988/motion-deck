const {mkdir,lstat,writeFile,realpath,readFile}=require('node:fs/promises');
const {randomUUID,createHash}=require('node:crypto');
const path=require('node:path');
const {mediaManifest:validateManifest}=require('./validators.generated.cjs');
// 输出位置由现有导出目录配置决定，命令/渲染不提供路径或文件名。
async function writeCapture(exportsDirectory,bytes){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<24||bytes.byteLength>20*1024*1024)throw new Error('截图字节无效或超限');
 const data=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||data.subarray(12,16).toString()!=='IHDR')throw new Error('只接受PNG截图');
 const width=data.readUInt32BE(16),height=data.readUInt32BE(20);if(width<2||height<2||width>4096||height>4096)throw new Error('截图尺寸无效');
 const file=await writeOutput(exportsDirectory,'助手预览','.png',data);
 return {path:file,width,height,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};
}
async function writeOutput(exportsDirectory,folder,extension,data){
 const parent=await realpath(exportsDirectory),directory=path.join(parent,folder);await mkdir(directory,{recursive:true});
 const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink()||await realpath(directory)!==directory)throw new Error('截图输出目录不可为链接');
 const file=path.join(directory,randomUUID()+extension);await writeFile(file,data,{flag:'wx'});return file;
}
async function writeExport(exportsDirectory,bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<28||bytes.length>128*1024*1024)throw new Error('GLB字节无效或超限');
 const data=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(data.toString('ascii',0,4)!=='glTF'||data.readUInt32LE(4)!==2||data.readUInt32LE(8)!==data.length||data.readUInt32LE(16)!==0x4e4f534a)throw new Error('只接受GLB2动作');
 const length=data.readUInt32LE(12);if(length%4||length>data.length-20)throw new Error('GLB JSON块无效');
 const json=JSON.parse(data.subarray(20,20+length).toString('utf8'));if(json.asset?.version!=='2.0'||!json.animations?.length)throw new Error('GLB缺少动作');
 let offset=20+length;while(offset<data.length){if(offset+8>data.length)throw new Error('GLB块截断');const size=data.readUInt32LE(offset);if(size%4||offset+8+size>data.length)throw new Error('GLB块长度无效');offset+=8+size;}
 const file=await writeOutput(exportsDirectory,'助手导出','.glb',data);return {path:file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};
}
async function writeManifest(exportsDirectory,value){
 if(!validateManifest(value))throw new Error('截图索引结构无效');
 const directory=path.join(await realpath(exportsDirectory),'助手预览');
 for(const frame of value.frames){
  if(path.dirname(frame.path)!==directory||!/^[-a-f0-9]{36}\.png$/.test(path.basename(frame.path)))throw new Error('索引只能引用受控截图');
  const info=await lstat(frame.path);if(!info.isFile()||info.isSymbolicLink()||info.size!==frame.bytes)throw new Error('索引截图无效');
  const data=await readFile(frame.path);if(createHash('sha256').update(data).digest('hex')!==frame.sha256)throw new Error('索引截图摘要不符');
 }
 const data=Buffer.from(JSON.stringify({format:'motiondeck-review-v1',...value},null,2),'utf8');if(data.length>128*1024)throw new Error('截图索引超限');
 return {path:await writeOutput(exportsDirectory,'助手预览','.json',data),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};
}
async function writeVideo(exportsDirectory,value){
 if(!value||Object.keys(value).some(k=>!['extension','bytes'].includes(k))||!['mp4','webm'].includes(value.extension)||!(value.bytes instanceof Uint8Array)||value.bytes.length<32||value.bytes.length>128*1024*1024)throw new Error('视频字节或格式无效');
 const data=Buffer.from(value.bytes.buffer,value.bytes.byteOffset,value.bytes.byteLength);
 if(value.extension==='mp4'?(data.toString('ascii',4,8)!=='ftyp'):(data.subarray(0,4).toString('hex')!=='1a45dfa3'))throw new Error('视频文件头不符');
 return {path:await writeOutput(exportsDirectory,'助手导出','.'+value.extension,data),extension:value.extension,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};
}
module.exports={writeCapture,writeExport,writeManifest,writeVideo};
