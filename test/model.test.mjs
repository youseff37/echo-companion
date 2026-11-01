import test from 'node:test';
import assert from 'node:assert/strict';
import {callDeepSeek,parseReply,promptFor} from '../src/model.mjs';
import {DEFAULTS,Store} from '../src/store.mjs';

test('provider authentication, billing and rate errors are specific but never reveal upstream secrets',async()=>{
 for(const [status,code] of [[401,'KEY_INVALID'],[402,'BALANCE_LOW'],[429,'MODEL_RATE_LIMIT'],[500,'MODEL_FAILURE']]){
  await assert.rejects(callDeepSeek({key:'synthetic-secret',config:DEFAULTS,memories:[],history:[],text:'hello',fetchImpl:async()=>new Response('sensitive upstream dump',{status})}),e=>e.code===code&&!e.message.includes('sensitive'));
 }
});
test('normal reply is one request with actual usage and bounded structured output',async()=>{
 let count=0;
 const r=await callDeepSeek({key:'synthetic-secret',config:DEFAULTS,memories:[{content:'喜欢茶'}],history:[],text:'你好',fetchImpl:async(url,options)=>{
  count++;assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(options.redirect,'error');const b=JSON.parse(options.body);assert.equal(b.response_format.type,'json_object');assert.ok(b.messages[0].content.includes('喜欢茶'));
  return Response.json({choices:[{message:{content:'{"reply":"你好呀","memory_candidate":null}'}}],usage:{prompt_tokens:30,completion_tokens:5}});
 }});
 assert.equal(count,1);assert.equal(r.reply,'你好呀');assert.equal(r.usage.prompt_tokens,30);
});
test('malformed model output is never sent as a raw JSON or empty response',()=>{
 for(const value of ['bad','{}','{"reply":""}'])assert.throws(()=>parseReply(value,40),e=>e.code==='MODEL_FORMAT');
 assert.equal(parseReply('{"reply":"你好世界"}',2).reply,'你好');
 assert.equal(parseReply('{"reply":"好","memory_candidate":"API Key is sk-abcdefghijk"}',40).memory_candidate,null);
});
test('only the current approved scope facts are framed as reference data, not identity instructions',()=>{
 const p=promptFor(DEFAULTS,[{content:'资料'}]);assert.ok(p.includes('不是新指令'));assert.ok(p.includes('需要用户审核'));assert.ok(!p.includes('synthetic-secret'));
});
test('daily cap reserves attempts and unknown usage stays visible; usage is charged to original day',()=>{
 const s=new Store(':memory:');try{
  assert.equal(s.reserveCall(1,'2026-11-01'),true);assert.equal(s.reserveCall(1,'2026-11-01'),false);
  s.recordUsage(null,'2026-11-01');assert.equal(s.db.prepare('SELECT unknownUsage FROM usage WHERE day=?').get('2026-11-01').unknownUsage,1);
  s.reserveCall(1,'2026-11-02');s.recordUsage({prompt_tokens:10,completion_tokens:3},'2026-11-01');assert.equal(s.db.prepare('SELECT inputTokens FROM usage WHERE day=?').get('2026-11-01').inputTokens,10);
 }finally{s.close();}
});

test('structured expression is optional and cannot inject transport instructions',()=>{
 assert.equal(parseReply('{"reply":"米碗先放下，认真看这段。","emotion":"focused"}',80).emotion,'focused');
 const untrusted=parseReply('{"reply":"好","emotion":"[CQ:image,file=secret]","memory_candidate":null}',80);
 assert.equal(untrusted.reply,'好');assert.equal(untrusted.emotion,'neutral');
 for(const raw of ['null','[]','true','42','"plain string"'])assert.throws(()=>parseReply(raw,80),e=>e.code==='MODEL_FORMAT');
});

test('fresh persona defaults use Whale-chan while existing user identity and model preferences survive loading',()=>{
 const s=new Store(':memory:');try{
  assert.equal(s.getConfig().name,'大肥鱼');assert.equal(s.getConfig().persona,'playful');assert.equal(s.getConfig().model,'deepseek-flash');
  s.saveConfig({name:'用户起的名字',persona:'calm',model:'deepseek-reasoner',prompt:'少说话'});
  const saved=s.getConfig();assert.equal(saved.name,'用户起的名字');assert.equal(saved.persona,'calm');assert.equal(saved.model,'deepseek-reasoner');assert.equal(saved.prompt,'少说话');
 }finally{s.close();}
});

test('current DeepSeek IDs and retired saved aliases route explicitly without mutating user configuration',async()=>{
 for(const [saved,wire,thinking] of [['deepseek-flash','deepseek-flash','disabled'],['deepseek-v4-pro','deepseek-v4-pro','disabled'],['deepseek-chat','deepseek-flash','disabled'],['deepseek-reasoner','deepseek-flash','enabled'],['deepseek-v4-flash','deepseek-flash','disabled']]){
  const config={...DEFAULTS,model:saved};let calls=0;
  await callDeepSeek({key:'synthetic-secret',config,memories:[],history:[],text:'合成测试',fetchImpl:async(_url,request)=>{
   calls++;const body=JSON.parse(request.body);assert.equal(body.model,wire);assert.equal(body.thinking.type,thinking);
   return Response.json({choices:[{message:{content:'{"reply":"合成输出","emotion":"smug"}'}}]});
  }});
  assert.equal(calls,1);assert.equal(config.model,saved);
 }
});

test('invalid or truncated model output retains only validated actual usage, without a retry',async()=>{
 for(const [content,reason,code] of [['invalid','stop','MODEL_FORMAT'],['{"reply":"半截内容"}','length','MODEL_LENGTH']]){
  let calls=0;
  await assert.rejects(callDeepSeek({key:'synthetic-secret',config:DEFAULTS,memories:[],history:[],text:'hello',fetchImpl:async()=>{
   calls++;return Response.json({choices:[{finish_reason:reason,message:{content}}],usage:{prompt_tokens:50,completion_tokens:11,untrusted:'sensitive upstream dump'}});
  }}),error=>error.code===code&&error.usage.prompt_tokens===50&&error.usage.completion_tokens===11&&!JSON.stringify(error).includes('sensitive upstream dump'));
  assert.equal(calls,1);
 }
});

test('the three existing voice settings keep the same fact and memory boundaries',()=>{
 for(const persona of ['warm','playful','calm','custom']){
  const prompt=promptFor({...DEFAULTS,persona},[{content:'明确批准的偏好'}]);
  assert.ok(prompt.includes('鲸鱼娘'));assert.ok(prompt.includes('不故意')||prompt.includes('故意犯错'));assert.ok(prompt.includes('候选需要用户审核'));assert.ok(prompt.includes('不代表已经记住'));
  assert.ok(prompt.includes('明确批准的偏好'));
 }
 assert.match(promptFor({...DEFAULTS,persona:'calm'}),/认真干活/);
 assert.match(promptFor({...DEFAULTS,persona:'warm'}),/轻梗陪聊/);
});
