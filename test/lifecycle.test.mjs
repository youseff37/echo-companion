import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {control} from '../scripts/control.mjs';

test('a real app starts paused in a Chinese/spaced data path, survives restart and stops only with authenticated control',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'肥鱼 lifecycle '));
  const entry=fileURLToPath(new URL('../src/server.mjs',import.meta.url));
  let child;
  t.after(()=>{child?.kill();rmSync(directory,{recursive:true,force:true});});
  const oldDirectory=process.env.ECHO_DATA_DIR;
  process.env.ECHO_DATA_DIR=directory;
  t.after(()=>{if(oldDirectory===undefined)delete process.env.ECHO_DATA_DIR;else process.env.ECHO_DATA_DIR=oldDirectory;});
  const launch=async()=>{
    child=spawn(process.execPath,[entry],{env:{...process.env,PORT:'0',ECHO_DATA_DIR:directory,ECHO_OPEN_BROWSER:'0',DEEPSEEK_API_KEY:'',ONEBOT_TOKEN:''},stdio:['ignore','pipe','pipe']});
    let output='';
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('app startup timed out')),10000);
      child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('控制链接')){clearTimeout(timeout);resolve();}});
      child.once('exit',()=>{clearTimeout(timeout);reject(Error('app exited before startup'));});
    });
    return JSON.parse(readFileSync(join(directory,'service.json'),'utf8'));
  };
  let info=await launch();
  let state=await control('status');assert.equal(state.running,false);assert.equal(state.hasKey,false);
  const denied=await fetch(`http://127.0.0.1:${info.port}/api/shutdown`,{method:'POST',body:'{}'});assert.equal(denied.status,401);
  const token=readFileSync(join(directory,'access.token'),'utf8');
  const saved=await fetch(`http://127.0.0.1:${info.port}/api/settings`,{method:'POST',headers:{'X-Echo-Token':token,'Content-Type':'application/json'},body:JSON.stringify({name:'我家的鱼',model:'deepseek-v4-pro'})});assert.equal(saved.status,200);
  const exit=once(child,'exit');assert.equal((await control('stop')).stopping,true);await exit;
  info=await launch();assert.equal(readFileSync(join(directory,'access.token'),'utf8'),token);
  const restarted=await fetch(`http://127.0.0.1:${info.port}/api/state`,{headers:{'X-Echo-Token':token}}).then(r=>r.json());assert.equal(restarted.config.name,'我家的鱼');assert.equal(restarted.config.model,'deepseek-v4-pro');assert.equal(restarted.runtime.running,false);assert.equal(restarted.setup.hasKey,false);
  const exitAgain=once(child,'exit');await control('stop');await exitAgain;
  await assert.rejects(()=>control('status'));
});
