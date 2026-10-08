# CTBZ 0.0.2

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
sh skills/ctbz/scripts/发版.sh --output /absolute/ctbz-0.0.2.tar.gz
```

`--write-lock` 仅显式源端维护使用；普通发布检查只读，覆盖修改/新增/删除。安装先校验并暂存全部包，备份到目标 home 的 `.ctbz-install/transactions`，失败回滚；原安装漂移停止覆盖。可用 `CTBZ_INSTALL_HOME` 替代 `--home-dir`，不修改实际 HOME。用户知识、偏好和项目 `.ctbz-record` 不进入安装镜像或发布包。

默认发版只打本地包；显式 `--publish` 才按现有授权推送 canonical GitHub 和 Release。无自动 commit、强制 tag、含 token remote 或阿里云上传。自动更新默认只检查；`--apply` 才 fast-forward 更新并部署，脏源码停更新。

原生入口：共享 `scripts/lib/native-runtime.mjs` 的 `openRuntime`，父 Harness 或用户 wrapper 注入真实工具。Codex `collaboration.spawn_agent`、`wait_agent`、`interrupt_agent`；ZCode 精确 toolNames 来自本次工具列表。Node 不创造宿主工具，不默认调用厂商 API。模拟端口验证流程，真实原生集成需独立冒烟证据。详细字段见 [派发契约](skills/ctbz/references/派发.md)。

Codex plan/discuss 使用 gpt-6-astra，其余 gpt-6.1-sol；在途上限 2、下划线 task_name、显式模型 fork_turns=none。只读角色空 writeSet；代码角色仅授权范围。原生工具未强制 sandbox 时角色边界属于契约约束。

保留需求诊断、统一工作流、方法/角色、看板控制、知识分级、治理与内审。ZCode profile 初始化/config/doctor 等仅在私有 adapter，初始化失败不阻断父进程执行。旧版先归档到发现目录外，验证后再按授权清理；不删除未知项目和原始用户数据。

## 共享工作台连接（0.0.2）

父会话通过 `node skills/ctbz/scripts/workbench.mjs` 访问工作台。未配置时不连接任何默认服务；未连接沿用本地 dashboard。配置完成并选择共享 project/node 后，工作台是共享任务状态唯一权威；本地 dashboard、manifest 和 `.ctbz-record` 只保存执行证据与投影，不能据本地 completed 宣称共享 accepted。

1. `doctor` 必须通过 apiVersion=1、claims/idempotency/project-scopes 能力和 Bearer 认证 state 校验；读取 state、node、events 后决定工作。
2. 真实 `claim` 成功返回 workClaim.id 与冻结 context 后才可执行共享节点；401/403/409 或网络不确定时停止领取相关执行，查状态与原操作记录，不换 token/key 绕过。
3. 父会话分派或亲自执行，真实关键进展提交 checkpoint，带实际 claimId；租约到期用 renew，不能冒充已续期。
4. 已确认领取后断网可在原授权/写集合继续本地工作，保留检查点并明确未同步；重新连接先查询状态，再使用原操作 key 重试。
5. 提交 submit 后是 submitted 待验收；另一个真实身份 review-claim 再 review。主进程自审如实记录，不能伪造独立身份或直接宣称 accepted；管理员人工验收是不同协议。
6. 证据字符串必须说明位置/版本/可访问性；本机绝对路径不会变成远端可访问附件，跨机验收前提供实际可读引用。

配置文件默认 `~/.ctbz/workbench.json`，JSON `{ "url":"http://127.0.0.1:18922", "token":"…" }`，0600；`config <受保护JSON文件|->` 仅新建，已有配置由用户私下更新。`CTBZ_WORKBENCH_CONFIG` 可指定文件；`CTBZ_WORKBENCH_URL/TOKEN` 覆盖字段。`show/doctor` 脱敏。写请求发送前将 key、请求和服务/身份哈希保存到配置旁 operations（或 `CTBZ_WORKBENCH_OPERATIONS`，可指向项目 Harness）；`retry <key>` 保留原请求，不存 token，成功标完成，完成记录再次 retry 会拒绝并要求查 node/state，历史回执不能作为当前领取。超过七天未确认操作拒绝重放，先查询状态人工对账。无后台执行器。

知识库 `CTBZ_KNOWLEDGE_DIRS` 支持一个绝对路径或 JSON 绝对路径数组，有序去重；首目录为主库，全部显式目录须存在且可读。search 只读所有库，保留来源路径；未设置沿用 `~/Documents/.ctbz/知识库`，不移动旧库。自动总结用 `知识库.js add experience -`（stdin），只追加主库 `自学习知识/自记库-YYYY-MM.md`；主库不可写即失败，不转写次库。confirmed/approve 仍需用户明确确认，自动总结只为 experience。

客户端源位于独立 ctbz-workbench/client.mjs，核心 vendor 为发布快照；source.json 记录 SHA256，跨仓测试检查同步，修改后须同步并重锁。
