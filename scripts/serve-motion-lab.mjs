// 独立只读静态服务，不加载主后端或项目存储。
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(import.meta.dirname,'../web'),fixtures=resolve(import.meta.dirname,'../fixtures');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.fbx':'application/octet-stream','.bin':'application/octet-stream'};
const server=createServer(async(req,res)=>{try{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname),base=path.startsWith('/fixtures/')?fixtures:root;
  if(path==='/'){res.writeHead(302,{Location:'/labs/motion/index.html'}).end();return;}
  const name=path==='/'?'labs/motion/index.html':path.startsWith('/fixtures/')?path.slice(10):path.slice(1),file=resolve(base,name);
  if(!file.startsWith(base+sep)){res.writeHead(403).end();return;}
  const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self' blob: data:; worker-src 'self' blob:; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:bytes);
}catch{res.writeHead(404).end('Not found');}});
server.listen(Number(process.env.PORT??8901),'127.0.0.1',()=>console.log('MotionDeck: http://127.0.0.1:'+(process.env.PORT??8901)+'/'));
