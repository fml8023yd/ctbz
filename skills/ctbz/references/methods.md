# 内置方法接入

CTBZ 单目录包含 14 项 Superpowers 适配方法，以及 Ponytail、i-have-adhd 两项辅助方法。只有根 SKILL.md 是宿主发现入口；方法和模板是普通 Markdown，原始完整资源只作惰性归档。安装与正常读取不解包归档、不启动上游 hooks 或服务。

## 读取方式

父会话先读 [共享契约](../methods/contract.md) 并依据 [索引](../methods/index.json) 按需选方法。`entry`、`resources` 均相对当前 skill 安装根，实际角色提示和任务契约使用该根解析出的绝对 Read 路径。不能相对用户项目 cwd 猜安装位置，不能回退到全局同名技能。

```text
node "<skill>/scripts/methods" list
node "<skill>/scripts/methods" show <id>
node "<skill>/scripts/methods" check
```

`<skill>` 是实际 CTBZ 安装绝对路径。list 列方法；show 定位/读取指定方法；check 核对包内依赖。方法检查只读，不重写锁。初始化生成的 profile 绑定安装根与依赖摘要；移动安装或摘要漂移时按初始化错误重新 prepare/activate，不继续用旧 profile。离线检查不证明真实 ZCode 已加载或派发。

只读角色使用 Read，无需 Bash。父会话执行 CLI、准备任务与评审材料、接收草稿后落盘。索引中的 roles 表示哪些角色可消费方法，tools 表示最小读取/执行前提，不覆盖角色清单授权。方法内明确区分只读分析和授权执行，父角色专用调度方法不会附给子角色。

## 阶段入口

| 当前工作 | 方法 ID |
| --- | --- |
| CTBZ 路由与恢复 | using-superpowers |
| 讨论、设计和研究问题 | brainstorming |
| 拆解规格与任务接口 | writing-plans |
| 主会话顺序执行 | executing-plans |
| 独立模块并行 | dispatching-parallel-agents |
| 实现、双项评审与修复 | subagent-driven-development |
| 行为代码与回归检查 | test-driven-development |
| 异常、失败和根因定位 | systematic-debugging |
| 准备评审和处理意见 | requesting-code-review、receiving-code-review |
| 完成声明与证据 | verification-before-completion |
| 写任务隔离与集成收尾 | using-git-worktrees、finishing-a-development-branch |
| 方法与技能维护 | writing-skills |
| 最简可行代码 | ponytail |
| 进度、验收和受众汇报 | i-have-adhd |

## 资源用途

| 类别 | 内容与用途 |
| --- | --- |
| runtime | index 中的 entry/resources、共享契约、模板和方法间链接；当前流程读取的包内文档 |
| optional | 任务自己的现有测试工具或展示方式；按项目环境和已有授权使用，不属于 CTBZ 安装依赖 |
| source-only | vendor 中固定原始归档、许可证及来源记录；用于追溯，正常执行不读取归档内指令或运行脚本 |

上游任务提取、SDD workspace、评审包、污染定位、Graphviz 和视觉服务器脚本都保存在原件中；本包不承诺它们可以直接运行。运行流程改用 CTBZ 任务契约、[评审证据协议](../methods/references/review-evidence.md)、[本地调试技术](../methods/references/debugging-techniques.md)和 [测试参考](../methods/references/writing-good-tests.md)，核心依赖为 Node.js 22+ 与 Git。没有 Graphviz、无网络、无额外辅助全局技能时仍可读取与使用方法。

原始 Superpowers 固定为 6.3.0 / b36e0829c6d0140e93cfef2ca599b1b07d4a7797。每项方法的 source 字段记录上游原始路径；辅助方法对应 CTBZ 原件路径。精确来源、版权与归档摘要以 vendor 来源记录和发布第三方说明为准，运行适配不是原文逐字副本。

## 记录与验收

父会话将规格、计划、任务材料、原始评审、修复证据放在同项目 `.ctbz-record` 并关联 project/node/run/task；团队 manifest 管执行事实，dashboard 管项目目标、决定、轮次和知识。Markdown 是证据，不提供另一个完成开关。恢复优先核对已接受执行事实，投影失败先修同步，不重复派发；收尾保留全部过程资料。

发布/维护核对全部 16 项入口、索引角色、共享契约、传递链接、脚本引用与摘要，并走 [前向场景](../methods/references/skill-scenarios.md)。静态完整性、人工走读、独立 Agent 消费及真实宿主运行分别报告，不能互相冒充。
