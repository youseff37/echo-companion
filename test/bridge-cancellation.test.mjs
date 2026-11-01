import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {WebSocketServer} from 'ws';
import {Bridge} from '../src/bridge.mjs';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('disconnect during an unfinished WebSocket upgrade promptly settles the original connect call',async t=>{
  const server=http.createServer();const sockets=new Set();
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  server.on('upgrade',()=>{}); // Deliberately hold the HTTP upgrade without a 101 response.
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const bridge=new Bridge();
  t.after(async()=>{bridge.disconnect();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));});
  const upgrading=once(server,'upgrade');
  const connecting=bridge.connect(`ws://127.0.0.1:${server.address().port}`,'synthetic-token','12345');
  const settled=connecting.then(value=>({ok:true,value}),error=>({ok:false,error}));
  await upgrading;bridge.disconnect();
  const outcome=await Promise.race([settled,delay(300).then(()=>({timeout:true}))]);
  assert.equal(outcome.timeout,undefined,'disconnect must reject pending handshakes, not leave the HTTP caller waiting forever');
  assert.equal(outcome.ok,false);assert.equal(bridge.state,'disconnected');assert.equal(bridge.socket,null);
});

async function workingBridge(t){
  const server=new WebSocketServer({host:'127.0.0.1',port:0});await once(server,'listening');
  let peer;
  server.on('connection',socket=>{peer=socket;socket.on('message',raw=>{
    const request=JSON.parse(raw.toString());
    const data=request.action==='get_login_info'?{user_id:12345,nickname:'synthetic bot'}:{online:true,good:true};
    socket.send(JSON.stringify({status:'ok',retcode:0,data,echo:request.echo}));
  });});
  const bridge=new Bridge();
  t.after(async()=>{bridge.disconnect();for(const socket of server.clients)socket.terminate();await new Promise(resolve=>server.close(resolve));});
  await bridge.connect(`ws://127.0.0.1:${server.address().port}`,'synthetic-token','12345');
  return {bridge,peer};
}

test('malformed JSON values from a bridge are ignored without crashing or reaching the message handler',async t=>{
  const {bridge,peer}=await workingBridge(t);const events=[];bridge.onMessage=event=>events.push(event);
  for(const raw of ['{broken','null','[]','123','"text"'])peer.send(raw);
  const status=await bridge.action('get_status');
  assert.equal(status.online,true);assert.equal(bridge.state,'connected');assert.deepEqual(events,[]);
});

test('a synchronous application message callback failure cannot crash the socket listener',async t=>{
  const {bridge,peer}=await workingBridge(t);bridge.onMessage=()=>{throw Error('synthetic handler failure');};
  peer.send(JSON.stringify({post_type:'message',message_type:'private',self_id:12345,user_id:54321}));
  const status=await bridge.action('get_status');
  assert.equal(status.online,true);assert.equal(bridge.state,'connected');
});
