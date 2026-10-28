---
name: ctbz-codex
metadata:
  version: 0.2.2
description: CTBZ 在 Codex 的原生子 Agent 适配：原生 spawn/wait 语义、2 在途上限、后台待命、ServerChan 推送、30 分钟一次性唤醒与任务身份；与唯一全局 ctbz 核心配合使用。
---

# Codex 适配器 0.2.1

先读 `~/.agents/skills/ctbz/SKILL.md`；方法、角色、看板只引用该核心。班主权限、自动/计划模式、30 分钟决策升级以核心 [班主基线](~/.agents/skills/ctbz/references/班主基线.md) 与 [自动模式](~/.agents/skills/ctbz/references/自动模式.md) 为准。本文件只写 Codex 宿主能力与派发差异。

回执带 method，交付前留痕与质疑预演按核心执行。失败即时内审：不等整批、记录/禁用/重派按核心执行。

安装仅限 `~/.codex/skills/ctbz-codex`，不放全局技能目录。

## 0. 边界

| 主进程做 | 主进程不做 |
|---|---|
| 拆任务、写 brief、派发、排队、验收 | 写或改任何项目交付文件 |
| 读代码与证据，判断、裁决、问澄清 | 替子 Agent 补最后一行 |
| 记 `.ctbz-record`、dashboard、决策账 | 拿子 Agent 的“已完成”当验收 |

唯一例外：用户明确说“你自己做 / 亲历 / 别派了”。记录 `mode=亲力`，按普通执行流程做，最终仍要验收。没有这句授权，主进程不接管执行。

## 1. 宿主识别

当前工具列表须实际包含 `collaboration.spawn_agent`、`collaboration.wait_agent`、`collaboration.interrupt_agent`；真实在途数量来自 `collaboration.list_agents` 与本会话回执，排除父进程、包含当前任务清单之外仍运行的子 Agent。不用模型名猜宿主。

## 2. 原生 spawn/wait 语义

| 调用 | 语义 | 主进程动作 |
|---|---|---|
| `collaboration.spawn_agent` | 立即返回规范 `task_name` 或真实 `agentId/agent_id`；不阻塞等结果 | 记身份，继续拆派或验收其他任务 |
| `collaboration.wait_agent` | 只等通知或终态，不返回真正结果 | 通知到达后读该 Agent 的消息与终态回执 |
| `collaboration.list_agents` | 查真实在途 | 派发前核对计数；不拿它轮询空转 |
| `collaboration.interrupt_agent` | 中断执行 | 必须确认子进程已停止才返回 true |

完成通知只触发“介入”：核身份 → 核证据 → 记 dashboard → 决定验收、回修或补派。不替该 Agent 补做未完成部分。

`scripts/native.mjs` 是可注入端口映射，不是 shell API。父会话或用户配置的 wrapper 提供 `spawnAgent`、`waitAgentResult`、`interruptAgent`；wrapper 返回真实 agentId、status、result、evidence。

## 3. 2 在途上限

Codex 协作工具的在途上限为 2，这是本宿主的真实约束，与 ctbz 核心无关（核心不预设任何并发上限）。

| 步骤 | 动作 |
|---|---|
| 派发前 | `collaboration.list_agents` 核对真实在途数；排除父进程，包含任务清单之外仍运行的子 Agent |
| 未满 2 | 派发，记 task_name / agentId |
| 已满 2 | 排队等待，不派发 |
| 宿主拒绝 | 记 `harness-rejected` 与真实回执；不换模型或宿主绕过 |
| 有 Agent 完成 | 读回执、核证据，再放行队列中的下一个 |

不用空任务清单绕过上限。

## 4. 后台与时刻待命

- Codex 子 Agent 默认后台运行；spawn 后主进程不阻塞。
- 在途期间主进程保持可响应：用户提问先答，新指令先处理，旧 Agent 不停，除非明确暂停、取消或不兼容目标。
- 新任务可独立验收且写集不冲突 → 有空位就派；满 2 或写集冲突 → 排队。
- 待命动作：读产物、核证据、维护看板、准备下一批 brief。
- 待命不是接管：不写交付文件，不替 Agent 收尾。

## 5. 模型路由、task_name 与 fork_turns

- plan/discuss 使用 `gpt-6-astra`，其余使用 `gpt-6.1-sol`。
- `task_name` 只用小写字母、数字、下划线。
- 显式模型时 `fork_turns="none"`；完整任务背景写进独立 message，不继承对话。
- 父会话保留返回的规范 task_name（或真实 agentId/agent_id）作为身份，不用输入短名替换返回值。

## 6. 任务身份

| 字段 | 要求 |
|---|---|
| task_name / agentId | 来自宿主真实返回值；回执身份必须一致，不一致按失败 |
| taskId | 小写字母、数字、下划线；会话内唯一 |
| role / phase | 来自核心角色清单与阶段枚举 |
| planVersion | 执行任务绑定计划版本 + hash |
| 回执 | 改动文件、行为说明、验证输出、未完成项、风险、checkpoint |

brief 必须通过“新鲜 Agent 测试”：没读过本会话的 Agent 能直接开工。用户明确授权亲力时记 `parent-only`，不伪造 agentId。

## 7. 交叉验证

- 计划、攻击、验收使用不同角色；宿主模型路由允许时换模型。
- 每份回执记录实际 model；同一模型多 Agent ≠ 跨厂商验证。
- 结论冲突按证据裁决，不按票数。
- 未发生的独立验证不声称；主进程自审标 `parent-self-review`。

## 8. 推送（ServerChan）

- 通道：ServerChan。SendKey 只从环境变量（如 `SERVERCHAN_SENDKEY`）或用户配置读取；key 不入发布包、不入日志、不进聊天。
- 时机：交付完成、必须问用户、30 分钟到期或恢复。
- 短格式：结果一句 + 证据位置 + 缺口 + 下一件；提问用一句话问题 + A/B/C + 推荐 + 默认 + 截止 + runId。
- 推送失败不阻塞交付，但汇报必须标“未送达”。

## 9. 30 分钟决策升级与一次性唤醒

先自查，四项全过才问：

1. 真的阻塞吗？不决定就不能继续，或继续会做错。
2. 能否用读代码、跑测试、查文档、已有授权、默认值解决？
3. 能否先做无依赖部分？
4. 影响够大吗？不可逆、外部写入、花钱、权限、目标变更、高爆炸半径歧义。

问法：推送一句话问题 + A/B/C（各一行）+ 推荐 + 默认 + 30 分钟截止 + runId；停止受影响分支，继续无依赖工作。

决策升级必须发推送；推送失败不阻塞计时，但汇报标“未送达”。

唤醒：

| 宿主能力 | 动作 |
|---|---|
| 有定时/提醒工具 | 登记一次性 30 分钟唤醒；收到回复即取消；到点无回复按默认项继续 |
| 无定时/提醒工具 | 不假装有后台计时器；在下一个真实检查点补执行，记录实际延迟 |
| 父会话退出 | 不保证准点执行；恢复时核对新消息、问题状态与版本后补执行 |

30 分钟内回复 → 按回复继续。30 分钟无回复 → 采用默认项，记录“未获回复，采用默认 X”。最终汇报带决策账：当时面临什么决定、A/B/C、为什么必须问、你没回、我们怎么做的、影响是什么。

## 10. 失败与权限

| 触发 | 行为 | 记录 |
|---|---|---|
| 派发失败 | 记录，重试或排队；不静默亲力 | harness-rejected |
| Agent 失联 | 确认停止，核查检查点，重派新 Agent；不接管执行 | native-mid-task-failure + agentId |
| 无法确认旧 Agent 停止 | 先停旧执行，保留现场，避免重复写 | awaiting-stop |
| 合并者失败 | 换模型重试；仍失败用最佳单计划 + 分歧记录 | merge-fallback |
| 裁决者失败 | 主进程裁决，派 scribe 落盘；主进程不执笔 | adjudicator-fallback |
| 法定人数不足 | 到 4/6 即可继续；迟到作附录；缺谁记谁 | quorum |
| 写集冲突 | 冲突任务排队；不冲突并行 | write-conflict |
| 无 Agent 可用 | 报阻塞，问是否亲力；用户明确后才亲力 | no-native-tools |
| 权限拒绝 | 停止被拒动作，不绕过，不切模型或宿主 | permission-denied |
| 3 轮回修不过 | 停，报缺口；关键项未完成不得标交付 | rework-budget |

自审标 `parent-self-review`，不冒充独立 Agent 或异源模型。

## 11. 运行时入口

统一入口为核心 `scripts/lib/native-runtime.mjs` 的 `openRuntime`；未知宿主、缺工具、启动或途中失败提示一次，随后重派或报告，不接管执行。`openRuntime` 返回 `mode=parent` 只表示当前无原生端口，不是执行授权。权限拒绝停止被拒动作；无法确认旧 Agent 停止时先停旧执行，避免重复写。自审标 `parent-self-review`。
