import {mkdirSync,existsSync,writeFileSync,readFileSync,chmodSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const directory=resolve(fileURLToPath(new URL('../.runtime/napcat/config',import.meta.url)));
const configs=['webui.json','onebot11.json','napcat.json'];
const imageByArch={arm64:'mlikiowa/napcat-docker@sha256:c5a74db0e7ce14dcc42c1ed1facdc8b0a47b29de65afe069c795608c149fa2cb',x64:'mlikiowa/napcat-docker@sha256:69c5ca84ec226d658d0d5cd19997c6c89169da3206faa2948c2dc67d669b6406'};
function run(args,options={}){return execFileSync('docker',args,{stdio:'inherit',...options});}
function init(){
  mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
  const present=configs.map(name=>existsSync(join(directory,name)));
  if(present.some(Boolean)&&!present.every(Boolean))throw new Error('桥接配置不完整，拒绝覆盖。请先备份并检查 .runtime/napcat/config。');
  if(!present.every(Boolean)){
    const token=()=>randomBytes(32).toString('base64url');
    const values=[{host:'0.0.0.0',port:6099,token:token(),disableWebUI:false},{network:{websocketServers:[{name:'echo-local',enable:true,host:'0.0.0.0',port:3001,messagePostFormat:'array',reportSelfMessage:true,token:token(),heartInterval:30000}]}},{fileLog:false,consoleLog:false,packetBackend:'auto'}];
    configs.forEach((name,i)=>writeFileSync(join(directory,name),JSON.stringify(values[i],null,2),{mode:0o600,flag:'wx'}));
  }
  console.log('桥接配置已就绪，已有令牌保持不变。仅本机查看文件中的令牌，不发给安装 AI。');
}
function start(){
  for(const name of configs)if(!existsSync(join(directory,name)))throw new Error('请先运行 npm run bridge:init。');
  const image=imageByArch[process.arch];if(!image)throw new Error('自动桥接仅支持 x64/arm64；其他平台请自行安装 NapCat。');
  let existing;try{existing=run(['inspect','--format','{{index .Config.Labels "org.echo-companion.owner"}}','echo-napcat'],{stdio:['ignore','pipe','ignore'],encoding:'utf8'}).trim();}catch{}
  if(existing!==undefined){if(existing!=='echo-companion')throw new Error('echo-napcat 名称被其他容器占用，不会改动。');run(['start','echo-napcat']);}
  else{
    run(['pull',image]);
    run(['run','-d','--name','echo-napcat','--label','org.echo-companion.owner=echo-companion','--restart=no','--memory=2g','--cpus=2','--pids-limit=512','--security-opt','no-new-privileges:true','-p','127.0.0.1:6099:6099','-p','127.0.0.1:3001:3001','--mount',`type=bind,source=${directory},target=/app/napcat/config`,'--mount','type=volume,source=echo-qq-data,target=/app/.config/QQ',image]);
  }
  console.log('已请求启动 QQ 桥接。WebUI：http://127.0.0.1:6099/webui/\n在本机读取 webui.json 的令牌登录后扫码。控制台使用 onebot11.json 的令牌。扫码后确认当前账号确实启用了 3001 正向 WebSocket。启动容器不代表 QQ 已登录。');
}
try{const action=process.argv[2]||'init';if(action==='init')init();else if(action==='start')start();else throw new Error('用法：node scripts/bridge.mjs init|start');}catch(e){console.error(e.message?.startsWith('Command failed')?'Docker 操作失败。请检查 Docker、镜像来源和网络，不要公开原始日志或令牌。':e.message);process.exitCode=1;}
