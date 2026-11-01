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
