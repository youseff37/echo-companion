import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../src/engine.mjs';
import {Store} from '../src/store.mjs';
import {AppError} from '../src/model.mjs';

const ACCOUNT='12345';
const SCOPE='private:54321';
const otherScope='private:65432';
const result=(overrides={})=>({reply:'合成回复',memory_candidate:null,usage:{prompt_tokens:12,completion_tokens:4},...overrides});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function event(id,options={}){
  return {post_type:'message',message_type:'private',self_id:12345,user_id:54321,message_id:id,time:Date.now()/1000,message:[{type:'text',data:{text:'合成测试消息'}}],...options};
}
function setup(t,{model=async()=>result(),send,scopes=[{id:SCOPE,label:'合成好友',enabled:true}],config={}}={}){
  const store=new Store(':memory:');
  store.saveConfig({...store.getConfig(),expectedAccount:ACCOUNT,scopes,...config});
  const sent=[];
  const bridge={state:'connected',account:{id:ACCOUNT},onMessage:null,onDisconnect:null,
    disconnect(){this.state='disconnected';this.account=null;},
    async connect(){this.state='connected';this.account={id:ACCOUNT};return this.account;},
    async send(scope,text){sent.push({scope,text});return send?send(scope,text):{message_id:'synthetic-outbound'};}
  };
  const engine=new Engine({store,bridge,model,key:'synthetic-deepseek-secret',bridgeToken:'synthetic-onebot-secret'});
  t.after(()=>{engine.pause();store.close();});
  return {engine,store,bridge,sent};
}

test('QQ stays paused until run and rejects wrong account, unselected peer, stale events and self messages',async t=>{
  let calls=0;const {engine,sent}=setup(t,{model:async()=>{calls++;return result();}});
  await engine.receive(event('paused'));
  engine.run('continuous');
  await engine.receive(event('wrong-account',{self_id:99999}));
  await engine.receive(event('wrong-peer',{user_id:65432}));
  await engine.receive(event('self',{user_id:12345}));
  await engine.receive(event('old',{time:Date.now()/1000-121}));
  await engine.receive(event('future',{time:Date.now()/1000+121}));
  assert.equal(calls,0);assert.equal(sent.length,0);
  await engine.receive(event('allowed'));
  assert.equal(calls,1);assert.equal(sent.length,1);
});

test('real @ segment is required for a selected group; prose @ and at-all do not trigger',async t=>{
  const {engine,sent}=setup(t,{scopes:[{id:'group:77777',label:'合成群',enabled:true}]});
  engine.run('continuous');
  await engine.receive(event('text-only',{message_type:'group',group_id:77777,message:[{type:'text',data:{text:'@12345 你好'}}]}));
  await engine.receive(event('all',{message_type:'group',group_id:77777,message:[{type:'at',data:{qq:'all'}},{type:'text',data:{text:'你好'}}]}));
  assert.equal(sent.length,0);
  await engine.receive(event('actual-at',{message_type:'group',group_id:77777,message:[{type:'at',data:{qq:'12345'}},{type:'text',data:{text:'你好'}}]}));
  assert.deepEqual(sent.map(x=>x.scope),['group:77777']);
});

test('duplicates arriving during and after generation cause one model call and one send',async t=>{
  const started=deferred(),output=deferred();let calls=0;
  const {engine,store,sent}=setup(t,{model:async()=>{calls++;started.resolve();return output.promise;}});
  engine.run('continuous');const first=engine.receive(event('same-id'));await started.promise;
  await engine.receive(event('same-id'));output.resolve(result());await first;
  await engine.receive(event('same-id'));
  assert.equal(calls,1);assert.equal(sent.length,1);assert.equal(store.usage().calls,1);
});

test('pause aborts an in-flight model and ignores its late successful reply and memory candidate',async t=>{
  const started=deferred(),output=deferred();let signal;
  const {engine,store,sent}=setup(t,{model:async request=>{signal=request.signal;started.resolve();return output.promise;}});
  engine.run('continuous');const task=engine.receive(event('in-flight'));await started.promise;
  engine.pause();assert.equal(signal.aborted,true);
  output.resolve(result({memory_candidate:'喜欢安静的音乐'}));await task;
  assert.equal(engine.running,false);assert.equal(sent.length,0);
  assert.deepEqual(store.history(SCOPE,12),[]);assert.deepEqual(store.memories(SCOPE),[]);
});

test('an aborted old model failure cannot pause or overwrite the state of a newly started run',async t=>{
  const started=deferred(),output=deferred();
  const {engine,sent}=setup(t,{model:async()=>{started.resolve();return output.promise;}});
  engine.run('continuous');const task=engine.receive(event('old-model'));await started.promise;
  engine.pause();engine.run('continuous');
  output.reject(new AppError('CANCELLED','旧代次已取消。',409));await task;
  assert.equal(engine.running,true,'old model failure must not stop the new epoch');
  assert.equal(engine.error,null,'cancelled old work must not overwrite new run status');assert.equal(sent.length,0);
});

test('deleting memory clears its conversation and prevents an old model result from restoring it',async t=>{
  const started=deferred(),output=deferred(),inputs=[];let count=0;
  const {engine,store,sent}=setup(t,{model:async request=>{inputs.push(request);count++;if(count===1){started.resolve();return output.promise;}return result();}});
  store.addMemory(SCOPE,'喜欢安静的音乐','approved');
  const memory=store.memories(SCOPE)[0];store.addTurn(SCOPE,'user','旧对话');store.addTurn(SCOPE,'assistant','旧回复');
  engine.run('continuous');const task=engine.receive(event('before-forget'));await started.promise;
  assert.equal(inputs[0].memories[0].content,memory.content);
  engine.deleteMemory(memory.id);
  output.resolve(result({memory_candidate:memory.content}));await task;
  assert.equal(sent.length,0);assert.deepEqual(store.memories(SCOPE),[]);assert.deepEqual(store.history(SCOPE,12),[]);
  engine.run('continuous');await engine.receive(event('after-forget'));
  assert.deepEqual(inputs[1].memories,[]);assert.deepEqual(inputs[1].history,[]);assert.equal(sent.length,1);
});

test('approved memories and history are scoped; pending candidates and another peer are excluded',async t=>{
  const inputs=[];const {engine,store}=setup(t,{model:async request=>{inputs.push(request);return result();},scopes:[{id:SCOPE,label:'A',enabled:true},{id:otherScope,label:'B',enabled:true}]});
  store.addMemory(SCOPE,'A 已批准','approved');store.addMemory(SCOPE,'A 未批准','pending');
  store.addMemory(otherScope,'B 已批准','approved');store.addMemory('web:preview','网页记忆','approved');
  store.addTurn(SCOPE,'user','A 的旧消息');store.addTurn(otherScope,'user','B 的旧消息');
  engine.run('continuous');await engine.receive(event('A'));await engine.receive(event('B',{user_id:65432}));
  assert.deepEqual(inputs[0].memories.map(x=>x.content),['A 已批准']);assert.deepEqual(inputs[0].history.map(row=>({...row})),[{role:'user',content:'A 的旧消息'}]);
  assert.deepEqual(inputs[1].memories.map(x=>x.content),['B 已批准']);assert.deepEqual(inputs[1].history.map(row=>({...row})),[{role:'user',content:'B 的旧消息'}]);
});

test('once mode confirms at most one message even when another message is already queued',async t=>{
  const started=deferred(),output=deferred();let calls=0;
  const {engine,sent}=setup(t,{model:async()=>{calls++;started.resolve();return output.promise;},scopes:[{id:SCOPE,label:'A',enabled:true},{id:otherScope,label:'B',enabled:true}]});
  engine.run('once');const first=engine.receive(event('first'));await started.promise;
  const queued=engine.receive(event('second',{user_id:65432}));output.resolve(result());await Promise.all([first,queued]);
  assert.equal(calls,1);assert.equal(sent.length,1);assert.equal(engine.running,false);
});

test('pause while a send is awaiting confirmation does not restore history or memory afterward',async t=>{
  const started=deferred(),ack=deferred();
  const {engine,store,sent}=setup(t,{model:async()=>result({memory_candidate:'喜欢安静的音乐'}),send:async()=>{started.resolve();return ack.promise;}});
  engine.run('continuous');const task=engine.receive(event('pending-send'));await started.promise;
  engine.pause();ack.resolve({message_id:'late-confirmation'});await task;
  assert.equal(sent.length,1);assert.equal(engine.running,false);
  assert.deepEqual(store.history(SCOPE,12),[]);assert.deepEqual(store.memories(SCOPE),[]);
});

test('a late confirmation from an old once run cannot pause a newly started once run',async t=>{
  const started=deferred(),ack=deferred();
  const {engine,store}=setup(t,{send:async()=>{started.resolve();return ack.promise;}});
  engine.run('once');const task=engine.receive(event('old-run'));await started.promise;
  engine.pause();engine.run('once');ack.resolve({message_id:'late-confirmation'});await task;
  assert.equal(engine.running,true,'old epoch must not change the active run');
  assert.deepEqual(store.history(SCOPE,12),[]);
});

test('unknown send result pauses, retains the dedup claim and never retries or stores a reply as memory',async t=>{
  let calls=0;const {engine,store,sent}=setup(t,{model:async()=>{calls++;return result({memory_candidate:'喜欢音乐'});},send:async()=>{throw new AppError('SEND_UNKNOWN','合成的发送结果未知。',502);}});
  engine.run('continuous');await engine.receive(event('unknown'));
  assert.equal(engine.running,false);assert.equal(store.events()[0].kind,'unknown');
  engine.run('continuous');await engine.receive(event('unknown'));
  assert.equal(calls,1);assert.equal(sent.length,1);assert.deepEqual(store.history(SCOPE,12),[]);assert.deepEqual(store.memories(SCOPE),[]);
});

test('failed model attempts consume the daily cap, report unknown usage and do not auto retry',async t=>{
  let calls=0;const {engine,store,sent}=setup(t,{config:{dailyCallLimit:1},model:async()=>{calls++;throw new AppError('BALANCE_LOW','合成余额不足。',502);}});
  engine.run('continuous');await engine.receive(event('failure'));
  assert.equal(engine.running,false);assert.equal(store.usage().calls,1);assert.equal(store.usage().unknownUsage,1);
  engine.run('continuous');await engine.receive(event('capped'));
  assert.equal(calls,1);assert.equal(sent.length,0);assert.equal(store.usage().calls,1);
});

test('a new conversation invalidates old work, while only explicitly approved memories remain',async t=>{
  const started=deferred(),output=deferred();const {engine,store,sent}=setup(t,{model:async()=>{started.resolve();return output.promise;}});
  store.addMemory(SCOPE,'已批准的事实','approved');store.addTurn(SCOPE,'user','旧上下文');
  engine.run('continuous');const task=engine.receive(event('reset-race'));await started.promise;
  engine.reset(SCOPE);output.resolve(result());await task;
  assert.equal(sent.length,0);assert.deepEqual(store.history(SCOPE,12),[]);assert.equal(store.memories(SCOPE)[0].content,'已批准的事实');
});

test('offline demo is clearly labeled and costs no model call or QQ send',async t=>{
  let calls=0;const {engine,store,sent}=setup(t,{model:async()=>{calls++;return result();}});
  const response=await engine.preview('合成演示','demo');
  assert.equal(response.mode,'demo');assert.match(response.reply,/没有调用模型/);assert.equal(calls,0);assert.equal(store.usage().calls,0);assert.equal(sent.length,0);
});

test('credentials stay out of public state, usage and persisted configuration',async t=>{
  const {engine,store}=setup(t);const state=JSON.stringify(engine.state());
  assert.equal(state.includes('synthetic-deepseek-secret'),false);assert.equal(state.includes('synthetic-onebot-secret'),false);
  assert.equal(JSON.stringify(store.getConfig()).includes('synthetic-deepseek-secret'),false);
  assert.equal(engine.state().setup.hasKey,true);assert.equal(engine.state().setup.hasBridgeToken,true);
});

test('a cancelled older connect request cannot leave an error on a newer successful connection',async t=>{
  const first=deferred(),second=deferred();let attempts=0;
  const {engine,bridge}=setup(t);
  bridge.connect=async()=>{attempts++;return attempts===1?first.promise:second.promise;};
  const old=engine.connect();const current=engine.connect();
  first.reject(new AppError('CANCELLED','旧连接请求已取消。',409));await assert.rejects(old);
  second.resolve({id:ACCOUNT});await current;
  assert.equal(engine.error,null,'an obsolete connection must not overwrite the current connection status');
});

test('three labelled offline scenes show rice banter, being caught and practical help without model or memory side effects',async t=>{
 let calls=0;const {engine,store,sent}=setup(t,{model:async()=>{calls++;return result();}});
 const scenes=engine.state().demoScenarios;
 assert.deepEqual(scenes.map(s=>s.id),['rice','caught','help']);
 for(const scene of scenes){
  const demo=await engine.preview(scene.user,'demo');
  assert.equal(demo.scenario,scene.id);assert.equal(demo.emotion,scene.emotion);assert.equal(demo.mode,'demo');
  assert.match(demo.reply,/没有调用模型/);assert.match(demo.notice,/预先编写/);
 }
 assert.equal(calls,0);assert.equal(sent.length,0);assert.equal(store.usage().calls,0);
 assert.deepEqual(store.memories(),[]);assert.deepEqual(store.history('web:preview',12),[]);
});

test('emotion stays presentation metadata; QQ receives plain text and memory remains pending',async t=>{
 const {engine,store,sent}=setup(t,{model:async()=>result({reply:'这回我认错，继续干活。',emotion:'flustered',memory_candidate:'用户喜欢短回复'})});
 engine.run('once');await engine.receive(event('whale-expression'));
 assert.deepEqual(sent,[{scope:SCOPE,text:'这回我认错，继续干活。'}]);
 assert.equal(store.memories(SCOPE)[0].status,'pending');
 assert.equal(store.history(SCOPE,6).at(-1).content,'这回我认错，继续干活。');
});

test('format errors with provider usage consume one attempt with known counters rather than invented zero or unknown',async t=>{
 const {engine,store}=setup(t,{model:async()=>{
  const error=new AppError('MODEL_FORMAT','合成格式错误。',502);error.usage={prompt_tokens:50,completion_tokens:11};throw error;
 }});
 await assert.rejects(engine.preview('合成消息','live'),e=>e.code==='MODEL_FORMAT');
 assert.equal(store.usage().calls,1);assert.equal(store.usage().inputTokens,50);assert.equal(store.usage().outputTokens,11);assert.equal(store.usage().unknownUsage,0);
 assert.deepEqual(store.history('web:preview',12),[]);
});
