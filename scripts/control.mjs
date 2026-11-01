import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export async function control(action='status'){
  if(!['status','stop'].includes(action))throw new Error('只支持 status 或 stop。');
  const root=fileURLToPath(new URL('../',import.meta.url));
  const directory=resolve(process.env.ECHO_DATA_DIR||resolve(root,'.runtime'));
  let info;try{info=JSON.parse(readFileSync(resolve(directory,'service.json'),'utf8'));}catch{throw new Error('未找到运行记录。请先启动，或确认 ECHO_DATA_DIR 指向同一私有目录。');}
  if(!Number.isInteger(info.port)||info.port<1||info.port>65535)throw new Error('运行记录无效。');
  const token=readFileSync(resolve(directory,'access.token'),'utf8').trim();
  const response=await fetch(`http://127.0.0.1:${info.port}/api/${action==='stop'?'shutdown':'doctor'}`,{method:action==='stop'?'POST':'GET',headers:{'X-Echo-Token':token,'Content-Type':'application/json'},...(action==='stop'?{body:'{}'}:{}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error(`本机控制请求失败（${response.status}），请检查是否已更换数据目录或端口。`);
  const state=await response.json();
  return action==='stop'?{ok:true,stopping:state.stopping}:{ok:state.ok,running:state.running,bridge:state.bridge,hasKey:state.hasKey};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))control(process.argv[2]).then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{console.error('本机服务不可达或状态记录无效。检查启动终端，不要公开控制凭证。');process.exitCode=1;});
