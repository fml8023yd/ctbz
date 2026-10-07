# CTBZ 0.0.1

一份全局核心，Codex/ZCode 私有原生适配器。未知宿主或原生失败提示一次，主进程继续授权任务；权限拒绝不绕过，自审不冒充独立评审。

| 源码 | 安装 |
|---|---|
| `skills/ctbz` | `~/.agents/skills/ctbz` |
| `adapters/codex` | `~/.codex/skills/ctbz-codex` |
| `adapters/zcode` | `~/.zcode/skills/ctbz-zcode` |

运行环境：Node.js 22 或更新、Git、tar。

本地仓库：`/Users/master/CODEX/草台班子/ctbz`；命令在仓库根执行，脚本按实际位置定位，不依赖该示例路径。

```sh
node skills/ctbz/scripts/发布检查.js --write-lock
node --test tests/*.test.mjs
node skills/ctbz/scripts/发布检查.js
node skills/ctbz/scripts/部署.js --home-dir /absolute/temporary-home
node skills/ctbz/scripts/部署.js --home-dir /absolute/temporary-home --check-only
sh skills/ctbz/scripts/发版.sh --output /absolute/ctbz-0.0.1.tar.gz
```

`--write-lock` 仅显式源端维护使用；普通发布检查只读，覆盖修改/新增/删除。安装先校验并暂存全部包，备份到目标 home 的 `.ctbz-install/transactions`，失败回滚；原安装漂移停止覆盖。可用 `CTBZ_INSTALL_HOME` 替代 `--home-dir`，不修改实际 HOME。用户知识、偏好和项目 `.ctbz-record` 不进入安装镜像或发布包。

默认发版只打本地包；显式 `--publish` 才按现有授权推送 canonical GitHub 和 Release。无自动 commit、强制 tag、含 token remote 或阿里云上传。本轮范围：仅本地。自动更新默认只检查；`--apply` 才 fast-forward 更新并部署，脏源码停更新。

原生入口：共享 `scripts/lib/native-runtime.mjs` 的 `openRuntime`，父 Harness 或用户 wrapper 注入真实工具。Codex `collaboration.spawn_agent`、`wait_agent`、`interrupt_agent`；ZCode 精确 toolNames 来自本次工具列表。Node 不创造宿主工具，不默认调用厂商 API。模拟端口验证流程，真实原生集成需独立冒烟证据。详细字段见 [派发契约](skills/ctbz/references/派发.md)。

Codex plan/discuss 使用 gpt-6-astra，其余 gpt-6.1-sol；在途上限 2、下划线 task_name、显式模型 fork_turns=none。只读角色空 writeSet；代码角色仅授权范围。原生工具未强制 sandbox 时角色边界属于契约约束。

保留需求诊断、统一工作流、方法/角色、看板控制、知识分级、治理与内审。ZCode profile 初始化/config/doctor 等仅在私有 adapter，初始化失败不阻断父进程执行。旧版先归档到发现目录外，验证后再按授权清理；不删除未知项目和原始用户数据。
