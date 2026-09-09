# 配置安全、事务与激活

本 reference 适用于所有入口。核心原则是约定默认路径、allowlist 数据流、最小写入面、事务应用和新会话激活。

## 约定默认路径

所有脚本使用约定默认路径，用户可显式覆盖：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `--config` | `~/.zcode/v2/config.json` | ZCode 非敏感 config，含 provider entries 和 `options.apiKey` |
| `--agents` | `~/.zcode/agents/` | ZCode agent profile 加载目录 |
| `--workspace` | `git rev-parse --show-toplevel` | 从 cwd 自动发现 git 根 |
| `--team-config` | `<workspace>/.zcode/team-dev.json` | 团队配置 |
| `--state-dir` | `<workspace>/.zcode/state` | 激活状态目录 |
| `--attestation-output` | `<state-dir>/<team>/attestation.json` | doctor attestation 输出 |
| `--worktree-root` | `<workspace>/.zcode/worktrees` | worktree 外部根 |
| `--catalog` | `<workspace>/.zcode/catalog-dev.json` | catalog 文件 |
| `--output` | `~/.zcode/agents/` | profile 输出目录 |
| `--base-ref` | `HEAD` | worktree 基线引用 |

不在 git 仓库时 `--workspace` 自动发现失败，需显式传 `--workspace <absolute-git-root>`。

## 安全发现

调用方式（路径全部可选，使用默认值）：

```text
<absolute-skill-dir>/scripts/discover-config [--config <path>] [--agents <path>]
```

父主会话只消费脚本构造的 allowlist JSON，不直接读取原始配置。allowlist 范围：

- provider：`id`、`name`、`kind`、`enabled`、`source`、`credentialPresent`。
- model：`id`、context/output limits、modalities、reasoning enabled/variants/default。
- Agent frontmatter：`name`、`description`、`model`、`thoughtLevel`、`tools`、`permissionMode`、`maxTurns`、`background`、`injectAgentsMd`。

禁止读取 `credentials.json`，也禁止发现、输出或落盘 `apiKey`、token、secret、password、cookie、authorization、headers、baseURL 等凭据或连接细节。`credentialPresent` 仅表示 `options.apiKey` 或 `options.apiKeyEnv` 字段存在且非空，不输出其值。

显式 `enabled: false` 的 provider 和空 model provider 不进入候选。完整候选键使用 `custom:<provider-id>:<model-id>`。

## 凭据验证

`--config` 必须指向含 `provider`/`providers` 结构且带 `options.apiKey` 的 ZCode config 文件（如 `~/.zcode/v2/config.json`）。doctor 在 fingerprint 校验后、激活前会检查每个 route 引用 provider 的 `credentialPresent`：

- provider 启用但无 apiKey：报 `provider-missing-credential` DRIFT，提示运行时将报 "Model provider is not configured: \<id\>"。
- `--config` 无 provider entries（仅 modelCatalog.overrides）：报 `credentials-unverified` DRIFT。

凭据缺失不是模型断流，不得重试恢复。

## CLI 调用

所有脚本路径参数可选，使用约定默认值。仍拒绝 `credentials.json` basename、符号链接和相对路径（显式传参时）。

```text
# discover-config：零参数即可
<absolute-skill-dir>/scripts/discover-config

# doctor：只需 --session
<absolute-skill-dir>/scripts/doctor --session <session-id>
<absolute-skill-dir>/scripts/doctor --activate --session <session-id>

# team-state：--session 必需，其余可选
<absolute-skill-dir>/scripts/team-state setup --session <id> --setup-file <path>
<absolute-skill-dir>/scripts/team-state activate --session <id> --doctor-attestation <json>
<absolute-skill-dir>/scripts/team-state can-run --session <id>
<absolute-skill-dir>/scripts/team-state init-run --session <id> --run-id <id> --goal <text>
<absolute-skill-dir>/scripts/team-state update-task --session <id> --run-id <id> --task-file <path>

# worktree：只需 --task-id（create 还需 --manifest 或自动发现）
<absolute-skill-dir>/scripts/worktree create --task-id <id>
<absolute-skill-dir>/scripts/worktree bind --task-id <id> --path <worktree>
<absolute-skill-dir>/scripts/worktree cleanup --task-id <id>

# status：零参数（自动发现最新 run）
<absolute-skill-dir>/scripts/status

# render-agents：零参数
<absolute-skill-dir>/scripts/render-agents --apply
```

`--session` 是唯一必须由父调度器传入的参数（当前会话 ID），不可自动发现。

## 禁止写入面

- 禁止写入或修改 provider 配置，包括任何 config 的 provider 段。
- 禁止写入或修改 `credentials.json` 或其他凭据存储。
- 禁止写入或修改 `db.sqlite`、`tasks-index.sqlite` 或任何 ZCode 数据库。
- 禁止写入或修改 `ZCode.app`、`/Applications/ZCode.app` 或其他应用包。

setup/reconfigure 只能写 team config、run state、backup 和 `team-*.md` profile 目标。

## 事务应用

1. 在批准的输出根内创建唯一 staging 目录。
2. 生成 team config 与 route 中所有选定 profile 变种。
3. 校验 schema/version、名称、完整 model ref、reasoning variant、只读工具、route 去重无环和路径边界。
4. 展示预览，等待确认。
5. 覆盖前创建时间戳备份。
6. 原子 rename 应用；profile 输出目录写入 render journal，中断后再次 render 时先按 journal 自动恢复：output 缺失时从 rollback 还原，再清理 staging、rollback 和 journal。
7. 任一校验或写入失败时停止，回滚本次已应用目标。

## activationRequired 协议

生成或改写任何 profile 的事务必须在 team config 保存 `activationRequired: true`。当前旧会话不能执行任务，需新会话 doctor/activate。

新会话激活时 `doctor --activate`（零路径参数，自动发现）：

1. 父调度器确认 route 引用的每个必需 profile 已出现在当前会话 Agent 工具列表。
2. CLI 重新安全发现 catalog，核对 fingerprint。
3. CLI 校验 profile model、reasoning、tools、permission 与 team config 一致。
4. CLI 检查每个 route 引用 provider 的 `credentialPresent`。
5. 全部通过后写入 activation。

attestation 是父调度器提供的可审计声明，记录显式 agents 目录证据和绑定信息；它不是不可伪造的 ZCode 内部证明。必须保留 `agentToolListInternallyVerified: false`，父调度器不能把该声明提升为内部可信根。

## doctor

doctor 默认只读，检查 provider/model/reasoning 候选、provider 凭据状态、route、profile 文件、只读权限和 fingerprint。输出 `OK`、`DRIFT`、`BLOCKED`。`doctor --activate` 在匹配 setup state 且全部校验通过后写入 activation。
