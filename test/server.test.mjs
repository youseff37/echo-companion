import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {Store} from '../src/store.mjs';
import {Engine} from '../src/engine.mjs';
import {createApp,validateSettings} from '../src/server.mjs';

const TOKEN='a'.repeat(64);
async function setup(t,{publicOrigin=null}={}){
  const store=new Store(':memory:');
  const bridge={state:'disconnected',account:null,disconnect(){this.state='disconnected';this.account=null;},async connect(){throw Error('test must not connect a real account');},async send(){throw Error('test must not send');}};
  const engine=new Engine({store,bridge,key:'synthetic-deepseek-secret',bridgeToken:'synthetic-onebot-secret',model:async()=>{throw Error('unexpected paid request');}});
  const server=createApp({engine,token:TOKEN,publicOrigin});server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=server.address().port,host=`127.0.0.1:${port}`;
  t.after(async()=>{engine.pause();await new Promise(resolve=>server.close(resolve));store.close();});
  const request=(path,{method='GET',headers={},body}={})=>new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port,path,method,agent:false,headers:{Host:host,...headers}},res=>{
      let text='';res.setEncoding('utf8');res.on('data',s=>text+=s);res.on('end',()=>resolve({status:res.statusCode,text,headers:res.headers,json:()=>JSON.parse(text)}));
    });req.on('error',reject);if(body!==undefined)req.write(typeof body==='string'?body:JSON.stringify(body));req.end();
  });
  const auth={'X-Echo-Token':TOKEN,Origin:`http://${host}`,'Content-Type':'application/json'};
  return {store,bridge,engine,server,host,request,auth};
}

test('all state reads require the control token and do not leak credentials in errors or successful state',async t=>{
  const {request,auth}=await setup(t);
  for(const headers of [{},{'X-Echo-Token':'wrong'}]){
    const response=await request('/api/state',{headers});assert.equal(response.status,401);assert.equal(response.json().error,'UNAUTHORIZED');
    assert.equal(response.text.includes('synthetic-'),false);assert.equal(response.text.includes('expectedAccount'),false);
  }
  const response=await request('/api/state',{headers:auth});assert.equal(response.status,200);assert.equal(response.json().runtime.running,false);
  assert.equal(response.text.includes('synthetic-deepseek-secret'),false);assert.equal(response.text.includes('synthetic-onebot-secret'),false);
  assert.equal(response.headers['cache-control'],'no-store');assert.equal(response.headers['referrer-policy'],'no-referrer');assert.equal(response.headers['x-frame-options'],'DENY');
});

test('host rebinding and cross-origin access fail even with a valid token',async t=>{
  const {request,auth}=await setup(t);
  const badHost=await request('/api/state',{headers:{...auth,Host:'attacker.invalid'}});assert.equal(badHost.status,403);assert.equal(badHost.json().error,'HOST_INVALID');
  const badOrigin=await request('/api/state',{headers:{...auth,Origin:'https://attacker.invalid'}});assert.equal(badOrigin.status,403);assert.equal(badOrigin.json().error,'ORIGIN_INVALID');
  const noOrigin=await request('/api/state',{headers:{'X-Echo-Token':TOKEN}});assert.equal(noOrigin.status,200,'authenticated local installation agents may omit Origin');
});

test('invalid non-ASCII token is rejected as unauthorized rather than crashing the comparison',async t=>{
  const {request}=await setup(t);
  const response=await request('/api/state',{headers:{'X-Echo-Token':'é'.repeat(64)}});
  assert.equal(response.status,401);assert.equal(response.json().error,'UNAUTHORIZED');
});

test('configured public origin is still token-protected and does not permit other domains',async t=>{
  const {request}=await setup(t,{publicOrigin:'https://companion.example'});
  const missing=await request('/api/state',{headers:{Host:'companion.example',Origin:'https://companion.example'}});assert.equal(missing.status,401);
  const allowed=await request('/api/state',{headers:{Host:'companion.example',Origin:'https://companion.example','X-Echo-Token':TOKEN}});assert.equal(allowed.status,200);
  const denied=await request('/api/state',{headers:{Host:'other.example',Origin:'https://other.example','X-Echo-Token':TOKEN}});assert.equal(denied.status,403);
});

test('malformed and oversized settings never mutate prior configuration or expose request contents',async t=>{
  const {store,request,auth}=await setup(t);const before=store.getConfig();
  for(const body of ['{broken','null','[]']){
    const response=await request('/api/settings',{method:'POST',headers:auth,body});assert.equal(response.status,400);assert.equal(response.json().error,'JSON_INVALID');
  }
  const unknown=await request('/api/settings',{method:'POST',headers:auth,body:{deepseekKey:'synthetic-secret-body'}});assert.equal(unknown.status,400);assert.equal(unknown.text.includes('synthetic-secret-body'),false);
  const huge=await request('/api/settings',{method:'POST',headers:auth,body:{prompt:'x'.repeat(17000)}});assert.equal(huge.status,413);
  assert.deepEqual(store.getConfig(),before);
});

test('updating credentials keeps them in memory and returns only presence flags',async t=>{
  const {store,request,auth}=await setup(t);
  const response=await request('/api/credentials',{method:'POST',headers:auth,body:{deepseekKey:'synthetic-replacement-key',onebotToken:'synthetic-replacement-token'}});
  assert.equal(response.status,200);assert.equal(response.json().setup.hasKey,true);assert.equal(response.json().runtime.running,false);
  assert.equal(response.text.includes('synthetic-replacement-key'),false);assert.equal(response.text.includes('synthetic-replacement-token'),false);
  assert.equal(JSON.stringify(store.getConfig()).includes('synthetic-replacement'),false);
  const cleared=await request('/api/credentials/clear',{method:'POST',headers:auth,body:{}});assert.equal(cleared.json().setup.hasKey,false);assert.equal(cleared.json().setup.hasBridgeToken,false);
});

test('settings and scopes are saved without implicitly starting replies, invalid fields roll back',async t=>{
  const {store,request,auth}=await setup(t);
  let response=await request('/api/settings',{method:'POST',headers:auth,body:{name:'合成回声',expectedAccount:'12345',dailyCallLimit:10}});assert.equal(response.status,200);assert.equal(response.json().runtime.running,false);
  const before=store.getConfig();
  response=await request('/api/settings',{method:'POST',headers:auth,body:{dailyCallLimit:0}});assert.equal(response.status,400);assert.deepEqual(store.getConfig(),before);
  response=await request('/api/scopes',{method:'POST',headers:auth,body:{id:'private:54321',enabled:true,label:'合成好友'}});assert.equal(response.status,200);assert.equal(response.json().runtime.running,false);assert.equal(response.json().config.scopes[0].enabled,true);
  response=await request('/api/scopes',{method:'POST',headers:auth,body:{id:'web:preview',enabled:true}});assert.equal(response.status,400);
});

test('memory deletion clears only its own short-term context and requires authentication',async t=>{
  const {store,request,auth}=await setup(t);store.addMemory('private:54321','合成记忆','approved');const memory=store.memories()[0];
  store.addTurn('private:54321','user','A 的旧消息');store.addTurn('private:65432','user','B 的旧消息');
  const denied=await request(`/api/memories/${memory.id}`,{method:'DELETE'});assert.equal(denied.status,401);assert.equal(store.memories().length,1);
  const allowed=await request(`/api/memories/${memory.id}`,{method:'DELETE',headers:auth});assert.equal(allowed.status,200);assert.deepEqual(store.memories(),[]);assert.deepEqual(store.history('private:54321',12),[]);assert.equal(store.history('private:65432',12)[0].content,'B 的旧消息');
});

test('private files are never served, including runtime files and source code',async t=>{
  const {request}=await setup(t);
  for(const path of ['/.runtime/access.token','/.runtime/echo.sqlite','/src/server.mjs','/../src/server.mjs','/%2e%2e/src/server.mjs']){
    const response=await request(path);assert.equal(response.status,404);assert.equal(response.text.includes(TOKEN),false);
  }
});

test('settings validation rejects external bridge addresses and model/limit values outside the supported contract',()=>{
  const previous={name:'回声',expectedAccount:'',bridgeUrl:'ws://127.0.0.1:3001',scopes:[]};
  for(const input of [{bridgeUrl:'ws://example.invalid:3001'},{bridgeUrl:'wss://127.0.0.1:3001'},{bridgeUrl:'ws://127.0.0.1:3001/?token=secret'},{model:'arbitrary-model'},{contextTurns:13},{maxReplyChars:1},{expectedAccount:'not-an-account'}])assert.throws(()=>validateSettings(input,previous));
  assert.deepEqual(previous,{name:'回声',expectedAccount:'',bridgeUrl:'ws://127.0.0.1:3001',scopes:[]});
});

test('DSH inspection is authenticated and reports no shared chat or QQ validation',async t=>{
  const {request,auth}=await setup(t);
  assert.equal((await request('/api/dsh/state')).status,401);
  const response=await request('/api/dsh/state',{headers:auth});assert.equal(response.status,200);
  const state=response.json();assert.equal(state.independent,true);assert.equal(state.chatVerified,false);assert.equal(state.running,null);
  assert.equal(typeof state.installed,'boolean');assert.equal(response.text.includes('synthetic-'),false);
  for(const key of ['key','token','directory','account','home'])assert.equal(Object.hasOwn(state,key),false);
});

test('the local download site serves its documented relative guides without exposing arbitrary files',async t=>{
  const {request}=await setup(t);
  for(const path of ['/ai-install.txt','/version-manifest.json','/download/','/download/version-manifest.json','/download/docs/AI_INSTALL.md','/download/docs/DSH_QUICKSTART.md','/download/docs/HOSTING.md','/download/docs/ASSETS.md','/download/docs/VERIFICATION.md']){
    const response=await request(path);assert.equal(response.status,200,path);
  }
  const missing=await request('/download/docs/../../src/server.mjs');assert.equal(missing.status,404);
});
