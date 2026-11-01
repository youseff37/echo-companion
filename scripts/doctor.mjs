import {connect} from 'node:net';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const [major,minor]=process.versions.node.split('.').map(Number);const supported=major>22||major===22&&minor>=13;
let available=false,daemonReady=false;
try{execFileSync('docker',['--version'],{timeout:4000,stdio:'ignore'});available=true;execFileSync('docker',['info'],{timeout:5000,stdio:'ignore'});daemonReady=true;}catch{}
const reachable=await new Promise(resolve=>{const socket=connect({host:'127.0.0.1',port:3001});const end=value=>{socket.destroy();resolve(value);};socket.on('connect',()=>end(true));socket.on('error',()=>end(false));socket.setTimeout(1000,()=>end(false));});
const nextSteps=[];if(!supported)nextSteps.push('安装 Node.js 22.13+ 或较新的 LTS。');if(!reachable)nextSteps.push('未探测到本机 3001 桥接端口；先准备 NapCat 并扫码。网页练习聊天不需要 QQ 桥接。');if(!daemonReady)nextSteps.push('自动创建 QQ 桥接需要可运行的 Docker；也可连接你自己已安装的本机 NapCat。');
const report={ok:supported,node:{version:process.version,supported},dataDirectory:resolve(process.env.ECHO_DATA_DIR||fileURLToPath(new URL('../.runtime',import.meta.url))),bridge:{url:'ws://127.0.0.1:3001',reachable},docker:{available,daemonReady},nextSteps};
console.log(process.argv.includes('--json')?JSON.stringify(report,null,2):`回声环境检查\nNode ${report.node.version}：${supported?'支持':'不支持'}\nQQ 桥接端口：${reachable?'可达（不代表已登录）':'未就绪'}\nDocker：${daemonReady?'就绪':'未就绪，可用已有 NapCat'}\n${nextSteps.join('\n')}`);if(!supported)process.exitCode=1;
