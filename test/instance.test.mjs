import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {acquireInstance} from '../src/instance.mjs';
test('one data directory cannot run two live instances; releasing permits a clean restart',t=>{
 const dir=mkdtempSync(join(tmpdir(),'echo-instance-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const release=acquireInstance(dir);assert.throws(()=>acquireInstance(dir),/已有/);release();assert.equal(existsSync(join(dir,'instance.lock')),false);acquireInstance(dir)();
});
test('a malformed lock is never silently removed as stale',t=>{
 const dir=mkdtempSync(join(tmpdir(),'echo-instance-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));writeFileSync(join(dir,'instance.lock'),'pending');assert.throws(()=>acquireInstance(dir),/损坏/);assert.equal(existsSync(join(dir,'instance.lock')),true);
});
