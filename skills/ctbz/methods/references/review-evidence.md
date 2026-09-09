# 评审证据协议

先读 [共享契约](../contract.md)。parent 准备与保留材料，reviewer 只用 Read/Grep/Glob 读取。来源：Superpowers `skills/subagent-driven-development/scripts/review-package` 的任务级评审目的，运行实现改为 CTBZ 的 Node.js CLI；不执行归档中的原脚本。

## 固定任务与快照

派发前在 [任务契约](../templates/task-brief.md) 固定项目绝对路径与实际 project/node/run/task、任务 worktree、完整 base SHA、write-set 和初始 status。每份评审包只面向该身份的实际变更，不能从父工作区随手取 HEAD，也不能用 HEAD~1 替代任务开始基线。已有用户改动和前序输入先记录；无法辨明范围时补足可审查基线，不能把别人的改动算给当前任务。

生成时暂停该任务的写入，使用当前 CTBZ 安装中的脚本。以下占位全部替换为任务契约实际值；含空格/中文的路径整体加引号。

```text
node "<skill>/scripts/review-package" create \
  --workspace "<项目绝对路径>" \
  --worktree "<该任务绝对工作区>" \
  --project <实际项目 ID> \
  --node <实际节点 ID> \
  --run <实际 run ID 或 parent-only> \
  --task <实际 task ID> \
  --base <固定 base SHA> \
  --out "<项目>/.ctbz-record/methods/<node>/<run>/<task>/review-<round>"
```

输出目录必须是主项目 `.ctbz-record` 下的新目录，已存在目录不覆盖。CLI 检查项目和 worktree 属于同一仓库，固定 base/head、身份、内容摘要及创建时间，提供：

| 文件 | 用途 |
| --- | --- |
| manifest.json | project/node/run/task、workspace/worktree、base/head、变更路径、文件摘要和各 patch 摘要 |
| changes.patch | 相对固定 base 的当前实际改动，包含已提交和未提交 tracked 变化 |
| staged.patch、unstaged.patch | 当前暂存和未暂存差异，便于确认未提交状态 |
| files/ | 变更后的完整文件内容，包括新增 untracked；删除项由 manifest 与 diff 说明 |

父会话保存 create 返回的 package 路径及 manifest SHA-256，核对全部文件与 write-set。未授权 Git 提交的任务直接用这些快照评审；base/head 相同不意味着没有改动。`.ctbz-record` 是项目证据而非产品变更，脚本排除该目录；需要评审其中的规格、计划或报告时，父会话另传对应文件及内容摘要。只读文档审查可按 [文档模板](../templates/document-review.md) 工作，无需创建空代码 diff。

原始 patch 中的二进制差异不能替代视觉或领域检查；父会话按实际验收额外提供可读预览/验证产物。脚本拒绝不支持的文件或正在变化的工作区时修正前提后创建新轮次目录，不绕过拒绝，不把半写包交给 reviewer。

## 消费、修复与集成

给 reviewer 同一身份的任务契约、已确认要求、实现报告与测试日志、manifest/patch/files 绝对路径和 create 时保存的摘要。使用 [任务评审模板](../templates/task-review.md) 输出独立规格与质量两项结论。代码上下文、删除前内容或跨模块调用证据不足时由父会话提供，reviewer 不自行运行 Git 回退。

在接受结论、集成或声明完成前，父会话运行：

```text
node "<skill>/scripts/review-package" check --package "<评审包绝对路径>"
```

check 必须成功，且评审结论绑定的 manifest 摘要与父会话保存的创建摘要一致。工作区变化、包内容被改或摘要不匹配时，旧结论不代表当前内容；保存旧包、创建新包并复验受影响范围。check 证明快照一致，不证明实现正确或评审已经发生。

每轮修复附上原 findings、上一快照摘要、新快照摘要、具体变化与覆盖测试；未提交修复比较两份快照/完整内容，不能只 diff 两个相同 HEAD。用 [复审模板](../templates/re-review.md) 逐项判定。集成改变代码或接口时，父会话对最终目标工作区生成新材料并验证组合行为。

原始规格、评审结论、修复报告、所有快照与处置理由长期保留。它们提供证据，不能通过编辑报告或删除目录推进 manifest/dashboard 的完成状态。
