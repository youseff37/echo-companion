import {openSync,readFileSync,writeFileSync,closeSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
export function acquireInstance(directory){
  const file=join(directory,'instance.lock');
  let fd;
  try{fd=openSync(file,'wx',0o600);}catch(error){
    if(error.code!=='EEXIST')throw error;
    let pid;try{pid=Number(JSON.parse(readFileSync(file,'utf8')).pid);}catch{}
    if(!Number.isInteger(pid)||pid<=0)throw new Error('实例锁尚未就绪或损坏；请先确认没有大肥鱼进程，再检查私有目录中的 instance.lock。');
    let stale=false;try{process.kill(pid,0);}catch(e){stale=e.code==='ESRCH';}
    if(!stale)throw new Error('同一数据目录已有大肥鱼实例运行，拒绝重复启动。请回到原终端或先停止旧实例。');
    unlinkSync(file);fd=openSync(file,'wx',0o600);
  }
  writeFileSync(fd,JSON.stringify({pid:process.pid}));closeSync(fd);
  let released=false;return ()=>{if(released)return;released=true;try{const data=JSON.parse(readFileSync(file,'utf8'));if(data.pid===process.pid)unlinkSync(file);}catch{}};
}
