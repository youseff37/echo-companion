import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

export const DEFAULTS = Object.freeze({name:'大肥鱼',persona:'playful',prompt:'',model:'deepseek-flash',maxReplyChars:180,dailyCallLimit:100,contextTurns:6,bridgeUrl:'ws://127.0.0.1:3001',expectedAccount:'',scopes:[]});
export const dayKey = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export class Store {
  constructor(path) {
    if(path!==':memory:') {mkdirSync(dirname(path),{recursive:true,mode:0o700});}
    this.db=new DatabaseSync(path);
    if(path!==':memory:') chmodSync(path,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY, scope TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS turns (id INTEGER PRIMARY KEY, scope TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY, at INTEGER NOT NULL, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS usage (day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0, inputTokens INTEGER NOT NULL DEFAULT 0, outputTokens INTEGER NOT NULL DEFAULT 0, unknownUsage INTEGER NOT NULL DEFAULT 0);
    `);
    this.db.prepare("UPDATE seen SET state='interrupted' WHERE state IN ('accepted','generating','submitting')").run();
  }
  getConfig(){ const row=this.db.prepare('SELECT json FROM settings WHERE id=1').get();return {...DEFAULTS,...(row?JSON.parse(row.json):{})}; }
  saveConfig(value){this.db.prepare('INSERT OR REPLACE INTO settings VALUES(1,?)').run(JSON.stringify(value));return value;}
  memories(scope){return scope?this.db.prepare('SELECT * FROM memories WHERE scope=? ORDER BY id DESC').all(scope):this.db.prepare('SELECT * FROM memories ORDER BY id DESC LIMIT 500').all();}
  memory(id){return this.db.prepare('SELECT * FROM memories WHERE id=?').get(Number(id));}
  addMemory(scope,content,status='pending'){
    if(this.db.prepare('SELECT id FROM memories WHERE scope=? AND content=?').get(scope,content)) return;
    this.db.prepare('INSERT INTO memories(scope,content,status,createdAt) VALUES(?,?,?,?)').run(scope,content,status,Date.now());
  }
  approve(id){this.db.prepare("UPDATE memories SET status='approved' WHERE id=?").run(Number(id));}
  forget(id){this.db.prepare('DELETE FROM memories WHERE id=?').run(Number(id));}
  history(scope,turns){return this.db.prepare('SELECT role,content FROM turns WHERE scope=? ORDER BY id DESC LIMIT ?').all(scope,turns*2).reverse();}
  addTurn(scope,role,content){
    this.db.prepare('INSERT INTO turns(scope,role,content) VALUES(?,?,?)').run(scope,role,content);
    this.db.prepare('DELETE FROM turns WHERE scope=? AND id NOT IN (SELECT id FROM turns WHERE scope=? ORDER BY id DESC LIMIT 24)').run(scope,scope);
  }
  reset(scope){this.db.prepare('DELETE FROM turns WHERE scope=?').run(scope);}
  claim(id){const result=this.db.prepare("INSERT OR IGNORE INTO seen(id,at,state) VALUES(?,?,'accepted')").run(id,Date.now());this.db.prepare('DELETE FROM seen WHERE at<?').run(Date.now()-7*86400000);return result.changes===1;}
  outcome(id,state){this.db.prepare('UPDATE seen SET state=? WHERE id=?').run(state,id);}
  reserveCall(limit,day=dayKey()){
    this.db.prepare('INSERT OR IGNORE INTO usage(day) VALUES(?)').run(day);
    const r=this.db.prepare('UPDATE usage SET calls=calls+1 WHERE day=? AND calls<?').run(day,limit);
    return r.changes===1;
  }
  recordUsage(value,day=dayKey()){
    const valid=value && Number.isSafeInteger(value.prompt_tokens) && value.prompt_tokens>=0 && Number.isSafeInteger(value.completion_tokens) && value.completion_tokens>=0;
    this.db.prepare('UPDATE usage SET inputTokens=inputTokens+?,outputTokens=outputTokens+?,unknownUsage=unknownUsage+? WHERE day=?').run(valid?value.prompt_tokens:0,valid?value.completion_tokens:0,valid?0:1,day);
  }
  usage(){return this.db.prepare('SELECT * FROM usage WHERE day=?').get(dayKey())||{day:dayKey(),calls:0,inputTokens:0,outputTokens:0,unknownUsage:0};}
  event(kind,detail){this.db.prepare('INSERT INTO events(at,kind,detail) VALUES(?,?,?)').run(Date.now(),kind,detail);this.db.exec('DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 100)');}
  events(){return this.db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 40').all();}
  close(){this.db.close();}
}
