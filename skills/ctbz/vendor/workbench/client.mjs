#!/usr/bin/env node
import fs from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
function parseJSON(value){try{return JSON.parse(value);}catch{throw Error('JSON 格式无效；检查私有配置/输入/操作记录');}}
const hash=v=>createHash('sha256').update(v).digest('hex');
export const configPath=()=>process.env.CTBZ_WORKBENCH_CONFIG||join(homedir(),'.ctbz','workbench.json');
export function validateURL(base){
 if(!base)throw Error('工作台未配置');
 const u=new URL(base);
 if(u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('地址必须为无凭据、参数和路径的 origin');
 if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw Error('远程工作台必须使用 HTTPS');
 return u.origin;
}
function privateFile(path){const s=fs.lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077))throw Error('配置/操作记录必须是私有 0600 普通文件');}
export function connection(){
 let c={};const p=configPath();if(fs.existsSync(p)){privateFile(p);c=parseJSON(fs.readFileSync(p,'utf8'));}
 const base=validateURL(process.env.CTBZ_WORKBENCH_URL??c.url),token=process.env.CTBZ_WORKBENCH_TOKEN??c.token;
 if(typeof token!=='string'||!token||/[\r\n]/.test(token))throw Error('工作台 token 未配置或无效');
 return {base,token};
}
export function saveConfig(c,path=configPath()){
 validateURL(c.url);if(typeof c.token!=='string'||!c.token)throw Error('缺少 token');
 fs.mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const fd=fs.openSync(path,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(c)+'\n');}finally{fs.closeSync(fd);}
 return {configured:true,url:validateURL(c.url),token:'[redacted]'};
}
export async function request(path,options={}){
 const {method='GET',body,key,timeout=30000}=options;
 const c=options.base&&options.token?options:connection(),base=validateURL(c.base);
 if(!path.startsWith('/')||path.startsWith('//'))throw Error('无效 API 路径');
 let response;try{response=await fetch(base+'/api'+path,{method,redirect:'error',headers:{Authorization:'Bearer '+c.token,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});}catch{throw Error('网络失败/超时/重定向拒绝；保留原操作记录后核实重试');}
 let value;try{value=await response.json();}catch{throw Error('工作台响应不是 JSON');}
 if(!response.ok){const e=Error('工作台请求失败 HTTP '+response.status);e.status=response.status;throw e;}return value;
}
export async function doctor(options={}){
 const c=options.base&&options.token?options:connection();
 const health=await request('/health',c);
 if(!health.ready||health.apiVersion!==1||!['claims','idempotency','project-scopes'].every(x=>health.capabilities?.includes(x)))throw Error('工作台协议不兼容');
 const state=await request('/state',c);return {ready:true,url:validateURL(c.base),version:health.version,apiVersion:health.apiVersion,projects:state.projects.map(p=>({id:p.id,title:p.title})),token:'[redacted]'};
}
export async function durableRequest(path,{method='POST',body={},key=randomUUID(),directory=process.env.CTBZ_WORKBENCH_OPERATIONS||join(dirname(configPath()),'operations'),...options}={}){
 const c=options.base&&options.token?options:connection(),base=validateURL(c.base);
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const file=join(directory,hash(key)+'.json');
 const signature=hash(JSON.stringify({base,identity:hash(c.token),path,method,body}));
 let record;
 if(fs.existsSync(file)){privateFile(file);record=parseJSON(fs.readFileSync(file,'utf8'));if(record.signature!==signature)throw Error('操作键与服务/身份/请求不匹配');if(record.complete)throw Error('操作已完成；历史回执不是当前状态，请查 node/state 核对后继续');if(Date.now()-record.created>=7*86400000)throw Error('幂等已超过七天；先查 node/state，禁止自动重放');}
 else{record={key,signature,base,identity:hash(c.token),path,method,body,created:Date.now(),complete:false};const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(record));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 await doctor(c);
 const result=await request(path,{...c,method,body,key,timeout:options.timeout});
 record.complete=true;record.result=result;
 const tmp=file+'.'+randomUUID()+'.tmp';const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(record));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);
 return result;
}
export async function cli(args=process.argv.slice(2)){
 const [command,id,input]=args;
 if(!command||command==='--help'){console.log('config <private-json-file|-> | show | doctor | state [projectId] | node <id> | events <nodeId> [after] | create-project|create-node <json-file|-> | claim|checkpoint|submit|review-claim|review|renew <nodeId> [json-file|-] | retry <key>');return;}
 const read=p=>parseJSON(fs.readFileSync(p==='-'?0:p,'utf8'));
 let result;
 if(command==='config')result=saveConfig(read(id));
 else if(command==='show'){const c=connection();result={url:c.base,token:'[redacted]',config:configPath()};}
 else if(command==='doctor')result=await doctor();
 else if(command==='retry'){const directory=process.env.CTBZ_WORKBENCH_OPERATIONS||join(dirname(configPath()),'operations'),file=join(directory,hash(id)+'.json');privateFile(file);const r=read(file);result=await durableRequest(r.path,{method:r.method,body:r.body,key:id,directory});}
 else if(command==='state')result=await request('/state'+(id?'?projectId='+encodeURIComponent(id):''));
 else if(command==='node')result=await request('/nodes/'+encodeURIComponent(id));
 else if(command==='events')result=await request('/events?nodeId='+encodeURIComponent(id)+'&after='+encodeURIComponent(input||'0'));
 else{let path,body;
 if(['create-project','create-node'].includes(command)){path=command==='create-project'?'/projects':'/nodes';body=read(id);}
 else if(['claim','checkpoint','submit','review-claim','review','renew'].includes(command)&&id){path='/nodes/'+encodeURIComponent(id)+'/'+command;body=input?read(input):{};}
 else throw Error('未知命令或缺少节点 ID');
 const key=process.env.CTBZ_IDEMPOTENCY_KEY||randomUUID();console.error('Idempotency-Key: '+key);result=await durableRequest(path,{body,key});}
 console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))cli().catch(e=>{console.error(e.message);process.exitCode=1;});
