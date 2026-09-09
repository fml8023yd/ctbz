# Worktree 隔离与集成契约

Agent 线程隔离不提供文件隔离。只读 Agent 可共享主工作区；每个并行写任务必须使用独立 worktree，并且 write-set 互不重叠。

## 何时创建

父主会话在派发写 Agent 前确认：

- workspace 是 Git 仓库且用户给出了显式绝对路径。
- 任务 write-set 明确，与其他并行写任务不重叠。
- 当前 base revision 已记录为完整 Git OID。
- 外部 worktree root 是用户确认的显式绝对路径。
- manifest 中该 task 尚无 `worktree` 或 `worktreeOwnership`；目标路径由 `create` 在 root 下生成。

无法满足任一条件时，不并行派发写任务。路径重叠的任务建立依赖后串行；不是 Git 仓库时可在用户明确同意后串行处理，但不得声称存在 worktree 隔离。

## 创建与绑定

父 Agent 负责 worktree 生命周期、task ownership、集成和验收。所有 Git 命令都使用 `git -C <explicit-absolute-path>` 或等价显式路径，不依赖 shell 当前目录。

调用 CLI 时仅使用对应子命令 allowlist，`--task-id` 和 `--base-ref` 是标识/引用，其余路径参数必须显式绝对：

```text
<absolute-skill-dir>/scripts/worktree create \
  --repo <absolute-git-root> \
  --root <absolute-worktree-root> \
  --task-id <task-id> \
  --base-ref <git-ref-or-oid> \
  --manifest <absolute-run.json>

<absolute-skill-dir>/scripts/worktree bind \
  --manifest <absolute-run.json> \
  --task-id <task-id> \
  --path <absolute-worktree>
```

五个 `create` 参数都必需。`create` 从 base ref 解析并记录完整 base revision，生成唯一 branch/worktree/owner token，然后直接原子写入 task ownership（`worktreeOwnership`）以及 worktree、branch、baseRevision 和 HEAD。返回值中的绝对 worktree 路径是后续任务契约和 `bind --path` 的唯一来源，不得猜测生成目录。

`bind` 不创建、不收养也不改绑 worktree；它只验证该路径是 manifest repository 的 linked worktree，并验证 task 已由 `create` 持久化的 ownership 与 task、repository、路径、branch 和 base revision 完整一致，随后刷新 HEAD。禁止绑定外来 linked worktree；即使该 worktree 属于同一 repository，只要没有匹配的 `create` ownership，也必须拒绝。一个 worktree 也不得被其他 task 引用。

创建后先确认：

```text
worktree root == contract.worktree-root
HEAD == recorded base revision
status == expected initial state
```

主工作区已有未提交更改时不得移动、清理或覆盖。若任务依赖这些更改，父主会话必须先明确建立可审计基线或停止询问用户。

## 子 Agent 约束

任务契约必须把 `worktree-root`、`allowed-write-set`、`forbidden-files`、`base-revision` 和 verification 命令传给 Agent。

子 Agent：

- 所有读写与命令限定到绝对 worktree root。
- 只能修改 allowed-write-set；发现需要越界时停止并报告。
- 不创建额外 worktree，不切换目标分支，不操作主工作区。
- 不自动 commit、merge、rebase、push 或删除分支。
- 完成时返回改动文件、完整 diff 摘要、测试命令/结果和未解决事项。

同一任务的 Implementer、修正、Tester 与 Reviewer 顺序复用同一个 worktree。新的 Agent 在 handoff 后先检查 status 和 diff，不重放已完成的写入。

## 验收与集成

每个写任务依次经过：

1. 父主会话核对实际改动未越过 write-set，并查看完整 diff。
2. 在该 worktree 运行任务契约中的定向验证。
3. 派发只读 Reviewer；Reviewer 使用独立 `agentId`，不得修改 worktree。
4. 有缺陷时把具体反馈发回同 profile Agent，或按失败策略 handoff 给新 Agent。
5. 验证和 review 都通过后，父 Agent 按任务依赖顺序集成并验收。
6. 集成到目标工作区后运行全量验证，并确认最终 diff 与 manifest 一致。

默认不 commit。若用户明确要求 commit，仍由父 Agent 在验收后执行；子 Agent 不自行提交。集成冲突停止自动流程，保留 worktree 和 manifest 状态供人工处理。

## 清理

清理只调用：

```text
<absolute-skill-dir>/scripts/worktree cleanup \
  --manifest <absolute-run.json> \
  --task-id <task-id>
```

CLI 从显式绝对 manifest 读取已持久化的 ownership 和 worktree 路径；不得额外传 worktree path，也不得绕过脚本直接删除。`cleanup` 在删除前强制检查 ownership 完整且唯一（没有其他 task 引用同一 worktree）、task status 为 `completed` 且 `integration.status` 为 `integrated`、`verification.status` 为 `passed`、worktree clean 且无 merge conflicts，并核对 manifest branch 与实际 worktree。只有脚本成功返回后才把清理视为完成。

此外，父调度器只有同时满足以下条件才允许请求清理：

- task 已集成且父 Agent 最终验收通过。
- worktree clean，无未跟踪或未提交文件。
- 完整测试通过，目标工作区包含预期改动。
- manifest 已原子记录 integration 和 cleanup 决策。
- 用户的保留策略允许删除。

未集成、dirty、测试失败、cancelled、冲突或状态未知的 worktree 一律保留。清理只操作 manifest 绑定的显式绝对路径，不使用通配符或目录扫描批量删除。
