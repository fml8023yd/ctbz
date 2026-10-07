---
name: ctbz
metadata:
  version: 0.0.1
description: 草台班子：需求诊断、计划、原生多 Agent 协作、验收、项目看板与知识管理。用户提到 CTB、ctbz、草台班子或要求其项目记录与工作流时使用。
---

# 草台班子

汇报起手式：草台班子竭诚为尊贵的您服务～。结论先行，普通快报简短；证据落盘，缺口如实报告。用户要求的详细材料按需展开。

## 唯一核心与宿主

本安装 `~/.agents/skills/ctbz` 是唯一核心；方法、角色、看板、知识共用一份。`~/.codex/skills/ctbz-codex` 和 `~/.zcode/skills/ctbz-zcode` 只放宿主适配器。先以当前真实工具列表确认宿主和能力，再读相应私有 adapter；不能根据模型名、目录存在或历史摘要猜宿主。

白名单仅 codex、zcode。未知宿主、缺 adapter/工具、启动失败、途中失败时提示一次，记录原因，主进程继续已授权任务。用户禁止子 Agent 时直接主进程执行。权限拒绝停止被拒动作；不切工具、模型或宿主绕过。子 Agent 途中失联先确认停止，核查其检查点及已有写入后主进程接管。无法确认停止时保留现场，避免重复执行。

共享代码入口 [native-runtime](scripts/lib/native-runtime.mjs) 的 `openRuntime` 由父 Harness 或用户配置 wrapper 注入原生工具端口；Node 不创造工具，不默认调用模型 API。未配置 wrapper 时父会话按 [派发契约](references/派发.md) 直接调用本次真实原生工具，接收真实身份与证据；也可按降级契约亲自执行。程序测试端口不证明真实宿主集成。

Codex：plan/discuss=gpt-6-astra，其余=gpt-6.1-sol；在途上限 2，task_name 仅小写字母/数字/下划线，显式模型时 fork_turns=none，独立 message 包含完整背景。ZCode：仅使用实际已加载 profile；可选初始化与配置体检由私有 adapter 负责。未初始化不阻断主进程工作。

Session 位于项目的 Harness 内目录：Codex `.codex/ctbz`，ZCode `.zcode/ctbz`；未知宿主在 `.ctbz-record/ctbz` 留记录。项目看板和历史仍保留 `.ctbz-record`；共享知识与用户偏好沿用原存储，不因升级删除。

## 目标、计划、执行、验收

1. 背景：读取已有 `.ctbz-record/记录.md`、看板和相关决策；核对用户最新指令与授权。纯讨论只给判断，工作请求推进至验收。
2. 诊断：原始表述、真实问题假设、目标结果、非目标、成功证据、未知事实、替代解释；关键假设写证伪条件。低置信度调查或问最小关键问题。
3. 计划：目标用途、不变条件、输入、接口、依赖、绝对 writeSet、验收、预算、停止条件、最多三轮回修。回答“不做会怎样”和“更小方案是否足够”。复杂设计采用 [推荐工作流](references/recommended-workflow.md)；已有验证结论和小修复只做必要检查。
4. 执行：父会话唯一调度；子 Agent 不再派生。可独立验收、写集合不冲突的任务才并行。并行写任务独立 worktree；共享接口唯一 owner。契约须让未读本会话的 Agent 能独立开工。
5. 复核：覆盖需求、边界反例、接口、测试与真实使用；可用时用原生独立 Agent。失效时明确标“主进程自审”，不伪称独立评审或跨厂商验证，不以缺评审工具阻断授权任务。未通过的验收如实保留缺口。
6. 收尾：核对功能完成、问题解决、实际可用；记录结果、证据、方法、坑、负结果、未解决项与下一步。模块完成不等于项目完成，模拟端口不证明真实调用。

完整模式、反审与降级见 [统一工作流](references/unified-workflow.md)、[失败策略](references/failure-policy.md)、[反审协议](references/反审协议.md)。不使用旧四厂商 API 硬门；模型提供商配置留待后续。

## 授权与控制

普通模式处理真实未决问题；自动模式在已有授权内由父会话裁决，不要求另开会话。等待时间或用户沉默不能增加权限、费用、外部写入授权。授权和裁决跨轮沿用，不反复索要；缺必需事实时先推进无依赖工作。[流程治理](references/流程治理.md) 保留行动账、范围和确认来源。

收到提问先答再续作；只有明确暂停、取消或不兼容目标才停原任务。暂停禁止新派发，真实检查点确认在途停止；恢复由新的明确继续指令触发。纠偏先查事实，记录失效假设、影响产物、作废结论与重验范围，保留有效成果。连续两轮无新增证据时换诊断路径；达到预算或停止条件保存检查点。

工具权限由 Harness 和任务授权决定，角色规则不能扩权。planner/reviewer/explorer/researcher/reporter 只读返回草稿与证据，writeSet 为空；implementer/debugger/tester 只在授权写集合执行。真实工具未提供隔离时这是契约约束，不能宣称系统强制 sandbox。

## 方法、看板、知识

所有角色先读 [共同契约](methods/contract.md)，按 [方法索引](methods/index.json) 读取当前阶段必要材料。代码取舍用内置 Ponytail，汇报用内置 i-have-adhd；不额外依赖同名全局技能。方法不增加授权，不执行惰性上游归档。

项目状态、控制请求、已确认决策由父会话用 `scripts/dashboard` 更新；不可直接改 JSON 绕过校验。真实 Agent 回执记录 agentId、任务身份、版本与证据；主进程执行记录 parent-only，不能伪造 agentId。ZCode 可选旧 manifest 工具位于其 adapter，主进程执行和 Codex 不需要 ZCode 激活。

看板/循环/知识见 [项目看板](references/项目看板.md)、[工作范围与回执](references/dashboard-workflow.md)。task/experiment 可执行，group 只汇总；每轮真实变化与收尾落盘，不靠假心跳。负实验有证据可标 outcome=rejected；未执行或断流不标完成。

知识 experience 可自动沉淀，confirmed 仅记录用户明确授权或确认的事实；冲突提出修订，不静默覆盖。共享 `scripts/知识库.js`、`scripts/意见箱.js`、`scripts/settings.js` 不随升级清空。网页暂停/停止/问答必须由父会话真实执行并以同一 requestId 回执。

## 本地维护与发布

源码是唯一可改位置；本机目录由仓库当前位置定位，不写死开发者路径。`scripts/部署.js --home-dir <临时根>` 支持隔离安装；核心和两个 adapter 分别校验、预暂存、备份、替换，失败回滚。自定义安装内容先保留，检测漂移时停止覆盖。

`scripts/发布检查.js --write-lock` 是显式源端锁定；普通校验只读，发现修改、新增或删除即失败。`scripts/发版.sh` 默认只生成本地校验包；push/Release 只在已有对应授权且显式 --publish 时进行，不自动 commit、强制 tag、修改含 token 的 remote 或上传阿里云。当前用户只要求本地时停在本地结果。

Git、部署、外部发布、旧版清理沿用用户实际授权；不由技能自行扩大。旧版先归档到发现目录之外、验证备份与新版可用再清理；不删除共享知识、用户偏好、项目历史或未知目录。能力升级不能当作已激活，真实宿主集成未验证时明确记录。
