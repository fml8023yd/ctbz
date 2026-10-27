---
name: ctbz-claude-code
metadata:
  version: 0.1.0
description: CTBZ 在 Claude Code 的原生子 Agent 适配：Agent 派发、TaskStop 停止、SendMessage 续跑、agentId 回执脱敏、subagent_type 路由与 worktree 硬限制；与唯一全局 ctbz 核心配合使用。
---

# Claude Code 适配器 0.1.0

先读 `~/.agents/skills/ctbz/SKILL.md`；方法、角色、看板只引用该核心。班主权限、自动/计划模式、30 分钟决策升级以核心为准。本文件只写 Claude Code 宿主能力与派发差异。

安装仅限 `~/.claude/skills/ctbz-claude-code`，不放全局技能目录。

## 0. 边界

| 主进程做 | 主进程不做 |
|---|---|
| 拆任务、写 brief、派发、验收 | 写或改任何项目交付文件 |
| 读代码与证据，判断、裁决、问澄清 | 替子 Agent 补最后一行 |
| 记 `.ctbz-record`、dashboard、决策账 | 拿子 Agent 的“已完成”当验收 |

唯一例外：用户明确说“你自己做 / 亲历 / 别派了”。记录 `mode=亲力`，按普通执行流程做，最终仍要验收。没有这句授权，主进程不接管执行。

## 1. 宿主识别

当前真实工具列表须同时包含 `Agent`、`TaskStop`、`SendMessage`。不得根据模型名、目录存在或历史摘要猜宿主；缺任一工具即不是本适配器宿主，按 `harness-rejected` 记录，不静默亲力。

运行时由核心 `openRuntime` 读取 `evidence.source=current-harness-tool-list`、`evidence.harness=claude-code`、`evidence.tools`，再加载本适配器 `scripts/native.mjs`。

## 2. 工具映射

| ctbz 动作 | 原生工具 | 语义 |
|---|---|---|
| 派发子任务 | `Agent` | 异步后台启动；同一消息内多次调用即并行；返回真实内部 agentId |
| 等待/取回执 | 宿主完成通知 + 注入的 `agentResult` | 通知含 status、tokens、tool_uses、duration；无 sessionId、checkpoint、planVersion |
| 停止子任务 | `TaskStop` | 按 task_id/agentId 停止；确认停止才算成功 |
| 续跑/追加指令 | `SendMessage` | 按 agentId 向既有子 Agent 发消息，不新起身份 |

`scripts/native.mjs` 是可注入端口映射，不是 shell API。父会话或用户配置的 wrapper 提供 `dispatchAgent`、`agentResult`、`stopAgent`：`dispatchAgent({subagent_type, description, prompt})`、`agentResult(agentId)`、`stopAgent(agentId)`。

## 3. agentId 回执约束（宿主强制）

- 原始 agentId 只进内部账：核心 journal 的 `running` / `completed` 事件保留真实 agentId，供身份核对与排障。
- 对外、对用户、对交付文档一律使用 `receiptRef(agentId)`：取 sha256 前 8 位十六进制，确定性、不可逆，同一 agentId 恒得同一短引用。
- 这是 Claude Code 宿主规则，不是可选展示偏好；原始 agentId 不得出现在最终汇报、看板可见字段或推送正文。
- 回执身份必须与 `start` 返回一致；不一致按失败处理，不得用 handle 回填冒充真实身份。

## 4. 角色与 subagent_type

注册角色只有 8 个。按读写属性路由：

| 类别 | 角色 | subagent_type |
|---|---|---|
| 只读 | planner | `Plan`（长计划稿） |
| 只读 | reviewer、explorer、researcher、reporter | `Explore` |
| 可写 | implementer、debugger、tester | `general-purpose` |

任务身份映射只写入 brief，不进入代码校验，也不得当作注册角色传给核心：

| 任务身份 | 借用注册角色 |
|---|---|
| merger、adjudicator | planner |
| attacker、acceptor | reviewer |
| integrator | implementer |
| scribe | reporter |

## 5. 硬限制

| 限制 | 后果与应对 |
|---|---|
| `isolation:"worktree"` 需要 git 仓库 | 非 git 目录创建 worktree 会被直接拒绝；改为串行写或在 git 仓内派发，不假设隔离成功 |
| 子 Agent 是全新对话 | 不继承父会话，但继承全局 `~/.claude/CLAUDE.md`；brief 必须自包含 |
| 无 sessionId、checkpoint、planVersion | 回执以真实 agentId + status + evidence 为准；不伪造这些字段 |
| 无系统级 writeSet 强制 | 写隔离靠任务契约与 worktree；主进程派发前做写集冲突检查 |
| 完成通知异步 | 通知只触发“介入”：核身份 → 核证据 → 记 dashboard → 决定验收、回修或补派 |
| 原始 agentId 禁展示 | 对外只用 `receiptRef` |

## 6. 失败与降级

| 触发 | 行为 | 记录 |
|---|---|---|
| 工具缺失或宿主不符 | 不派发，不静默亲力 | `harness-rejected` |
| 非 git 仓却要求 worktree | 拒绝隔离派发，改串行或换 git 仓 | `harness-rejected` |
| 派发失败 | 记录，重试或排队 | `native-start-failure` |
| 途中失败 | 先确认停止，核查已有写入后重派；不接管执行 | `native-mid-task-failure` |
| 无法确认停止 | 保留现场，避免重复写 | `awaiting-stop` |
| 权限拒绝 | 停止被拒动作，不换工具、模型或宿主绕过 | `permission-denied` |
| 回执缺证据或身份不一致 | 按失败处理，重派或报阻塞 | `native-mid-task-failure` |

`openRuntime` 返回 `mode=parent` 只表示当前无原生端口，不是执行授权。自审标 `parent-self-review`，不冒充独立 Agent 或异源模型。
