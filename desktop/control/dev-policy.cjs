// 自动开放仅供隔离的开发/验收实例；正式发行包始终需要用户主动授权。
function shouldAutoEnableControl({flag,dataDir,packaged,packageName}){
 return flag==='1'&&Boolean(dataDir)&&(!packaged||packageName==='motiondeck-acceptance');
}
module.exports={shouldAutoEnableControl};
