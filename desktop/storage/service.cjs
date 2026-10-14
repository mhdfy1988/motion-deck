const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {Library,assertDirectory}=require('./library.cjs');

class DataService{
 requireLibrary(){if(!this.library)throw new Error('素材库不可用，请在设置中从完整备份恢复：'+this.recoveryError);return this.library;}
 protectedDirectory(directory){const inside=(target,base)=>{const relative=path.relative(base,target);return !relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};if([this.paths.personal,this.paths.cache,this.paths.logs,this.info().library].some(base=>inside(directory,base)||inside(base,directory)))throw new Error('目录不能与个人资料、缓存、日志或当前素材库重叠');}
 async init(paths){
  this.paths=paths;await assertDirectory(paths.personal);this.config=new DatabaseSync(path.join(paths.personal,'settings.sqlite'),{allowExtension:false});
  this.config.exec('CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  this.library=null;this.recoveryError=null;
  try{this.library=await Library.open(this.setting('library')??paths.library,{create:!this.setting('library')});}catch(error){this.recoveryError=error.message;}
  for(const name of ['exports','backups','logs','cache'])await assertDirectory(this.setting(name)??paths[name]);
  // 初始化后立即固定素材库位置；若以后目录丢失必须显式失败，不能新建空库顶替。
  if(this.library)this.save('library',this.library.root);return this.info();
 }
 setting(key){return this.config.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value;}
 save(key,value){this.config.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);}
 info(){return {...this.paths,library:this.library?.root??this.setting('library')??this.paths.library,exports:this.setting('lastExport')??this.setting('exports')??this.paths.exports,backups:this.setting('backups')??this.paths.backups,records:this.library?.count()??null,migrationNeeded:this.library?!this.library.migrated():false,recoveryRequired:this.recoveryError};}
 async log(message){await fs.appendFile(path.join(this.paths.logs,'storage.log'),`${new Date().toISOString()} ${message}\n`,'utf8');}
 async get(id){return this.requireLibrary().get(id);}
 async put({records,deleteIds=[]}){await this.requireLibrary().put(records,deleteIds);return true;}
 async migrate({records}){
  this.requireLibrary();
  if(this.library.migrated())return {already:true};if(this.library.count())throw new Error('磁盘库非空，不能自动覆盖迁移');
  // 旧数据库原样保留；额外生成可校验的迁移备份，先验证再切换完成标记。
  if(!records.length){this.library.markMigrated();return {records:0};}
  const candidate=await Library.open(path.join(path.dirname(this.library.root),'迁移素材库-'+randomUUID()),{create:true});
  const destination=path.join(this.info().backups,'旧库迁移-'+randomUUID());
  try{await candidate.put(records);await candidate.verify();candidate.markMigrated();await candidate.snapshot(destination);this.save('library',candidate.root);}catch(error){await candidate.close();throw error;}
  const old=this.library;this.library=candidate;await old.close();await this.log(`旧库迁移完成 ${records.length}条；备份 ${destination}`);return {records:records.length,backup:destination};
 }
 async setDirectory({kind,directory}){
  if(!['exports','backups'].includes(kind))throw new Error('不允许改变此目录');directory=await assertDirectory(directory);this.protectedDirectory(directory);this.save(kind,directory);if(kind==='exports')this.save('lastExport',directory);return this.info();
 }
 async rememberExport({directory}){directory=await assertDirectory(directory);this.save('lastExport',directory);return directory;}
 async moveLibrary({directory}){
  this.requireLibrary();
  directory=await assertDirectory(directory);if(directory===this.library.root)return this.info();this.protectedDirectory(directory);
  const destination=await this.library.snapshot(directory);const next=await Library.open(destination);const old=this.library;
  try{this.save('library',next.root);}catch(error){await next.close();throw error;}
  this.library=next;await old.close();await this.log(`素材库切换 ${old.root} -> ${next.root}；原目录保留`);return this.info();
 }
 async makeBackup(){this.requireLibrary();const destination=path.join(this.info().backups,'MotionDeck备份-'+randomUUID());await this.library.snapshot(destination);await this.log('备份完成 '+destination);return {directory:destination};}
 async restore({directory}){
  directory=path.resolve(directory);if(directory===this.info().library)throw new Error('不能把当前库作为恢复来源');
  const source=await Library.open(directory,{readonly:true});let target;
  try{await source.verify();if(this.library)await this.makeBackup();target=path.join(path.dirname(this.info().library),'恢复素材库-'+randomUUID());await source.snapshot(target);}finally{await source.close();}
  const next=await Library.open(target),old=this.library;try{this.save('library',next.root);}catch(error){await next.close();throw error;}this.library=next;this.recoveryError=null;await old?.close();return this.info();
 }
 async close(){await this.library?.close();this.library=null;this.config?.close();this.config=null;}
}
module.exports={DataService};
