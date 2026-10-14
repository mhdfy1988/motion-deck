const path=require('node:path');

const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream','.txt':'text/plain; charset=utf-8'};
const CSP="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self' blob: data:; worker-src 'self' blob:; frame-ancestors 'none'";

// 内部协议仅访问已打包的web/fixtures，不接受目录穿越、其他主机或写请求。
function resolveResource(request,root){
 if(!['GET','HEAD'].includes(request.method))return {status:405};
 let url,name;try{url=new URL(request.url);name=decodeURIComponent(url.pathname);}catch{return {status:400};}
 if(url.protocol!=='motiondeck:'||url.host!=='app'||url.username||url.password)return {status:403};
 if(name.includes('\\')||name.includes('\0')||name.split('/').some(part=>part==='..'))return {status:403};
 const fixture=name.startsWith('/fixtures/'),base=path.resolve(root,fixture?'fixtures':'web');
 const relative=fixture?name.slice(10):name==='/'?'labs/motion/index.html':name.slice(1),file=path.resolve(base,relative);
 if(!file.startsWith(base+path.sep))return {status:403};
 return {status:200,file,headers:{'Content-Type':types[path.extname(file)]??'application/octet-stream','Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}};
}
module.exports={resolveResource};
