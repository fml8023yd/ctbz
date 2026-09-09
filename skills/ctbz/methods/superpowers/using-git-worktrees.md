# 使用隔离工作区

先读 [共享契约](../contract.md)。仅 parent 管理 worktree 生命周期，子 Agent 在已固定路径内工作。

来源：Superpowers 6.3.0 `skills/using-git-worktrees/SKILL.md`。适配：复用 CTBZ ownership 与显式路径，不自动安装依赖、改忽略文件/提交或在隔离失败后转共享写入。

1. 核对实际工作区、分支、Git 根、已存在的 linked worktree 与任务契约。已在分配的隔离 worktree 时复用；子模块与 linked worktree 不混淆。普通父会话小任务可以在其授权工作区执行，并行写任务必须隔离且 write-set 不重叠。
2. 有团队 manifest 时按 [CTBZ worktree 契约](../../references/worktrees.md) 创建与验证。父会话固定项目绝对路径、task、完整 base revision 及外部 worktree root，再运行本安装 `node "<skill>/scripts/worktree" create`，参数以该契约为准；使用返回路径，不推测目录名。
3. 已由宿主提供的外部 worktree 不冒充 CTBZ create 所有权，不强行 bind 或清理。主会话无团队 manifest 时可用已授权的宿主隔离路径并记录来源；不伪造 manifest 只为使用脚本。
4. 在工作区记录初始 status、HEAD 与基线检查。依赖先读项目声明和已安装工具，不自动运行联网安装。已有测试失败时区分基线缺陷与本任务影响；能独立继续的授权工作继续，缺少必要条件则报告。
5. 将绝对 worktree、base、write-set、禁止文件与验证命令交执行角色。修复、测试、评审复用同一任务工作区，交接先读已有状态，禁止子 Agent 再建 worktree、切主分支或清理别人的目录。

隔离创建失败时先说明实际错误并修复前提；未经重新安排不把多个写任务移入共享目录。源工作区未提交修改若是必要输入，应由父会话建立可审计基线或按实际授权串行处理，不能悄悄漏掉它们。

验收：每个并行写任务的工作路径、起点、权限和 ownership 可核对；用户原改动保持可见，基线与任务变化可区分。清理只在 [收尾方法](finishing-a-development-branch.md) 和所有权检查满足后进行。
