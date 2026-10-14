const {DatabaseSync,backup}=require('node:sqlite');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const lockfile=require('proper-lockfile');
const Ajv=require('ajv');
const HASH=/^[a-f0-9]{64}$/;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const ajv=new Ajv();
const validate=ajv.compile({type:'object',additionalProperties:false,required:['id','json','files'],properties:{id:{type:'string',minLength:1,maxLength:200},json:{type:'string',maxLength:128*1024**2},files:{type:'array',maxItems:300,items:{type:'object',additionalProperties:false,required:['name','mime','modified','bytes'],properties:{name:{type:['string','null'],maxLength:260},mime:{type:'string',maxLength:120},modified:{type:'number',minimum:0},bytes:{}}}}}});
async function regular(file){const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink())throw new Error('素材库含非普通文件');return info;}
async function readJSON(file){await regular(file);return JSON.parse(await fs.readFile(file,'utf8'));}
function checkRecord(record){
 if(!validate(record))throw new Error('素材记录格式无效');
 const json=JSON.parse(record.json);if(json?.id!==record.id)throw new Error('素材标识不一致');
 const visit=value=>{if(!value||typeof value!=='object')return;if(Object.keys(value).length===1&&Object.hasOwn(value,'__motiondeckFile')){if(!Number.isInteger(value.__motiondeckFile)||value.__motiondeckFile<0||value.__motiondeckFile>=record.files.length)throw new Error('素材文件引用无效');return;}for(const child of Object.values(value))visit(child);};visit(json);
 let size=record.json.length;
 for(const file of record.files){if(!(file.bytes instanceof ArrayBuffer)&&!ArrayBuffer.isView(file.bytes))throw new Error('素材文件字节无效');size+=file.bytes.byteLength;}
 if(size>512*1024**2)throw new Error('单条素材超过512MB预算');
 return json;
}
async function assertDirectory(root){if(!path.isAbsolute(root)||path.parse(root).root===root)throw new Error('请使用独立的绝对目录');await fs.mkdir(root,{recursive:true});const info=await fs.lstat(root);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('目录不能是符号链接');return fs.realpath(root);}
class Library{
 static async open(root,{create=false,readonly=false}={}){
  root=await assertDirectory(root);const marker=path.join(root,'library.json');
  let initialized=false;
  if(create){const names=await fs.readdir(root);if(!names.length){try{await fs.writeFile(marker,JSON.stringify({format:'motiondeck-library',version:1,id:randomUUID()}),{encoding:'utf8',flag:'wx'});initialized=true;}catch(error){if(error.code!=='EEXIST')throw error;}}}
  const identity=await readJSON(marker);if(identity.format!=='motiondeck-library'||identity.version!==1||typeof identity.id!=='string')throw new Error('不是受支持的MotionDeck素材库');
  const library=new Library();library.root=root;library.identity=identity;library.compromised=null;
  library.release=await lockfile.lock(marker,{retries:0,stale:10000,update:2000,onCompromised:error=>{library.compromised=error;}});
  try{
   await fs.mkdir(path.join(root,'objects'),{recursive:true});
   if((await fs.lstat(path.join(root,'objects'))).isSymbolicLink())throw new Error('素材目录不能是符号链接');
   const dbFile=path.join(root,'library.sqlite');
   try{await regular(dbFile);}catch(error){if(error.code!=='ENOENT')throw error;if(!initialized)throw new Error('素材库索引丢失，已停止加载，不新建空库');}
   library.db=new DatabaseSync(dbFile,{timeout:5000,allowExtension:false,readOnly:readonly});
   if(!readonly)library.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);');
   await library.verify();return library;
  }catch(error){library.db?.close();await library.release();throw error;}
 }
 assert(){if(this.compromised)throw new Error('素材库锁已失效，已停止写入，请重启客户端');}
 path(hash){if(!HASH.test(hash))throw new Error('素材哈希无效');return path.join(this.root,'objects',hash);}
 async bytes(file){const target=this.path(file.hash);await regular(target);const bytes=await fs.readFile(target);if(bytes.length!==file.size||digest(bytes)!==file.hash)throw new Error('素材文件校验失败');return bytes;}
 async verify(){this.assert();if(this.db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('素材索引损坏');for(const row of this.db.prepare('SELECT id,payload FROM records').all()){const record=JSON.parse(row.payload);if(record.version!==1||record.id!==row.id)throw new Error('素材记录版本或标识无效');const files=[];for(const file of record.files)files.push({...file,bytes:await this.bytes(file)});checkRecord({id:record.id,json:record.json,files:files.map(({name,mime,modified,bytes})=>({name,mime,modified,bytes}))});}}
 async get(id){this.assert();if(typeof id!=='string'||id.length>200)throw new Error('素材标识无效');const row=this.db.prepare('SELECT payload FROM records WHERE id=?').get(id);if(!row)return null;const record=JSON.parse(row.payload),files=[];for(const file of record.files)files.push({name:file.name,mime:file.mime,modified:file.modified,bytes:await this.bytes(file)});return {id:record.id,json:record.json,files};}
 async put(records,deleteIds=[]){
  this.assert();if(!Array.isArray(records)||records.length>500||!Array.isArray(deleteIds)||deleteIds.some(id=>typeof id!=='string'||id.length>200))throw new Error('素材事务无效');
  for(const record of records)checkRecord(record);
  const payloads=[];
  for(const record of records){const files=[];for(const file of record.files){const bytes=Buffer.from(file.bytes instanceof ArrayBuffer?file.bytes:file.bytes.buffer.slice(file.bytes.byteOffset,file.bytes.byteOffset+file.bytes.byteLength)),hash=digest(bytes),target=this.path(hash);
    try{await regular(target);await this.bytes({hash,size:bytes.length});}catch(error){if(error.code!=='ENOENT')throw error;const temporary=path.join(this.root,'objects','.write-'+randomUUID()),handle=await fs.open(temporary,'wx');try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}await fs.rename(temporary,target);}
    files.push({name:file.name,mime:file.mime,modified:file.modified,hash,size:bytes.length});
   }payloads.push({version:1,id:record.id,json:record.json,files});}
  this.assert();this.db.exec('BEGIN IMMEDIATE');
  try{const remove=this.db.prepare('DELETE FROM records WHERE id=?'),put=this.db.prepare('INSERT INTO records VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload');for(const id of deleteIds)remove.run(id);for(const record of payloads)put.run(record.id,JSON.stringify(record));this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 count(){return this.db.prepare('SELECT COUNT(*) AS n FROM records').get().n;}
 migrated(){return !!this.db.prepare("SELECT value FROM meta WHERE key='indexeddb-migrated'").get();}
 markMigrated(){this.db.prepare("INSERT INTO meta VALUES('indexeddb-migrated','1') ON CONFLICT(key) DO UPDATE SET value='1'").run();}
 async snapshot(destination){
  this.assert();destination=await assertDirectory(destination);if((await fs.readdir(destination)).length)throw new Error('目标目录必须为空，不能覆盖已有文件');
  await fs.mkdir(path.join(destination,'objects'));await backup(this.db,path.join(destination,'library.sqlite'));
  const hashes=new Map();for(const row of this.db.prepare('SELECT payload FROM records').all())for(const file of JSON.parse(row.payload).files)hashes.set(file.hash,file);
  for(const [hash,file] of hashes){await this.bytes(file);await fs.copyFile(this.path(hash),path.join(destination,'objects',hash));}
  await fs.writeFile(path.join(destination,'library.json'),JSON.stringify(this.identity),'utf8');
  const copy=await Library.open(destination);try{await copy.verify();if(copy.count()!==this.count())throw new Error('素材数量不一致');}finally{await copy.close();}return destination;
 }
 async close(){this.db?.close();this.db=null;await this.release?.();this.release=null;}
}
module.exports={Library,checkRecord,assertDirectory};
