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
export const emptyRules=()=>({schemaVersion:1,default:{sameProviderOnly:true,modelOrder:[]},temporaryRules:[]});
// 出厂默认成本路由：按 discover-config 实际发现的渠道动态拼装，渠道缺失时省略对应规则，绝不硬编码渠道 ID。
// 三条语义（用户 2026-09-10 口授）：
//   规则1（priority 1）GLM 夜间畅用：活动期（2026-09-03~09-20）每日 23:00-次日09:00 子 Agent 优先 GLM-5.3-Flash；
//     机制只支持绝对时间窗，按剩余每晚展开；活动已过期则不生成，避免用过期假设计费。
//   规则2（priority 2）omen-alpha 存在即优先，2026-10-30 失效。
//   兜底（999）default.modelOrder 放主进程同 provider 的通用主力模型（无具体主款引用时空着，route 会退到同 provider 全序）。
export function defaultRules(catalogCandidates=[],now=new Date()){
  const rules=emptyRules();
  const keys=(catalogCandidates??[]).map(x=>typeof x==='string'?x:x?.key).filter(Boolean);
  const byName=name=>keys.find(k=>k.split(':').pop()===name);
  const omen=byName('omen-alpha');
  if(omen)rules.temporaryRules.push({id:'omen-alpha-first',description:'出厂默认：存在 omen-alpha 渠道即优先使用（GLM 夜间规则未命中时的第一优先），2026-10-30 失效',start:'2026-09-10T00:00:00+08:00',end:'2026-10-30T00:00:00+08:00',priority:2,enabled:true,modelOrder:[omen]});
  const flash=byName('GLM-5.3-Flash');
  if(flash){
    // GLM Coding Plan 夜间畅用活动：2026-09-03 至 2026-09-20 每日 23:00-次日09:00（北京时间，来源 docs.bigmodel.cn 活动通知）
    // 窗口由北京午夜 00:00(+08:00) 的毫秒值直接推算，绝不调用 toISOString 生成时间戳字符串（UTC 陷阱）；
    // 字符串统一由 +08:00 基准毫秒加 8h 偏移后取 UTC ISO 前缀拼出。窗口必须完整落在活动期内。
    const actStartMs=Date.parse('2026-09-03T00:00:00+08:00'),actEndMs=Date.parse('2026-09-20T09:00:00+08:00');
    // 装机时刻的北京日历日 = now+8h 的 UTC 日期
    const bjMidnightMs=Date.parse(new Date(now.getTime()+8*36e5).toISOString().slice(0,10)+'T00:00:00+08:00');
    for(let dayMs=Math.max(bjMidnightMs,actStartMs);;dayMs+=24*36e5){
      const startMs=dayMs+23*36e5,endMs=startMs+10*36e5;
      if(endMs>actEndMs)break;               // 窗口必须完整落在活动期内（末日=09-19晚→09-20 09:00）
      if(endMs<=now.getTime())continue;      // 已过的窗口跳过
      const stamp=ms=>new Date(ms+8*36e5).toISOString().replace('Z','').slice(0,19)+'+08:00';
      const ds=new Date(dayMs+8*36e5).toISOString().slice(5,10).replace('-','');
      rules.temporaryRules.push({id:`glm-flash-night-${ds}`,description:`出厂默认：GLM 夜间畅用 ${stamp(dayMs).slice(0,10)}23:00→次日09:00（北京时间），子Agent优先 GLM-5.3-Flash 置换高级模型；活动期 2026-09-03~09-20 到期自动失效`,start:stamp(startMs),end:stamp(endMs),priority:1,enabled:true,roles:['planner','reviewer','debugger','implementer','explorer','researcher','tester','reporter'],modelOrder:[flash]});
    }
  }
  const sol=keys.find(k=>k.split(':').pop()==='gpt-5.6-sol');
  if(sol)rules.default.modelOrder=[sol];
  return rules;
}
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
