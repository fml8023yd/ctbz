---
name: ctbz-codex
metadata:
  version: 0.0.1
description: CTBZ 在 Codex 的原生子 Agent 适配；与唯一全局 ctbz 核心配合使用。
---

先读 `~/.agents/skills/ctbz/SKILL.md`；方法、角色、看板只引用该核心。安装仅限 `~/.codex/skills/ctbz-codex`，不放全局技能目录。

当前工具列表须实际包含 `collaboration.spawn_agent`、`collaboration.wait_agent`、`collaboration.interrupt_agent`；真实在途数量来自 `collaboration.list_agents` 与本会话回执，排除父进程、包含当前任务清单之外仍运行的子 Agent。不用模型名猜宿主。

plan/discuss 使用 gpt-6-astra，其余 gpt-6.1-sol；在途上限 2。`task_name` 用小写字母、数字、下划线；显式模型时 `fork_turns="none"`，完整任务背景写进 message。

父会话直接调用真实工具，保留返回的规范 task_name（或真实 agentId/agent_id）作为身份，不用输入短名替换返回值。`scripts/native.mjs` 是可注入端口映射，不是 shell API。父会话或用户配置的 wrapper 提供 `spawnAgent`、`waitAgentResult`、`interruptAgent`、`activeCount`：wait_agent 仅等通知，真正结果来自该 agent 的消息/终态，wrapper 返回真实 agentId、status、result、evidence。interrupt 必须确认子进程已停止才返回 true。

统一入口为核心 `scripts/lib/native-runtime.mjs` 的 `openRuntime`；未知宿主、缺工具、启动或途中失败提示一次并由父会话继续授权任务。权限拒绝停止被拒动作；无法确认旧 Agent 停止时先停旧执行，避免重复写。自审标 parent-self-review。
