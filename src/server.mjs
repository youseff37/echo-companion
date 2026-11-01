import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join,extname} from 'node:path';
import {Store} from './store.mjs';
import {acquireInstance} from './instance.mjs';
import {Engine,validScope,validAccount,cleanText} from './engine.mjs';
import {Bridge,validateBridgeUrl} from './bridge.mjs';
import {AppError} from './model.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function validateSettings(input,previous){
  const c={...previous};
  const allowed=new Set(['name','persona','prompt','model','maxReplyChars','dailyCallLimit','contextTurns','bridgeUrl','expectedAccount']);
  for(const key of Object.keys(input))if(!allowed.has(key))throw new AppError('SETTING_INVALID','包含未知设置字段。');
  if(input.name!==undefined)c.name=cleanText(input.name,30);
  if(input.prompt!==undefined){if(typeof input.prompt!=='string'||input.prompt.length>1500)throw new AppError('SETTING_INVALID','角色补充最多 1500 字。');c.prompt=input.prompt;}
  for(const [key,values] of [['persona',['warm','playful','calm','custom']],['model',['deepseek-chat','deepseek-reasoner']]])if(input[key]!==undefined){if(!values.includes(input[key]))throw new AppError('SETTING_INVALID','性格或模型不受支持。');c[key]=input[key];}
  for(const [key,min,max] of [['maxReplyChars',40,500],['dailyCallLimit',1,1000],['contextTurns',0,12]])if(input[key]!==undefined){if(!Number.isInteger(input[key])||input[key]<min||input[key]>max)throw new AppError('SETTING_INVALID',`${key} 超出支持范围 ${min}–${max}。`);c[key]=input[key];}
  if(input.bridgeUrl!==undefined)c.bridgeUrl=validateBridgeUrl(input.bridgeUrl);
  if(input.expectedAccount!==undefined){if(input.expectedAccount!==''&&!validAccount(input.expectedAccount))throw new AppError('ACCOUNT_INVALID','QQ 号格式无效。');c.expectedAccount=input.expectedAccount;}
  return c;
}
async function body(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>16384)throw new AppError('BODY_LARGE','请求体过大。',413);chunks.push(chunk);}try{const value=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!value||Array.isArray(value)||typeof value!=='object')throw Error();return value;}catch{throw new AppError('JSON_INVALID','请求 JSON 无效。');}}
const equal=(a,b)=>typeof a==='string'&&/^[a-f0-9]{64}$/.test(a)&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createApp({engine,token,publicOrigin=null}){
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try{
      const host=req.headers.host||'';let hostName;try{hostName=new URL('http://'+host).hostname;}catch{}
      if(!['127.0.0.1','localhost','[::1]'].includes(hostName)&&(!publicOrigin||host!==new URL(publicOrigin).host))throw new AppError('HOST_INVALID','不允许的访问主机。',403);
      const url=new URL(req.url,'http://'+host);
      if(url.pathname.startsWith('/api/')){
        if(!equal(req.headers['x-echo-token'],token))throw new AppError('UNAUTHORIZED','请使用终端输出的完整本机控制链接重新打开。',401);
        const origin=req.headers.origin;
        if(origin&&origin!==`http://${host}`&&origin!==publicOrigin)throw new AppError('ORIGIN_INVALID','不允许的请求来源。',403);
        if(req.method==='GET'&&url.pathname==='/api/state')return json(200,engine.state());
        if(req.method==='GET'&&url.pathname==='/api/doctor')return json(200,{ok:true,bridge:engine.bridge.state,running:engine.running,hasKey:!!engine.key});
        if(req.method==='POST'){
          const b=await body(req);
          switch(url.pathname){
            case '/api/settings':{const old=engine.store.getConfig();const c=validateSettings(b,old);engine.pause();if(c.expectedAccount!==old.expectedAccount||c.bridgeUrl!==old.bridgeUrl)engine.bridge.disconnect();engine.store.saveConfig(c);break;}
            case '/api/credentials':engine.credentials(b);break;
            case '/api/credentials/clear':engine.clearCredentials();break;
            case '/api/bridge/connect':await engine.connect();break;
            case '/api/bridge/disconnect':engine.disconnect();break;
            case '/api/run':engine.run(b.mode);break;
            case '/api/pause':engine.pause();break;
            case '/api/preview':return json(200,await engine.preview(b.text,b.mode));
            case '/api/conversations/reset':engine.reset(b.scope);break;
            case '/api/scopes':{
              if(!validScope(b.id)||b.id==='web:preview'||typeof b.enabled!=='boolean')throw new AppError('SCOPE_INVALID','请选择有效的 QQ 好友或群。');
              const label=cleanText(b.label||b.id,40);const c=engine.store.getConfig();const existing=c.scopes.find(s=>s.id===b.id);if(!existing&&c.scopes.length>=30)throw new AppError('SCOPE_LIMIT','第一版最多保存 30 个会话。');
              engine.pause();c.scopes=c.scopes.filter(s=>s.id!==b.id);c.scopes.push({id:b.id,label,enabled:b.enabled});engine.store.saveConfig(c);break;
            }
            case '/api/memories':engine.addMemory(b.scope,b.content);break;
            default:{const match=url.pathname.match(/^\/api\/memories\/(\d+)\/approve$/);if(match)engine.approveMemory(match[1]);else throw new AppError('NOT_FOUND','接口不存在。',404);}
          }
          return json(200,engine.state());
        }
        if(req.method==='DELETE'){
          const memory=url.pathname.match(/^\/api\/memories\/(\d+)$/);const scope=url.pathname.match(/^\/api\/scopes\/(.+)$/);
          if(memory)engine.deleteMemory(memory[1]);else if(scope){const id=decodeURIComponent(scope[1]);engine.pause();const c=engine.store.getConfig();c.scopes=c.scopes.filter(s=>s.id!==id);engine.store.saveConfig(c);}else throw new AppError('NOT_FOUND','接口不存在。',404);
          return json(200,engine.state());
        }
        throw new AppError('NOT_FOUND','接口不存在。',404);
      }
      if(req.method!=='GET'&&req.method!=='HEAD')throw new AppError('METHOD','请求方法不受支持。',405);
      const files={'/':'public/index.html','/index.html':'public/index.html','/style.css':'public/style.css','/app.js':'public/app.js','/mark.svg':'public/mark.svg','/docs/AI_INSTALL.md':'docs/AI_INSTALL.md','/docs/HOSTING.md':'docs/HOSTING.md','/docs/PRODUCT_RESEARCH.md':'docs/PRODUCT_RESEARCH.md'};
      if(!files[url.pathname])throw new AppError('NOT_FOUND','页面不存在。',404);
      const path=join(root,files[url.pathname]);const content=readFileSync(path);const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.md':'text/plain; charset=utf-8','.svg':'image/svg+xml'};
      res.writeHead(200,{'Content-Type':types[extname(path)]});res.end(req.method==='HEAD'?undefined:content);
    }catch(e){if(!res.headersSent)json(e instanceof AppError?e.status:500,{error:e instanceof AppError?e.code:'INTERNAL',message:e instanceof AppError?e.message:'操作失败；请检查本机状态，勿公开密钥或聊天内容。'});else res.end();}
  });
  server.on('clientError',(_,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'));return server;
}
export function start(){
  const directory=resolve(process.env.ECHO_DATA_DIR||join(root,'.runtime'));mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
  const release=acquireInstance(directory);process.once('exit',release);
  const tokenPath=join(directory,'access.token');let token;
  if(existsSync(tokenPath))token=readFileSync(tokenPath,'utf8').trim();else{token=randomBytes(32).toString('hex');writeFileSync(tokenPath,token,{mode:0o600,flag:'wx'});}
  if(!/^[a-f0-9]{64}$/.test(token))throw new Error('控制令牌文件损坏，请在停止服务后检查。');
  const store=new Store(join(directory,'echo.sqlite'));const bridge=new Bridge();const engine=new Engine({store,bridge});
  const publicOrigin=process.env.ECHO_PUBLIC_ORIGIN||null;if(publicOrigin&&new URL(publicOrigin).protocol!=='https:')throw new Error('服务器访问地址必须为 HTTPS。');
  const bind=process.env.ECHO_BIND||'127.0.0.1';if(!['127.0.0.1','0.0.0.0'].includes(bind))throw new Error('监听地址不受支持。');
  const port=Number(process.env.PORT||8787);const server=createApp({engine,token,publicOrigin});
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'8787 或指定端口已被占用，请停止旧实例或设置 PORT。':'本机服务无法启动。');process.exitCode=1;bridge.disconnect();store.close();release();});
  server.listen(port,bind,()=>{const origin=publicOrigin||`http://127.0.0.1:${server.address().port}`;console.log(`回声 0.1.1 · 仅一个所有者 · 回复默认暂停\n控制链接（不要分享）：${origin}/#${token}`);});
  let closing=false;const stop=()=>{if(closing)return;closing=true;engine.pause();bridge.disconnect();server.close(()=>{store.close();release();process.exit(0);});setTimeout(()=>process.exit(0),3000).unref();};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);return {server,engine,store};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))start();
