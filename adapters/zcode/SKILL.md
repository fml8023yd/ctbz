---
name: ctbz-zcode
metadata:
  version: 0.0.1
description: CTBZ 在 ZCode 的原生子 Agent 适配、可选 profile 配置和体检；使用唯一全局 ctbz 核心。
---

先读 `~/.agents/skills/ctbz/SKILL.md`；方法、角色、看板只引用该核心。安装仅限 `~/.zcode/skills/ctbz-zcode`，不放全局技能目录。

从当前宿主工具列表核对 ZCode 身份与真实可调用工具，不用模型名猜宿主。父会话可直接按当前工具 schema 调用已加载的原生工具并收集回执；不要求用户编写 wrapper。程序嵌入时，宿主提供的 wrapper 在 `toolNames.start/wait/stop` 提供本次真实工具精确名，并提供 `start/wait/stop/activeCount`。`scripts/native.mjs` 只调用注入端口；Node 不创建宿主工具，也不调用厂商 API。角色/profile 路由由 wrapper 按已加载能力决定，不能把磁盘 profile 当作已加载。

统一入口为核心 `scripts/lib/native-runtime.mjs` 的 `openRuntime`；失败提示一次并由父会话继续授权任务，权限拒绝停止被拒动作。实际 receipt 含 agentId、status、result、evidence。stop 必须确认执行停止；检查点交给父会话核对后续作。自审标 parent-self-review。

ZCode 本机 profile 初始化是可选能力，详见 [初始化](references/初始化.md)、[配置与体检](references/configuration.md)。未初始化、未激活、无合法 profile 或工具不可用均不阻断父会话授权工作。profile 漂移时仅停对应子 Agent 路径。初始化不会扩大已有工具、费用或写权限；配置及凭据不入发布包。session 位于项目 `.zcode/ctbz`；Codex session 不使用此目录。
