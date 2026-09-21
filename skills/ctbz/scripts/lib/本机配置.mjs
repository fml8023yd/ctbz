import fs from 'node:fs';
import path from 'node:path';

// T4 存根：保留 read/safe（scripts/lib/存储位置.mjs 仍使用），
// 其余 ZCode 规则/路由/原子写函数已退役，改为抛错存根。

export function safe(p, missing=false, label='路径'){
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

const retired = (name) => () => {
  throw Error(
    `dsh 版不支持 ZCode profile 注册链：${name} 已退役。角色改由 subagent 实例的 persona / toolFilter / agentOptions 表达；派发走 workflow。`
  );
};

export const atomic = retired("atomic");
export const emptyRules = retired("emptyRules");
export const defaultRules = retired("defaultRules");
export const validateRules = retired("validateRules");
export const route = retired("route");
export const rulesFile = retired("rulesFile");
