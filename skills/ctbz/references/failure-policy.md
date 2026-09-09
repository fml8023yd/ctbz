# 失败分类与有限恢复状态机

先根据可观察错误分类，再决定 retry、恢复、handoff 或 fallback。错误文本不足以判断时标记 `unknown` 并停止自动降级，不用猜测消耗模型调用。

Agent 默认后台运行（`run_in_background: true`），不被打断。断流时用 `SendMessage` 在原 agent 恢复，不创建新 agent——新 agent 只用于 fallback 到不同 profile。

## 失败分类

| 分类 | 典型信号 | 对 route 健康度的影响 | 动作 |
|---|---|---|---|
| `transient` | 408、429、502、503、504、overloaded、upstream error、stream reset、EOF、临时 timeout | 计入当前 profile 的 transient 预算 | 有限重试；同 profile 恢复；再 fallback |
| `context` | context length、token limit、output limit | 不计 provider 断流 | 压缩落盘事实，创建新 Agent 并 handoff |
| `auth/config` | 401、403、unknown model、unsupported reasoning、"Model provider is not configured"、`provider_not_found` | 当前 profile 在本 run 熔断 | 不盲重试；只走已验证 fallback 或 BLOCKED_CONFIG |
| `tool/permission` | 工具缺失、权限拒绝、沙箱拒绝、命令不可用 | 不计模型健康度 | 修复契约/环境或停止，不切模型 |
| `task/code` | 测试失败、实现错误、Reviewer 缺陷 | 不计模型健康度 | 正常开发反馈；同工作树修正，不触发渠道 fallback |
| `cancelled` | 用户取消、父任务终止 | 不计模型健康度 | 进入 CANCELLED，不自动恢复 |

父主会话本身断流后，skill 无法继续执行。不要宣称能自动自救；恢复父会话属于外部 supervisor 或 ZCode 核心能力。

## 默认有限预算

除非 setup 中用户明确选择更小的非负整数，默认预算为：

```text
requestRetriesPerProfile: 1
resumeSameAgentPerProfile: 1
attemptsPerProfile: 2
circuitThreshold: 3
maxFallbackProfiles: route 中剩余 profile 数量
```

每个计数都写入 manifest。route 只能向前移动、不得成环；任何有限 retry 或 fallback 用尽后停止为 `FAILED_EXHAUSTED`。不能重置计数来伪造新 run，也不能用降低 reasoning 无限追加档位。

## 状态机

```text
PENDING
  -> RUNNING(profile, agentId)
      -> SUCCESS
      -> TRANSIENT_WAIT
          -> RETRY_SAME_PROFILE
          -> RESUME_SAME_AGENT
          -> HANDOFF_REQUIRED
      -> HANDOFF_REQUIRED
          -> RUNNING(new Agent, same profile or next profile)
      -> BLOCKED_CONFIG
      -> BLOCKED_TOOL
      -> FAILED_EXHAUSTED
      -> CANCELLED
```

每次迁移保存时间、错误摘要、failure class、profile、`agentId`、attempt 和剩余预算。只有明确成功结果才进入 `SUCCESS`。

## transient 恢复顺序

1. 在当前 profile 的预算内重试一次请求。
2. Agent 线程仍可恢复时，通过 `SendMessage` 对同 profile、同 `agentId` 恢复一次。断流恢复优先用 `SendMessage`，不创建新 agent。
3. 恢复失败或达到 circuit threshold 时，生成 handoff。
4. 选择 route 中下一个已加载 profile，创建新 Agent；切换模型绝不复用旧 Agent session。
5. route 耗尽后进入 `FAILED_EXHAUSTED`，报告已用 attempts 和最后错误。

同一 profile 在一个 run 内连续达到 `circuitThreshold` 个 transient terminal failure 后熔断。优先换到用户批准且已验证的健康 provider/model；降低 reasoning 只按显式 route 顺序发生，不能被描述为 provider 恢复手段。

## 重新选路

本版以 `initialize select` 和本机调用规则为准；旧版“降档即冗余”和成本选型器不属于当前入口。原线程恢复失败后，将失败 profile 名称写入 JSON 数组文件，通过 `--excluded <绝对文件路径>` 重新选择已初始化、已加载的候选。

每次恢复与替换保留原因、attempt 和实际 Agent ID；不能因为另一任务仍在运行就把失败任务标为完成。并行副本只有在当前任务明确需要独立判断时才建立，各自有任务契约与写入边界，不因模型名称自动增加副本。

## 其他分类

- `context`：将目标、已完成工作、文件状态和验证结果压缩为 handoff；新 Agent 可使用同 profile，但必须是新 `agentId`。
- `auth/config`：立即熔断当前 profile。若没有 doctor 已验证的 fallback，进入 `BLOCKED_CONFIG`。
- `tool/permission`：不得切 profile 规避权限。向用户报告缺少的工具或明确权限。
- `task/code`：保留同一 worktree，向原 Implementer 发送具体测试或 review 反馈；达到任务修正预算后失败，但不污染 route health。
- `cancelled`：停止尚未派发的依赖任务，保留 dirty 或未集成 worktree，不自动清理。

## 恢复前检查

任何已有副作用的 retry、resume 或 handoff 前，父主会话先检查 manifest、worktree status、完整 diff 与最近验证。重复写入可能破坏状态时，停止并要求人工决策。SendMessage 只能同档恢复；新 profile 必须新 Agent + handoff。
