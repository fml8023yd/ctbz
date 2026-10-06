# CTBZ → CTBZ-Codex 迁移计划（2026-10-06）

review_scale: 轻
review_receipt: 待执行 L1
review_camps: deepseek,zhipu,tencent,moonshot
plan_sha256: 待执行 L1
取证文件: docs/取证/ctbz-codex-迁移计划-20261006-取证.md

## 需求诊断

| 项 | 结论 |
|---|---|
| 原始表述 | 原 CTBZ session 只落 zcode 目录；新建 CTBZ-Codex；Codex 子进程最多 2 个 ↗ #接口契约，计划 Astra，其余 gpt-6.1-sol；各 Harness 共用核心、分用子进程适配器 |
| 真实问题 | 当前初始化状态默认落 `~/Documents/.ctbz`；核心只产出 ZCode profile，未定义 Codex 子进程生命周期 |
| 目标结果 | 原 CTBZ 默认状态落项目 `.zcode/ctbz`；CTBZ-Codex 可被 Codex skill 调用并给出固定模型路由、2-agent 上限、回执与失败恢复契约；新 Git 仓库有本地提交与远端配置 |
| 非目标 | 不改 provider 凭据、宿主数据库或 ZCode 应用；不伪造远端已推送 |
| 成功证据 | 原仓库测试通过；路径测试证明默认不写全局；Codex adapter contract 测试通过；新仓库 `git status` 干净、提交和 tag 存在 |

## 现场核对

| 断言 | ↗证据 |
|---|---|
| 源码 HEAD 为 `1f8634f`，工作树干净 | `docs/取证/ctbz-codex-迁移计划-20261006-取证.md:2` |
| session 默认由 `storageRoot` 解析并写入全局 home | `docs/取证/ctbz-codex-迁移计划-20261006-取证.md:6` |
| team-state 已有项目 `.zcode/state` 默认路径 | `docs/取证/ctbz-codex-迁移计划-20261006-取证.md:16` |
| Node 脚本没有直接调用 Codex/ZCode Agent API | `docs/取证/ctbz-codex-迁移计划-20261006-取证.md:20` |

## 方案与任务

1. T1：将 initialize/体检的默认 session home 锚定当前 Git workspace 的 `.zcode/ctbz`；显式 `--home` 保留兼容读取，默认不读写 `~/.ctbz-location.json`；补路径测试与文档。
2. T2：在新仓库复制共享核心，新增 `skills/ctbz-codex` Harness 适配层、Codex skill、JSON contract 生成器与测试；明确 ZCode 与 Codex 子进程边界。
3. T3：为 CTBZ-Codex 写统一入口文档、模型路由和最多两个 Agent 的失败恢复协议；增加版本与 Git 元数据。
4. T4：执行全套测试、构建产物清单、L3/L4 验收；原仓库与新仓库分别验证。

## 接口契约

| 接口 | 输入 | 输出 |
|---|---|---|
| `initialize` | `--workspace`、`--home`、`--session` | 状态路径、generation、激活结果 |
| Codex adapter | `phase`、`role`、`prompt`、`writeSet`、`parentModel` | `model`、`maxAgents=2`、`agentRequest`、回执字段 |
| Harness 入口 | `--harness zcode|codex` | 适配器名与能力声明 |

## 验收

| 编号 | 验收 | 命令 |
|---|---|---|
| A1 | 原仓库测试 | `node --test tests/*.test.mjs` |
| A2 | 路径默认值与旧显式 home 兼容 | `node --test tests/体检.test.mjs tests/execution-chain.test.mjs` |
| A3 | Codex adapter contract | `node --test tests/codex-adapter.test.mjs` |
| A4 | 新仓库状态与提交 | `git -C ../CTBZ-Codex status --short --branch` |

## 构建期六问

| 问 | 答案 |
|---|---|
| 自指 | 计划和产物都以路径/命令验证，L1 后重算 sha |
| 反例 | 默认仍生成 `~/.ctbz-location.json` 将使路径验收失败；测试检查其 mtime 与不存在性 |
| 冲突 | 旧显式 `--home` 不能被新默认覆盖；回归 execution-chain 与 governance |
| 覆盖 | initialize、体检、paths、SKILL、reference、new adapter 与 tests 同时盘点 |
| 一致 | adapter JSON 字段与测试逐字比对 |
| 真实 | 最后一次编辑后重跑测试、git diff、产物 sha |

## 自疑（设计阶段）

1. 默认 workspace 未发现会不会误写 home？证伪：`node skills/ctbz/scripts/initialize status --workspace /tmp/无仓库`；结果：需返回明确错误。
2. Codex 适配器会不会偷偷直接调用模型？证伪：`rg -n "fetch|apiKey|credentials|spawn_teammate" ../CTBZ-Codex/skills/ctbz-codex`；结果：只允许合同生成与宿主 collaboration 调用说明。
3. 新仓库复制会不会把 `.ctbz-record` 和用户状态带入？证伪：`git -C ../CTBZ-Codex ls-files | rg '(^|/)(\.ctbz-record|credentials|db\.sqlite)'`；结果：应为零匹配。

## 行动账

| 编号 | 动作 | 依据 | 取舍 | 证伪 |
|---|---|---|---|---|
| A1 | 默认 session 改到 workspace `.zcode/ctbz` | `skills/ctbz/scripts/lib/存储位置.mjs:15`（`if (choice === undefined) {`） | 否掉全局 locator 默认分支，保留显式 home 兼容 | `node --test tests/体检.test.mjs` → exit 0 |
| A2 | 新增 Codex adapter skill 与合同生成器 | `skills/ctbz/references/派发.md:9`（`` `workflow` 的 `agent(prompt, opts)` ``） | 否掉 Node 直连模型，改由宿主 collaboration API 执行 | `node --test tests/codex-adapter.test.mjs` → exit 0 |
| A3 | 新仓库从当前 HEAD 复制并设独立 remote | `git rev-parse HEAD`（`1f8634f`） | 否掉等待不可达远端，先留本地提交与可重试 push | `git -C ../CTBZ-Codex log -1` → exit 0 |
