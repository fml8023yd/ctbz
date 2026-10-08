import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const script=new URL('../skills/ctbz/scripts/知识库.js',import.meta.url);
test('multi knowledge directories are read-only during search, first-only experience writes',t=>{
 const dir=fs.mkdtempSync(join(tmpdir(),'ctbz-knowledge-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const a=join(dir,'a'),b=join(dir,'b');fs.mkdirSync(a);fs.mkdirSync(b);fs.writeFileSync(join(a,'one.md'),'## alpha（触发：needle）\n');fs.writeFileSync(join(b,'one.md'),'## beta（触发：needle）\n');
 const run=(args,value=JSON.stringify([a,b,a]),input)=>spawnSync(process.execPath,[fileURLToPath(script),...args],{env:{...process.env,CTBZ_KNOWLEDGE_DIRS:value},input,encoding:'utf8'});
 const before=fs.readdirSync(a);let r=run(['search','needle']);assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout);assert.equal(result.hits.length,2);assert.equal(result.roots.length,2);assert.ok(result.hits[1].位置.includes(b));assert.deepEqual(fs.readdirSync(a),before);
 r=run(['add','experience','-'],undefined,'## learned（触发：new）\n');assert.equal(r.status,0,r.stderr);assert.ok(fs.readdirSync(join(a,'自学习知识')).length);assert.deepEqual(fs.readdirSync(a).sort(),['one.md','自学习知识'].sort());assert.deepEqual(fs.readdirSync(b),['one.md']);
 for(const v of ['[]','[1]','["relative"]','[broken',''])assert.notEqual(run(['search','needle'],v).status,0);
 fs.chmodSync(a,0o555);assert.notEqual(run(['add','experience','-'],undefined,'test').status,0);fs.chmodSync(a,0o755);
 assert.notEqual(run(['add','../escape','x'],undefined,'test').status,0);assert.notEqual(run(['add','待批','../escape'],undefined,'test').status,0);
 const target=join(a,'业务.md');fs.symlinkSync(join(b,'one.md'),target);assert.notEqual(run(['add','业务','-'],undefined,'overwrite').status,0);assert.match(fs.readFileSync(join(b,'one.md'),'utf8'),/beta/);
});
test('unset knowledge environment retains legacy root without creating it',t=>{
 const home=fs.mkdtempSync(join(tmpdir(),'ctbz-legacy-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));const env={...process.env,HOME:home};delete env.CTBZ_KNOWLEDGE_DIRS;
 const r=spawnSync(process.execPath,[fileURLToPath(script),'search','none'],{env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).root,join(home,'Documents','.ctbz','知识库'));assert.deepEqual(fs.readdirSync(home),[]);
});
test('experience and conflict only write learning directory and reject dangling symlink',t=>{
 const dir=fs.mkdtempSync(join(tmpdir(),'ctbz-learning-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const kb=join(dir,'kb');fs.mkdirSync(kb);
 const run=(args,input)=>spawnSync(process.execPath,[fileURLToPath(script),...args],{env:{...process.env,CTBZ_KNOWLEDGE_DIRS:kb},input,encoding:'utf8'});
 assert.equal(run(['conflict','topic','fact']).status,0);assert.deepEqual(fs.readdirSync(kb),['自学习知识']);const learning=join(kb,'自学习知识');const month=join(learning,fs.readdirSync(learning)[0]);fs.rmSync(month);const outside=join(dir,'outside.md');fs.symlinkSync(outside,month);
 assert.notEqual(run(['add','experience','-'],'secret').status,0);assert.notEqual(run(['conflict','topic','fact']).status,0);assert.equal(fs.existsSync(outside),false);assert.deepEqual(fs.readdirSync(kb),['自学习知识']);
});
