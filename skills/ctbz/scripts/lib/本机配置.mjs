import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {normalizeModelRef,modelProvider} from './model-ref.mjs';
export function safe(p,missing=false,label='路径'){
  if(!p||!path.isAbsolute(p)||path.basename(p).toLowerCase()==='credentials.json')throw Error(`${label}: 路径必须为非凭据绝对路径 (${p??'未提供'})`);
  let current=path.parse(p).root;
  for(const part of p.slice(current.length).split(path.sep).filter(Boolean)){
    current=path.join(current,part);
    let stat;
    try{stat=fs.lstatSync(current);}catch(error){
      if(error.code!=='ENOENT')throw Error(`${label}: 无法检查路径 ${p}; 位置 ${current}; ${error.code}`);
      if(missing)continue;
      throw Error(`${label}: 路径不存在 ${p}; 位置 ${current}`);
    }
    if(stat.isSymbolicLink()){
      let resolved;
      try{resolved=fs.realpathSync(p);}catch{
        try{resolved=path.join(fs.realpathSync(current),path.relative(current,p));}catch{}
      }
      throw Error(`${label}: 不允许符号链接路径; 原路径 ${p}; 链接位置 ${current}; ${resolved?'真实路径 '+resolved+'; 请确认后用该绝对路径重试':'真实路径不可解析; 请修复链接或改用现有普通文件/目录的绝对路径'}`);
    }
  }
  return p;
}
export function read(p,label='路径'){safe(p,false,label);if(!fs.statSync(p).isFile())throw Error(`${label}: 需要普通文件 (${p})`);return JSON.parse(fs.readFileSync(p,'utf8'));}
export function atomic(p,value){safe(p,true);fs.mkdirSync(path.dirname(p),{recursive:true});const tmp=p+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(tmp,p);}
export const defaultRules=()=>({schemaVersion:1,default:{sameProviderOnly:true,modelOrder:[]},temporaryRules:[]});
export function validateRules(r){
  if(r.schemaVersion!==1||r.default?.sameProviderOnly!==true||!Array.isArray(r.default.modelOrder)||!Array.isArray(r.temporaryRules))throw Error('调用规则格式错误');
  const ids=new Set();
  for(const x of r.temporaryRules){if(!x.id||ids.has(x.id)||!Number.isFinite(x.priority)||!Array.isArray(x.modelOrder)||!x.modelOrder.length||typeof x.enabled!=='boolean')throw Error('临时规则无效');ids.add(x.id);if(!/[zZ]|[+-]\d\d:\d\d$/.test(x.start)||!/[zZ]|[+-]\d\d:\d\d$/.test(x.end)||!Number.isFinite(Date.parse(x.start))||!(Date.parse(x.end)>Date.parse(x.start)))throw Error('临时规则需要带时区的有效起止时间');}
  for(const order of [r.default.modelOrder,...r.temporaryRules.map(x=>x.modelOrder)]){
    let keys;try{keys=order.map(normalizeModelRef);}catch{throw Error('模型顺序格式无效');}
    if(new Set(keys).size!==keys.length)throw Error('模型顺序格式无效：重复模型');
  }
  return r;
}
export function route(r,profiles,parent,role,now=new Date()){
  validateRules(r);if(!Number.isFinite(now.getTime()))throw Error('当前模型或时间无效');
  const provider=modelProvider(parent);
  const active=r.temporaryRules.filter(x=>x.enabled&&Date.parse(x.start)<=now.getTime()&&now.getTime()<Date.parse(x.end)&&(!x.roles||x.roles.includes(role))).sort((a,b)=>a.priority-b.priority);
  const same=profiles.filter(p=>p.role===role&&modelProvider(p.modelRef)===provider).map(p=>normalizeModelRef(p.modelRef));
  const fallback=[...r.default.modelOrder.map(normalizeModelRef).filter(k=>same.includes(k)),...same];
  return [...new Set([...active.flatMap(x=>x.modelOrder).map(normalizeModelRef),...fallback])];
}
export function rulesFile(p){const text=fs.readFileSync(safe(p),'utf8');return {rules:validateRules(JSON.parse(text)),hash:createHash('sha256').update(text).digest('hex')};}
