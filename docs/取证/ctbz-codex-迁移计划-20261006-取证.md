$ git status --short --branch
## main...origin/main [ahead 14]
?? "docs/\345\217\226\350\257\201/ctbz-codex-\350\277\201\347\247\273\350\256\241\345\210\222-20261006-\345\217\226\350\257\201.md"
$ git rev-parse HEAD && git rev-parse origin/main
1f8634f06ba050bbf6ef110e70215c4b381fcfbc
2edfe7f1a6c940aa31f62d608564d782b995a6d7
$ sed -n 1,180p skills/ctbz/scripts/lib/存储位置.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {read,safe} from './本机配置.mjs';

export function documentsDir(home=os.homedir(), platform=process.platform) {
  if (platform === 'win32') return process.env.OneDrive ? path.join(process.env.OneDrive, 'Documents') : path.join(home, 'Documents');
  if (platform === 'darwin') return path.join(home, 'Documents');
  const xdg=process.env.XDG_DOCUMENTS_DIR;
  if (xdg) return xdg.replace('$HOME', home);
  return path.join(home, 'Documents');
}
export function storageRoot(choice, home=os.homedir()) {
  if (choice === 'later') return null;
  if (choice === undefined) {
    const locator=storageLocation(home);
    if (!fs.existsSync(locator)) return null;
    const selected=read(locator);
    if (selected?.schemaVersion !== 1 || typeof selected.root !== 'string') throw Error('存储位置记录无效，请显式重新选择目录');
    return safe(selected.root,true,'已保存的状态目录');
  }
  const base=choice === 'documents' ? documentsDir(home) : choice;
  safe(base,true,'--storage');
  return safe(path.join(base, '.ctbz'),true,'--storage');
}
export function storageLocation(home=os.homedir()) {
  return safe(path.join(home,'.ctbz-location.json'),true);
}
export function ensureStorage(root) {
  safe(root,true);
  fs.mkdirSync(root,{recursive:true});
  const st=fs.lstatSync(root); if (!st.isDirectory() || st.isSymbolicLink()) throw Error('状态目录必须是非符号链接目录');
  return root;
}
$ sed -n 1,180p skills/ctbz/scripts/lib/paths.mjs
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

export const DEFAULT_CONFIG = join(homedir(), ".zcode/v2/config.json");
export const DEFAULT_AGENTS = join(homedir(), ".zcode/agents/");

export function discoverWorkspace(explicit) {
  if (explicit) return explicit;
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error(
      "workspace not discovered: run inside a git repository or pass --workspace <absolute-git-root>",
    );
  }
}

export function defaultTeamConfig(workspace) {
  return join(workspace, ".zcode/team-dev.json");
}

export function defaultCatalog(workspace) {
  return join(workspace, ".zcode/catalog-dev.json");
}

export function defaultStateDir(workspace) {
  return join(workspace, ".zcode/state");
}

export function defaultAttestationOutput(stateDir, team) {
  return join(stateDir, team, "attestation.json");
}

export function defaultWorktreeRoot(workspace) {
  return join(workspace, ".zcode/worktrees");
}

export function defaultRunManifest(stateDir, team, runId) {
  return join(stateDir, team, "runs", `${runId}.json`);
}

export function defaultTeamName(teamConfigPath) {
  const base = teamConfigPath.split("/").pop();
  return base.replace(/^team-/, "").replace(/\.json$/, "");
}
$ rg -n "spawn|workflow|ZCode|Agent|SendMessage" skills/ctbz/scripts skills/ctbz/references
skills/ctbz/references/recommended-workflow.md:9:| ① 访谈 | grilling（M） | 父会话访谈；子 Agent 仅事实调查，输出需求、裁决和待决项 |
skills/ctbz/references/recommended-workflow.md:27:## ①—⑦的 Agent 分工
skills/ctbz/references/recommended-workflow.md:29:高能力主会话主持设计并唯一调度，不必在设计中途另设调度会话。对可独立验收的调查、设计草稿、文档整理、原型构建、测试和任务细化，优先交给能力匹配的 Agent；主会话负责裁决、审定和必要复核，而不是亲手执行全部步骤。表中的“父会话执行/更新/定稿”表示最终责任，不要求其独自生产全部材料。
skills/ctbz/references/recommended-workflow.md:31:| 环节 | Agent 承担 | 主会话保留 |
skills/ctbz/references/recommended-workflow.md:41:所有委派仅使用草台班子已配置、已激活且宿主已加载的 Agent 团队。主会话决定任务角色，逐次通过现有 initialize select 及团队调用规则选择具体 profile 和模型；不另组临时团队、不硬编码模型、不用通用 Agent 替代团队角色。团队未初始化、未激活或无合法候选时明确报告派发阻塞，不擅自替代；仅原协议允许的主会话工作可继续。简单整理和明确执行优先经济模型，复杂设计和高风险复核使用能力匹配的模型；经济性只在合法候选与既有选择规则内考虑，不一律选最便宜，不擅自更换 provider。每次派发传同一权威版本、输入材料、写集合、输出要求和验收条件。原型/测试须有实际输出，设计结论须有依据；关键或高风险成果按风险独立复核。主会话检查关键证据、缺口和矛盾，不只听摘要，也不重做全部工作。
skills/ctbz/references/recommended-workflow.md:43:业务歧义、跨模块冲突、关键假设失败和验收条件变化回主会话裁决；普通缺陷及明确范围内修复由 Agent 完成后交回证据，不因其称 DONE 就通过。微小机械动作可由主会话直接处理，避免派发开销超过收益，不为凑并行创建任务。
skills/ctbz/references/recommended-workflow.md:47:⑦完成后仍提醒用户另开独立会话，以经济模型安排⑧开发调度；不是让设计 Agent 派生调度者，也不降低开发验收标准。
skills/ctbz/references/recommended-workflow.md:51:- 传递同一权威版本的绝对材料路径、必要背景、具体问题和约束。只读 Agent 返回事实或草稿，授权执行角色可生产文档，父会话审定；不得另建权威主记录。
skills/ctbz/scripts/内审.mjs:17://   - check 按被检文件向上找 pending.json：派发闸 audit 的 spawnSync 不保证 cwd，缺了会漏登记。
skills/ctbz/scripts/内审.mjs:403:// 派发闸 audit 以 spawnSync 调 check，cwd 不受控：按被检文件向上找 pending.json，再退回默认 ws。
skills/ctbz/references/初始化.md:3:默认状态根为用户 Documents/.ctbz：macOS `~/Documents/.ctbz`；Windows 优先 `%OneDrive%/Documents/.ctbz`，否则 `%USERPROFILE%/Documents/.ctbz`；Linux 优先 `$XDG_DOCUMENTS_DIR/.ctbz`，否则 `~/Documents/.ctbz`。用户也可选择绝对自定义目录，程序仍在该目录内创建 `.ctbz`。选择later时不创建状态根，父会话仍可处理主会话任务；需要子Agent前再选择。该目录不进入发布包。profile目标默认~/.zcode/agents，可用--agents覆盖。所有路径参数用绝对路径。
skills/ctbz/references/初始化.md:52:生成 team-ctbz-*，复用原配置校验、模板、doctor 与 team-state。initialize status 是本版机器初始化状态入口；旧 scripts/status 的零参数默认位置不适用于新 generation。select 返回 stateDir 和 team，后续 init-run 显式传这些参数及 --workspace 项目目录；项目执行进度读取 dashboard show。磁盘就绪、宿主加载和真实模型健康是三件事；activate 只证明前两者及配置凭据声明，不证明 API 真实可用。真实 Agent 冒烟需具备相应调用授权。
skills/ctbz/references/upstream-updates.md:25:用户请求实际升级时，父会话先检查 stage 的 source.json、源码差异和 LICENSE；评估重命名/拆分/资源变动，保留当前适配的调度、双层确认、新会话交接和经济性边界。确认写入范围后导入新归档和许可证，更新 vendor/<name>/source.json，保留旧归档直到明确清理授权。更新相应 methods 适配并运行本仓库 tests/workflow.test.mjs，重新生成依赖锁，再运行 scripts/methods check 和已有项目验证。只更新来源时不得声称运行适配也已升级。
skills/ctbz/references/failure-policy.md:5:Agent 默认后台运行（`run_in_background: true`），不被打断。断流时用 `SendMessage` 在原 agent 恢复，不创建新 agent——新 agent 只用于 fallback 到不同 profile。
skills/ctbz/references/failure-policy.md:12:| `context` | context length、token limit、output limit | 不计 provider 断流 | 压缩落盘事实，创建新 Agent 并 handoff |
skills/ctbz/references/failure-policy.md:18:父主会话本身断流后，skill 无法继续执行。不要宣称能自动自救；恢复父会话属于外部 supervisor 或 ZCode 核心能力。
skills/ctbz/references/failure-policy.md:26:resumeSameAgentPerProfile: 1
skills/ctbz/references/failure-policy.md:45:          -> RUNNING(new Agent, same profile or next profile)
skills/ctbz/references/failure-policy.md:57:2. Agent 线程仍可恢复时，通过 `SendMessage` 对同 profile、同 `agentId` 恢复一次。断流恢复优先用 `SendMessage`，不创建新 agent。
skills/ctbz/references/failure-policy.md:59:4. 选择 route 中下一个已加载 profile，创建新 Agent；切换模型绝不复用旧 Agent session。
skills/ctbz/references/failure-policy.md:68:每次恢复与替换保留原因、attempt 和实际 Agent ID；不能因为另一任务仍在运行就把失败任务标为完成。并行副本只有在当前任务明确需要独立判断时才建立，各自有任务契约与写入边界，不因模型名称自动增加副本。
skills/ctbz/references/failure-policy.md:72:- `context`：将目标、已完成工作、文件状态和验证结果压缩为 handoff；新 Agent 可使用同 profile，但必须是新 `agentId`。
skills/ctbz/references/failure-policy.md:80:任何已有副作用的 retry、resume 或 handoff 前，父主会话先检查 manifest、worktree status、完整 diff 与最近验证。重复写入可能破坏状态时，停止并要求人工决策。SendMessage 只能同档恢复；新 profile 必须新 Agent + handoff。
skills/ctbz/references/failure-policy.md:88:| L0 | SendMessage 恢复同 agent | 断流/中断，线程仍可恢复 | 1 次 |
skills/ctbz/scripts/体检.mjs:12:import { spawnSync } from "node:child_process";
skills/ctbz/scripts/体检.mjs:43:  const r = spawnSync("git", ["rev-parse", "--show-toplevel"],
skills/ctbz/scripts/体检.mjs:109:  const r = spawnSync("git", ["-C", ws, ...args],
skills/ctbz/scripts/体检.mjs:118:  const r = spawnSync("diff", ["-rq", dst, src],
skills/ctbz/scripts/体检.mjs:159:// 探活段：spawnSync 调 preflight --json（真实计费 5 次），--no-probe 时整段不执行
skills/ctbz/scripts/体检.mjs:161:  const r = spawnSync(process.execPath, [PREFLIGHT, "--json"],
skills/ctbz/references/configuration.md:11:| `--config` | `~/.zcode/v2/config.json` | ZCode 非敏感 config，含 provider entries 和 `options.apiKey` |
skills/ctbz/references/configuration.md:12:| `--agents` | `~/.zcode/agents/` | ZCode agent profile 加载目录 |
skills/ctbz/references/configuration.md:36:- Agent frontmatter：`name`、`description`、`model`、`thoughtLevel`、`tools`、`permissionMode`、`maxTurns`、`background`、`injectAgentsMd`。
skills/ctbz/references/configuration.md:44:`--config` 必须指向含 `provider`/`providers` 结构且带 `options.apiKey` 的 ZCode config 文件（如 `~/.zcode/v2/config.json`）。doctor 在 fingerprint 校验后、激活前会检查每个 route 引用 provider 的 `credentialPresent`：
skills/ctbz/references/configuration.md:88:- 禁止写入或修改 `db.sqlite`、`tasks-index.sqlite` 或任何 ZCode 数据库。
skills/ctbz/references/configuration.md:89:- 禁止写入或修改 `ZCode.app`、`/Applications/ZCode.app` 或其他应用包。
skills/ctbz/references/configuration.md:109:1. 父调度器确认 route 引用的每个必需 profile 已出现在当前会话 Agent 工具列表。
skills/ctbz/references/configuration.md:115:attestation 是父调度器提供的可审计声明，记录显式 agents 目录证据和绑定信息；它不是不可伪造的 ZCode 内部证明。必须保留 `agentToolListInternallyVerified: false`，父调度器不能把该声明提升为内部可信根。
skills/ctbz/scripts/pick-profile:2:// 成本选型器（包工头）：父会话派发前决定子 Agent 的渠道档位与并行预算的模块（不是 Agent 角色）。
skills/ctbz/scripts/lib/初始化.mjs:34:      const instructions = role.instructions+'\n不得派生Agent。遵守任务写集合与验收要求。\nRead 共享契约: '+methods.installRoot+'/methods/contract.md\n方法版本: '+methods.fingerprint+'\n仅按本次任务需要 Read 下列本地方法。派发、项目状态与最终审定由父会话负责。'+execution+'材料缺失时向父会话报告，不查全局同名技能。\n'+entries.map(m=>`${m.id}: ${m.entry}`).join('\n');
skills/ctbz/references/派发.md:3:父会话是唯一调度者。本文件是派发层的字段契约：角色规格如何落进三条派发通道（Agent 工具实例 / profile 派发 / 反审直连），选型器如何产出 provider/model，健康账本如何记账。
skills/ctbz/references/派发.md:9:| `workflow` 的 `agent(prompt, opts)` | 反审与讨论类扇出（多路并行、结构化回传） | 仅 `opts.provider`、`opts.model`（另有 `opts.schema`） | `persona`、`toolFilter`、`agentOptions` 一概不识别，静默丢弃 |
skills/ctbz/references/派发.md:11:| `spawn_teammate` | 持久协作（跨轮长驻） | 只收 name/description/prompt | **不收角色与模型**（无 agentOptions），模型跟随主进程 |
skills/ctbz/references/派发.md:15:1. **`workflow.agent()` 只消费 `provider`/`model`**。persona 不可经 opts 传入——工作流里把角色 persona 文本并进 prompt 首段（由父会话拼装）；toolFilter 无法生效，workflow 子代理的只读约束靠 prompt 声明，属已知缺口。
skills/ctbz/references/派发.md:17:3. **`spawn_teammate` 不收角色与模型**。需要固定角色的持久协作时，把 persona 并进初始 prompt；模型不可指定，不适用于反审席位。
skills/ctbz/references/派发.md:44:| `persona` | string | 角色人设全文。workflow 通道由父会话并入 prompt；subagent 实例化后直接映射 `persona` 字段 |
skills/ctbz/references/派发.md:51:| 代号 | provider（workflow 直用） | model（workflow 直用） | 阵营 | 计费 |
skills/ctbz/references/派发.md:112:## 6. workflow 消费示例（3 行，说明 provider/model 可直放 opts）
skills/ctbz/references/派发.md:129:说明：persona 文本由父会话并入 `reviewerPrompt`（workflow 不消费 persona 字段）；示例为片段，不要求真跑。
skills/ctbz/scripts/lib/dashboard-store.mjs:880:      summary = `Agent acknowledged control: ${payload.message}`;
skills/ctbz/scripts/lib/dashboard-store.mjs:896:      summary = `Agent checkpoint: ${scope.checkpoint.summary}`;
skills/ctbz/scripts/lib/dashboard-store.mjs:903:      summary = 'Agent heartbeat';
skills/ctbz/scripts/lib/model-ref.mjs:1:// Discovery uses raw provider IDs; ZCode profiles require an encoded provider segment.
skills/ctbz/references/methods.md:15:`<skill>` 是实际 CTBZ 安装绝对路径。list 列方法；show 定位/读取指定方法；check 核对包内依赖。方法检查只读，不重写锁。初始化生成的 profile 绑定安装根与依赖摘要；移动安装或摘要漂移时按初始化错误重新 prepare/activate，不继续用旧 profile。离线检查不证明真实 ZCode 已加载或派发。
skills/ctbz/references/methods.md:54:发布/维护核对全部 16 项入口、索引角色、共享契约、传递链接、脚本引用与摘要，并走 [前向场景](../methods/references/skill-scenarios.md)。静态完整性、人工走读、独立 Agent 消费及真实宿主运行分别报告，不能互相冒充。
skills/ctbz/scripts/lib/本机配置.mjs:31://   规则1（priority 1）GLM 夜间畅用：活动期（2026-09-03~09-20）每日 23:00-次日09:00 子 Agent 优先 GLM-5.3-Flash；
skills/ctbz/scripts/lib/本机配置.mjs:55:      rules.temporaryRules.push({id:`glm-flash-night-${ds}`,description:`最优先（2026-09-17 用户指示）：GLM 夜间畅用 ${stamp(dayMs).slice(0,10)}23:00→次日09:00（北京时间），子Agent优先 GLM-5.3-Flash 置换高级模型；活动期 2026-09-03~09-20 到期自动失效`,start:stamp(startMs),end:stamp(endMs),priority:0,enabled:true,roles:['planner','reviewer','debugger','implementer','explorer','researcher','tester','reporter'],modelOrder:[flash]});
skills/ctbz/scripts/lib/team-config.mjs:35:  "injectAgentsMd",
skills/ctbz/scripts/lib/team-config.mjs:299:  for (const key of ["background", "injectAgentsMd"]) {
skills/ctbz/scripts/lib/team-config.mjs:557:          injectAgentsMd: variant.injectAgentsMd,
skills/ctbz/scripts/lib/team-config.mjs:652:    injectAgentsMd:
skills/ctbz/scripts/lib/team-config.mjs:653:      profile.injectAgentsMd === undefined
skills/ctbz/scripts/lib/team-config.mjs:655:        : `injectAgentsMd: ${profile.injectAgentsMd}\n`,
skills/ctbz/scripts/lib/team-config.mjs:702:    "injectAgentsMd",
skills/ctbz/references/反审协议.md:76:## 3. 四路调度口径（workflow + provider/model）
skills/ctbz/references/反审协议.md:88:- `workflow.agent()` 只消费 `provider`/`model`，`persona` 文本由父会话并入 prompt 首段（persona 不可经 opts 传入，属已知缺口）。
skills/ctbz/references/反审协议.md:102:宿主 `workflow` 结果上限 `maxResultChars 50000`，超限**静默截断**，长裁决会被吞。处置：
skills/ctbz/references/反审协议.md:112:## 5. 新鲜 Agent 测试项与双轮说明
skills/ctbz/references/反审协议.md:114:### 5.1 新鲜 Agent 测试项
skills/ctbz/references/反审协议.md:124:> 锚点：`新鲜 Agent 测试项`、`双轮说明`、`只针对第一轮未解决项`、`重提规则`
skills/ctbz/references/反审协议.md:130:2.1.0 起反审执行一律走直连执行器（不走宿主 workflow 通道）：
skills/ctbz/references/反审协议.md:143:旧「骨架生成」方案（生成 workflow 可执行脚本体、经 `agent(prompt,{provider,model})` 派发）已弃用：宿主 workflow 通道不识别 persona/toolFilter，且 provider 指定受限，2.1.0 起改直连。
skills/ctbz/references/dashboard-workflow.md:3:本协议补充项目看板和运行记录约定。主会话仍是唯一调度者；没有后台模型执行器，网页不自动唤醒、打断或恢复 ZCode。
skills/ctbz/references/dashboard-workflow.md:38:同 generation 换会话继续使用 adopt-run，登记接管原因，保留原会话历史并使旧 epoch 写入失效。接管只转交记录，新主进程必须核实实际子 Agent 状态。新任务派发前 checkpoint；真实旧 Agent 恢复能力由宿主决定。
skills/ctbz/references/dashboard-workflow.md:58:此命令只接受对应 run 中的 reopen/correct 请求；仍 running 的任务先到达实际检查点。修订保留旧任务的完整证据，不能改变角色或模型身份；重开保留前次尝试、清除旧 agentId 并变为 pending，不自动创建 Agent。成功后 checkpoint 完成原请求回执。拒绝或尚不能执行的请求回执 failed。重复同一修订只补投影，不增加第二份修改。
skills/ctbz/scripts/派发闸.mjs:7:// 约束：只读——不写任何文件；audit 仅 spawnSync 同目录 内审.mjs check（数组参数、无 shell、10s 超时）。
skills/ctbz/scripts/派发闸.mjs:20:import { spawnSync } from "node:child_process";
skills/ctbz/scripts/派发闸.mjs:701:    const r = spawnSync(process.execPath, [INNER, "check", it.file, "--json"], {
skills/ctbz/references/内审协议.md:3:一句话：Agent 跳过或没按约定执行时，必须 **取证 → 归因到机制 → 向 ctbz 提可执行的修改**，不许停在「下次注意」。
skills/ctbz/references/内审协议.md:69:| 意见箱 | 用户提的意见 | 意见箱是外部输入；内审是 Agent 自我发现的缺陷回流 |
skills/ctbz/scripts/dashboard:23:  actor: 'Use --actor user only when recording an explicit human-confirmed action. Agent operations must retain the default actor agent.',
skills/ctbz/references/项目看板.md:3:运行条件：Node.js 22+；无安装依赖、无构建步骤、无数据库。前端图布局与图标已本地打包。普通任务和循环任务共用同一个看板，真实工作由 ZCode 父会话执行。
skills/ctbz/references/项目看板.md:5:1.5.0 的独立任务、会话所有权、检查点、请求回执、成果表及迁移协议见 [工作范围、回执与成果](dashboard-workflow.md)。本页保留基础概念与入口。
skills/ctbz/references/项目看板.md:86:每个检查点读取所在 scope 的 requests 和计划变更。control.request 仅建立请求；父会话核实在途工作，用绑定 requestId 的 control.ack 分别记录 received、completed 或 failed。仅 pending 可撤回或明确替代；暂停/停止请求会阻止新派发，完成回执要求范围内无在途执行。团队任务用 team-state checkpoint 对账和采用实际读过的计划。heartbeat 只记报到，不能替代检查点。网页不能直接创建 Agent，服务也不能调用任意 shell。
skills/ctbz/references/项目看板.md:92:派发契约及 task JSON 使用稳定 taskId、nodeId 和 parentId。nodeId 显式绑定看板已规划的 task/experiment；parentId 与现有树一致，group 不接 Agent 执行。没有 nodeId 的旧任务继续使用 runId/taskId 生成的稳定 ID；带 parentId 的新任务投影到指定父分支。一个节点只能属于同一 run/task，已有绑定不可换；循环中运行节点必须在当前方向内。升级后的新 run 不复用已有执行绑定节点，应增加后续节点并保留来源。
skills/ctbz/references/项目看板.md:104:相同 finish-run 可幂等重试，先补全部任务投影再记收尾，重复调用不增加相同事件。新会话在同一配置 generation 内 activate 后，显式 adopt-run 保留原 session、原因和接管时间；这只转交记录所有权，不恢复真实旧 Agent。跨 generation、跨机器或配置漂移不自动迁移。接管后主进程核查旧在途任务，依据真实回执继续、标阻塞或按失败协议处理。
skills/ctbz/scripts/preflight.mjs:41:// ---------- 凭据（ZCode 线） ----------
skills/ctbz/scripts/preflight.mjs:53:// 席位表 provider 语义名 → 候选 baseURL 前缀（用于在 ZCode 配置中定位渠道）。
skills/ctbz/scripts/worktree:4:import { spawnSync } from "node:child_process";
skills/ctbz/scripts/worktree:105:  const result = spawnSync("git", ["-C", path, ...arguments_], {
skills/ctbz/references/worktrees.md:3:Agent 线程隔离不提供文件隔离。只读 Agent 可共享主工作区；每个并行写任务必须使用独立 worktree，并且 write-set 互不重叠。
skills/ctbz/references/worktrees.md:7:父主会话在派发写 Agent 前确认：
skills/ctbz/references/worktrees.md:19:父 Agent 负责 worktree 生命周期、task ownership、集成和验收。所有 Git 命令都使用 `git -C <explicit-absolute-path>` 或等价显式路径，不依赖 shell 当前目录。
skills/ctbz/references/worktrees.md:51:## 子 Agent 约束
skills/ctbz/references/worktrees.md:53:任务契约必须把 `worktree-root`、`allowed-write-set`、`forbidden-files`、`base-revision` 和 verification 命令传给 Agent。
skills/ctbz/references/worktrees.md:55:子 Agent：
skills/ctbz/references/worktrees.md:63:同一任务的 Implementer、修正、Tester 与 Reviewer 顺序复用同一个 worktree。新的 Agent 在 handoff 后先检查 status 和 diff，不重放已完成的写入。
skills/ctbz/references/worktrees.md:72:4. 有缺陷时把具体反馈发回同 profile Agent，或按失败策略 handoff 给新 Agent。
skills/ctbz/references/worktrees.md:73:5. 验证和 review 都通过后，父 Agent 按任务依赖顺序集成并验收。
skills/ctbz/references/worktrees.md:76:默认不 commit。若用户明确要求 commit，仍由父 Agent 在验收后执行；子 Agent 不自行提交。集成冲突停止自动流程，保留 worktree 和 manifest 状态供人工处理。
skills/ctbz/references/worktrees.md:92:- task 已集成且父 Agent 最终验收通过。
skills/ctbz/scripts/doctor:4:import { spawn } from "node:child_process";
skills/ctbz/scripts/doctor:136:    const child = spawn(process.execPath, [script, ...arguments_], {
skills/ctbz/scripts/doctor:258:      ["inject-agents-md", actual.injectAgentsMd === expected.injectAgentsMd],
skills/ctbz/scripts/doctor:395:        "config file lacks provider entries with options.apiKey; point --config at the real ZCode config.json (e.g. ~/.zcode/v2/config.json) so credentials can be verified before activation",
skills/ctbz/scripts/doctor:415:        `provider "${provider.name ?? providerId}" is enabled but has no credential in config; Agent runtime will report "Model provider is not configured: ${providerId}" — add credentials in ZCode provider settings before activating`,
skills/ctbz/scripts/validate-team:112:      ["injectAgentsMd", "profile-inject-agents-md-drift"],
skills/ctbz/scripts/反审直连.mjs:2:// 反审直连 —— cc-haha 线的四路反审执行器（不走宿主 workflow.agent）
skills/ctbz/scripts/反审直连.mjs:28:import { spawnSync } from "node:child_process";
skills/ctbz/scripts/反审直连.mjs:47:// ---------- 凭据（ZCode 线） ----------
skills/ctbz/scripts/反审直连.mjs:55:// 席位表 provider 语义名 → 候选 baseURL 前缀（用于在 ZCode 配置中定位渠道）。
skills/ctbz/scripts/反审直连.mjs:142:    "【新鲜 Agent 测试】回答：把这份计划单独交给你，不读任何上下文，你能不能直接开工？卡在哪？卡住点即计划欠具体处。",
skills/ctbz/scripts/反审直连.mjs:398:  const r = spawnSync(process.execPath, [gate, "--plan", plan, "--workspace", workspace, "--level", "l1"],
skills/ctbz/scripts/initialize:6:import {spawnSync} from 'node:child_process';
skills/ctbz/scripts/initialize:14:function run(name,args){const r=spawnSync(process.execPath,[path.join(scripts,name),...args],{encoding:'utf8'});if(r.status!==0)throw Error(`${name}: ${r.stderr||r.stdout}`);return JSON.parse(r.stdout);}
skills/ctbz/scripts/initialize:63:      const oldAgents=old&&path.resolve(safe(old.agents,true));
skills/ctbz/scripts/initialize:64:      for(const p of bundle.profiles){const target=safe(path.join(agents,p.name+'.md'),true);if(fs.existsSync(target)){const text=fs.readFileSync(target,'utf8'),managed=oldAgents===agents&&old.bundle.profiles.find(x=>x.name===p.name);if(text!==p.markdown&&(!managed||text!==managed.markdown))throw Error('用户自定义profile冲突：'+p.name);}}
skills/ctbz/scripts/initialize:68:        const target=safe(path.join(oldAgents,p.name+'.md'),true);
skills/ctbz/scripts/initialize:69:        if(oldAgents===agents&&bundle.profiles.some(x=>x.name===p.name))continue;
skills/ctbz/scripts/initialize:76:      const unchanged=old&&old.bundle.team?.catalogFingerprint===team.catalogFingerprint&&old.bundle.registryHash===bundle.registryHash&&JSON.stringify(old.bundle.profiles)===JSON.stringify(bundle.profiles)&&oldAgents===agents&&bundle.profiles.every(p=>fs.existsSync(path.join(agents,p.name+'.md'))&&fs.readFileSync(path.join(agents,p.name+'.md'),'utf8')===p.markdown);
skills/ctbz/scripts/review-package:4:import {spawnSync} from 'node:child_process';
skills/ctbz/scripts/review-package:10:  const result = spawnSync('git', ['-C', root, ...args], {maxBuffer: 32 * 1024 * 1024});
skills/ctbz/scripts/discover-config:19:  "injectAgentsMd",
skills/ctbz/scripts/discover-config:211:  // modelCatalog.overrides (used by ZCode configs that store reasoning
skills/ctbz/scripts/discover-config:262:function allowlistAgent(markdown) {
skills/ctbz/scripts/discover-config:366:async function discoverAgents(path) {
skills/ctbz/scripts/discover-config:374:    const agent = allowlistAgent(markdown);
skills/ctbz/scripts/discover-config:396:  if (agentsPath !== undefined) output.agents = await discoverAgents(agentsPath);
