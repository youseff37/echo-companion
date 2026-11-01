import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocketServer} from 'ws';
import {Bridge,validateBridgeUrl} from '../src/bridge.mjs';
async function fixture(t,mode='ok'){
 const server=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(r=>server.once('listening',r));
 server.on('connection',(socket,req)=>{
  assert.equal(req.headers.authorization,'Bearer synthetic-bridge-token');
  socket.on('message',raw=>{const request=JSON.parse(raw);let data;
   if(request.action==='get_login_info')data={user_id:mode==='wrong'?99999:12345,nickname:'synthetic'};
   else if(request.action==='get_status')data={online:mode!=='offline',good:true};
   else data=mode==='unknown'?{}:{message_id:7};
   socket.send(JSON.stringify({status:'ok',retcode:0,data,echo:request.echo}));
  });
 });
 t.after(()=>{for(const c of server.clients)c.terminate();return new Promise(r=>server.close(r));});return `ws://127.0.0.1:${server.address().port}`;
}
test('bridge validates loopback-only endpoints and rejects URL tokens',()=>{
 for(const url of ['wss://example.com:3001','ws://example.com:3001','ws://127.0.0.1:3001/?token=secret','file:///tmp'])assert.throws(()=>validateBridgeUrl(url));
 assert.equal(validateBridgeUrl('ws://127.0.0.1:3001'),'ws://127.0.0.1:3001/');
});
test('real synthetic websocket verifies account, online state, typed send and echo routing',async t=>{
 const url=await fixture(t);const b=new Bridge();t.after(()=>b.disconnect());await b.connect(url,'synthetic-bridge-token','12345');assert.equal(b.state,'connected');assert.equal((await b.send('private:54321','hello')).message_id,7);
});
for(const [mode,code] of [['wrong','ACCOUNT_MISMATCH'],['offline','QQ_OFFLINE']])test(`bridge rejects ${mode} account before ready`,async t=>{
 const url=await fixture(t,mode);const b=new Bridge();t.after(()=>b.disconnect());await assert.rejects(b.connect(url,'synthetic-bridge-token','12345'),e=>e.code===code);assert.notEqual(b.state,'connected');
});
test('bridge will not label a missing message ID as confirmed delivery',async t=>{
 const url=await fixture(t,'unknown');const b=new Bridge();t.after(()=>b.disconnect());await b.connect(url,'synthetic-bridge-token','12345');await assert.rejects(b.send('group:99999','hello'),e=>e.code==='SEND_UNKNOWN');
});
