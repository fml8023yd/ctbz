#!/usr/bin/env node
/** 每日调度器入口：安全检查 GitHub 最新提交，干净时更新并部署；有本地改动则停止。 */
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const run=(c,a)=>execFileSync(c,a,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
try {
 if(run('git',['status','--porcelain'])) throw Error('本地有未提交改动，停止自动更新');
 const local=run('git',['rev-parse','HEAD']), remote=run('git',['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];
 if(local===remote){ console.log(JSON.stringify({updated:false,local,remote})); process.exit(0); }
 run('git',['pull','--ff-only','origin','main']);
 run(process.execPath,['skills/ctbz/scripts/部署.js']);
 console.log(JSON.stringify({updated:true,localBefore:local,remote}));
} catch(e){ console.error(e.message); process.exitCode=1; }
