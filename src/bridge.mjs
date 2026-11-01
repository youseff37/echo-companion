import WebSocket from 'ws';
import {AppError} from './model.mjs';
export function validateBridgeUrl(raw){
  let u;try{u=new URL(raw);}catch{throw new AppError('BRIDGE_URL','请输入有效的本机 WebSocket 地址。');}
  if(u.protocol!=='ws:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!u.port)throw new AppError('BRIDGE_URL','QQ 桥接只支持本机 ws://127.0.0.1:端口；远程服务请先建 SSH 隧道。');
  return u.href;
}
export class Bridge{
  constructor(){this.socket=null;this.pending=new Map();this.account=null;this.state='disconnected';this.onMessage=()=>{};this.onDisconnect=()=>{};this.healthTimer=null;this.openReject=null;}
  disconnect(){
    this.openReject?.(new AppError('CANCELLED','QQ 连接已取消。',409));this.openReject=null;
    clearInterval(this.healthTimer);this.healthTimer=null;
    const old=this.socket;this.socket=null;this.state='disconnected';this.account=null;
    if(old){old.removeAllListeners();old.on('error',()=>{});old.terminate();}
    for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(new AppError('BRIDGE_OFFLINE','QQ 桥接已断开。',409));}this.pending.clear();
  }
  async connect(url,token,expected){
    this.disconnect();this.state='connecting';url=validateBridgeUrl(url);
    const ws=new WebSocket(url,{headers:{Authorization:`Bearer ${token}`},maxPayload:1024*1024,handshakeTimeout:10000});this.socket=ws;
    ws.on('message',raw=>{if(this.socket!==ws)return;let data;try{data=JSON.parse(raw.toString());}catch{return;}
      if(!data||typeof data!=='object'||Array.isArray(data))return;
      if(data.echo && this.pending.has(data.echo)){
        const p=this.pending.get(data.echo);this.pending.delete(data.echo);clearTimeout(p.timer);
        if(data.retcode===0&&data.status==='ok')p.resolve(data.data);else p.reject(new AppError('BRIDGE_ACTION','QQ 桥接拒绝了请求。',502));
      }else if(this.state==='connected')Promise.resolve().then(()=>this.onMessage(data)).catch(()=>{});
    });
    const lost=()=>{if(this.socket===ws){this.disconnect();this.state='error';this.onDisconnect();}};
    ws.on('close',lost);ws.on('error',lost);
    try{
      await new Promise((resolve,reject)=>{
        const finish=(fn,value)=>{if(this.openReject===cancel)this.openReject=null;fn(value);};
        const cancel=error=>finish(reject,error);this.openReject=cancel;
        ws.once('open',()=>finish(resolve));
        ws.once('error',()=>cancel(new AppError('BRIDGE_OFFLINE','无法连接 QQ 桥接；检查端口与 OneBot 令牌。',502)));
        ws.once('close',()=>cancel(new AppError('BRIDGE_OFFLINE','QQ 桥接已关闭。',502)));
      });
      if(this.socket!==ws)throw new AppError('BRIDGE_OFFLINE','QQ 连接已取消。',409);
      const info=await this.action('get_login_info');
      if(this.socket!==ws)throw new AppError('CANCELLED','QQ 连接已取消。',409);
      const status=await this.action('get_status');
      if(this.socket!==ws)throw new AppError('CANCELLED','QQ 连接已取消。',409);
      if(String(info?.user_id)!==expected)throw new AppError('ACCOUNT_MISMATCH','扫码账号与预期 QQ 号不一致；已断开。');
      if(status?.online!==true||status?.good!==true)throw new AppError('QQ_OFFLINE','QQ 尚未在线，请先扫码登录。');
      this.account={id:expected,name:String(info.nickname||'QQ 伙伴')};this.state='connected';
      this.healthTimer=setInterval(()=>this.action('get_status').then(s=>{if(!s?.online||!s?.good)lost();}).catch(lost),30000);this.healthTimer.unref();
      return this.account;
    }catch(error){if(this.socket===ws){this.disconnect();this.state='error';}throw error;}
  }
  action(action,params={}){
    if(!this.socket||this.socket.readyState!==WebSocket.OPEN)return Promise.reject(new AppError('BRIDGE_OFFLINE','QQ 桥接未连接。',409));
    const echo=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(echo);reject(new AppError('BRIDGE_TIMEOUT','QQ 接口未确认结果；不会自动重发。',504));},10000);
      this.pending.set(echo,{resolve,reject,timer});
      this.socket.send(JSON.stringify({action,params,echo}),error=>{if(error&&this.pending.has(echo)){this.pending.delete(echo);clearTimeout(timer);reject(new AppError('BRIDGE_SEND','QQ 请求提交失败；结果可能未知，不自动重发。',502));}});
    });
  }
  async send(scope,text){
    const [kind,id]=scope.split(':');const params={message:[{type:'text',data:{text}}]};params[kind==='group'?'group_id':'user_id']=id;
    const result=await this.action(kind==='group'?'send_group_msg':'send_private_msg',params);
    if(!result?.message_id)throw new AppError('SEND_UNKNOWN','QQ 未返回消息编号；结果未知，不自动重发。',502);
    return result;
  }
}
