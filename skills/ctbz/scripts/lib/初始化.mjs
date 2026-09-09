import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validateTeamConfiguration,renderProfile} from './team-config.mjs';
import {verifyBundle, requireBundleBinding, roleMethods} from './methods.mjs';
import {normalizeModelRef,candidateModelRef} from './model-ref.mjs';
const idPattern=/^[a-z][a-z0-9-]*$/;
export function highest(model) {
  if(!Array.isArray(model.reasoningVariants)) throw Error('缺少推理能力元数据');
  if(!model.reasoningVariants.length) return undefined;
  const order=['off','none','minimal','low','medium','high','xhigh','max'];
  if(model.reasoningVariants.some(x=>!order.includes(x))) {
    if(!model.reasoningVariants.includes(model.highestReasoning)) throw Error('未知推理档位，需要宿主确认highestReasoning');
    return model.highestReasoning;
  }
  return [...model.reasoningVariants].sort((a,b)=>order.indexOf(b)-order.indexOf(a))[0];
}
export function initialize(registry,catalog,selected) {
  const methods = verifyBundle();
  if(!registry.version||!Array.isArray(registry.roles)||!registry.roles.length)throw Error('角色清单无效');
  const ids=new Set();
  for(const r of registry.roles){if(!idPattern.test(r.id)||ids.has(r.id)||!r.instructions?.trim()||!Array.isArray(r.tools)||!r.tools.length)throw Error('角色定义缺失或重复');ids.add(r.id);}
  if(!Array.isArray(selected)||!selected.length||new Set(selected).size!==selected.length)throw Error('选定模型为空或重复');
  const keys=selected.map(normalizeModelRef);
  if(new Set(keys).size!==keys.length)throw Error('选定模型为空或重复');
  const models=keys.map(key=>{const m=catalog.candidates.filter(x=>candidateModelRef(x)===key);if(m.length!==1)throw Error('模型引用缺失或不唯一');return m[0];});
  const team={version:1,team:'ctbz',activationRequired:true,maxParallel:4,maxParallelWriters:1,retry:{taskLevelRetries:3,circuitThreshold:3},roles:{}};
  for(const role of registry.roles){
    const variants=models.map(model=>{
      const modelRef=candidateModelRef(model);
      const thoughtLevel=highest(model),modelShort='m'+createHash('sha256').update(modelRef).digest('hex').slice(0,12),reasoningShort=thoughtLevel?'highest':'std';
      const entries = roleMethods(role.id, methods);
      const instructions = role.instructions+'\n不得派生Agent。遵守任务写集合与验收要求。\nRead 共享契约: '+methods.installRoot+'/methods/contract.md\n方法版本: '+methods.fingerprint+'\n仅按本次任务需要 Read 下列本地方法，父会话负责脚本、派发和落盘。材料缺失时向父会话报告，不查全局同名技能。\n'+entries.map(m=>`${m.id}: ${m.entry}`).join('\n');
      return {profile:`team-ctbz-${role.id}-${modelShort}-${reasoningShort}`,modelRef,modelShort,reasoningShort,...(thoughtLevel?{thoughtLevel}:{}),description:role.name,tools:role.tools,instructions};
    });
    team.roles[role.id]={variants,route:variants.map(v=>v.profile)};
  }
  const checked=validateTeamConfiguration(team,catalog);
  if(checked.errors.length)throw Error(JSON.stringify(checked.errors));
  const template=readFileSync(fileURLToPath(new URL('../../assets/agent-profile.md.tmpl',import.meta.url)),'utf8');
  const profiles=checked.profiles.map(p=>({...p,modelRef:p.modelRef,markdown:renderProfile(template,p)}));
  return {version:registry.version,registryHash:createHash('sha256').update(JSON.stringify(registry)).digest('hex'),installRoot:methods.installRoot,methodFingerprint:methods.fingerprint,team,profiles};
}
export function selectProfile(bundle,registry,policy,role,loaded,excluded=[]) {
  requireBundleBinding(bundle);
  const hash=createHash('sha256').update(JSON.stringify(registry)).digest('hex');
  if(bundle.version!==registry.version||bundle.registryHash!==hash)throw Error('角色版本漂移，请重新初始化');
  if(!registry.roles.some(r=>r.id===role))throw Error('当前版本没有此角色');
  const requested=policy.roles?.[role]??policy.defaultOrder;
  if(!Array.isArray(requested)||!requested.length)throw Error('调用顺序为空或重复');
  const order=requested.map(normalizeModelRef);
  if(new Set(order).size!==order.length)throw Error('调用顺序为空或重复');
  for(const key of order)if(!bundle.profiles.some(p=>p.role===role&&p.modelRef===key))throw Error('规则引用未初始化模型');
  for(const key of order){const p=bundle.profiles.find(p=>p.role===role&&p.modelRef===key);if(loaded.includes(p.name)&&!excluded.includes(p.name))return p;}
  throw Error('没有已加载且未排除的角色配置');
}
