---
name: ctbz-zcode
metadata:
  version: 0.2.1
description: CTBZ 在 ZCode 的原生子 Agent 适配：run_in_background 后台派发、完成通知后主进程介入、时刻待命、ServerChan 推送、30 分钟一次性唤醒、任务身份与跨模型交叉验证；使用唯一全局 ctbz 核心。
---

# ZCode 适配器 0.2.1

先读 `~/.agents/skills/ctbz/SKILL.md`；方法、角色、看板只引用该核心。班主权限、自动/计划模式、30 分钟决策升级以核心 [班主基线](~/.agents/skills/ctbz/references/班主基线.md) 与 [自动模式](~/.agents/skills/ctbz/references/自动模式.md) 为准。本文件只写 ZCode 宿主能力与派发差异。

回执带 method，交付前留痕与质疑预演按核心执行。失败即时内审：不等整批、记录/禁用/重派按核心执行。

安装仅限 `~/.zcode/skills/ctbz-zcode`，不放全局技能目录。

## 0. 边界

| 主进程做 | 主进程不做 |
|---|---|
| 拆任务、写 brief、派发、排队、验收 | 写或改任何项目交付文件 |
| 读代码与证据，判断、裁决、问澄清 | 替子 Agent 补最后一行 |
| 记 `.ctbz-record`、dashboard、决策账 | 拿子 Agent 的“已完成”当验收 |

唯一例外：用户明确说“你自己做 / 亲历 / 别派了”。记录 `mode=亲力`，按普通执行流程做，最终仍要验收。没有这句授权，主进程不接管执行。

## 1. 宿主识别

- 从当前工具列表核对 ZCode 身份与真实可调用工具，不用模型名猜宿主。
- 父会话直接按当前工具 schema 调用已加载的原生工具并收集回执；不要求用户编写 wrapper。
- 程序嵌入时，宿主 wrapper 在 `toolNames.start/wait/stop` 提供本次真实工具精确名，并提供 `start/wait/stop` 三个函数。同步宿主（一次调用即返回终态回执）可省略 wait，端口把 wait 映射为恒等。
- `scripts/native.mjs` 只调用注入端口；Node 不创建宿主工具，也不调用厂商 API。
- 角色/profile 路由由 wrapper 按已加载能力决定，不能把磁盘 profile 当作已加载。

## 2. 后台派发（run_in_background）

| 步骤 | 动作 |
|---|---|
| 派发 | 调原生 Agent 工具，带 `run_in_background: true`，附独立 brief、taskId、role、phase、writeSet |
| 返回 | 立即拿 handle 与真实 `agentId`；不阻塞等结果 |
| 继续 | 主进程继续拆、派、验收其他任务；不空转、不轮询 |
| 完成通知 | 宿主回消息或事件；读取该 Agent 的终态回执（status、result、evidence、agentId） |
| 介入 | 核身份 → 核证据 → 记 dashboard → 决定验收、回修或补派 |
| 同步宿主 | 宿主无后台能力时允许同步派发；记录一次“无后台”能力事实，不伪装后台 |

完成通知只触发“介入”，不触发“接管”。主进程不替该 Agent 补做未完成部分；缺证据按失败策略重派或报告。

### 2.1 分级派生（leader）

只有 `role=leader` 的组长 profile 带 `Agent` 工具，可以派生工人；其余既有 profile 保持“不得派生”，全员爆炸到此为止。

leader 是核心 `角色清单.json` 里的注册角色（id=`leader`，tools 含 `Agent`，与其余角色的唯一区别就在这），批量生成器按角色区分派生权限：leader 追加“只派生工人，不得派生组长；最大深度 2 级；不做裁决、不写交付文件”，其余角色保持“不得派生Agent”。派发时 brief 写 `role=leader`，writeSet 为空；`native-runtime` 的 `validateTask` 接受 `role=leader` 并把它当只读角色，非空 writeSet 直接拒绝。

| 约束 | 规则 |
|---|---|
| 深度 | 最大 2 级（主→组长→工人）；超过必须拒绝并记 `depth-exceeded` |
| 组长职责 | 只拆工人任务、聚合回执、原样上报；不裁决、不写交付文件、不跨任务扩权，writeSet 为空 |
| 回执 | 每一级都记 taskId/role/writeSet；工人回执必须带宿主真实 `agentId`，组长原样转交，不改写、不美化 |
| 工人 | 不得再派生；收到派生请求直接拒绝并上报 |
| 写集 | 跨级同一规则：同一文件同一时间单 owner；组长派发前先确认工人写集互不冲突 |
| 失败 | 深度超限、写集冲突、工人失联都按失败策略记录并上报主进程，组长不接管执行 |

组长不替代主进程验收。主进程仍需核身份、核证据、核交付位置；组长的“已完成”只是回执，不是验收结论。

## 3. 时刻待命

- 在途期间主进程保持可响应：用户提问先答，新指令先处理，旧 Agent 不停，除非明确暂停、取消或不兼容目标。
- 新任务可独立验收且写集不冲突 → 立即派；写集冲突 → 排队，等真实检查点再派。
- 待命不是空闲：读产物、核证据、维护看板、准备下一批 brief 都是待命动作。
- 待命不是接管：不写交付文件，不替 Agent 收尾，不以“顺手”当例外。

## 4. 并发

- ZCode 侧不设并发上限：并行开几个子 Agent 由宿主调度器决定。
- 宿主拒绝或满载时记 `harness-rejected` 与真实回执，重试或排队。
- ctbz 核心与私有 adapter 均不预设并发数、不要求在途计数；不用空任务清单绕过越权派发。

## 5. 任务身份

| 字段 | 要求 |
|---|---|
| taskId | 小写字母、数字、下划线；会话内唯一 |
| role / phase | 来自核心角色清单与阶段枚举 |
| agentId | 必须来自宿主真实返回值，与派发 handle 一致；不一致按失败 |
| planVersion | 执行任务绑定计划版本 + hash |
| 回执 | 改动文件、行为说明、验证输出、未完成项、风险、checkpoint |

brief 必须通过“新鲜 Agent 测试”：没读过本会话的 Agent 能直接开工。用户明确授权亲力时记 `parent-only`，不伪造 agentId。

## 6. 模型与角色交叉验证

- 计划、攻击、验收使用不同角色；profile 可用时换模型或渠道。
- 每份回执记录实际 model/profile；不把“不同 Agent”说成“不同模型”。
- 同一模型多 Agent ≠ 跨厂商验证；只有一个可用 profile 时明确标 `single-model`。
- 结论冲突按证据裁决，不按票数；少数派不被合并稿吞掉。
- 未发生的独立验证不声称；主进程自审标 `parent-self-review`。

## 7. 推送（ServerChan）

- 通道：ServerChan。SendKey 只从环境变量（如 `SERVERCHAN_SENDKEY`）或用户配置读取；key 不入发布包、不入日志、不进聊天。
- 时机：交付完成、必须问用户、30 分钟到期或恢复。
- 短格式：结果一句 + 证据位置 + 缺口 + 下一件；提问用一句话问题 + A/B/C + 推荐 + 默认 + 截止 + runId。
- 推送失败不阻塞交付，但汇报必须标“未送达”。

## 8. 30 分钟决策升级与一次性唤醒

先自查，四项全过才问：

1. 真的阻塞吗？不决定就不能继续，或继续会做错。
2. 能否用读代码、跑测试、查文档、已有授权、默认值解决？
3. 能否先做无依赖部分？
4. 影响够大吗？不可逆、外部写入、花钱、权限、目标变更、高爆炸半径歧义。

问法：推送一句话问题 + A/B/C（各一行）+ 推荐 + 默认 + 30 分钟截止 + runId；停止受影响分支，继续无依赖工作。

决策升级必须发推送；推送失败不阻塞计时，但汇报标“未送达”。

唤醒：

| 宿主能力 | 动作 |
|---|---|
| 有定时/提醒工具 | 登记一次性 30 分钟唤醒；收到回复即取消；到点无回复按默认项继续 |
| 无定时/提醒工具 | 不假装有后台计时器；在下一个真实检查点补执行，记录实际延迟 |
| 父会话退出 | 不保证准点执行；恢复时核对新消息、问题状态与版本后补执行 |

30 分钟内回复 → 按回复继续。30 分钟无回复 → 采用默认项，记录“未获回复，采用默认 X”。最终汇报带决策账：当时面临什么决定、A/B/C、为什么必须问、你没回、我们怎么做的、影响是什么。

## 9. 失败与权限

| 触发 | 行为 | 记录 |
|---|---|---|
| 派发失败 | 记录，重试或排队；不静默亲力 | harness-rejected |
| Agent 失联 | 确认停止，核查检查点，重派新 Agent；不接管执行 | native-mid-task-failure + agentId |
| 无法确认旧 Agent 停止 | 先处理停旧执行，保留现场，避免重复写 | awaiting-stop |
| 合并者失败 | 换模型重试；仍失败用最佳单计划 + 分歧记录 | merge-fallback |
| 裁决者失败 | 主进程裁决，派 scribe 落盘；主进程不执笔 | adjudicator-fallback |
| 法定人数不足 | 到 4/6 即可继续；迟到作附录；缺谁记谁 | quorum |
| 写集冲突 | 冲突任务排队；不冲突并行 | write-conflict |
| 无 Agent 可用 | 报阻塞，问是否亲力；用户明确后才亲力 | no-native-tools |
| 权限拒绝 | 停止被拒动作，不绕过，不切模型或宿主 | permission-denied |
| 3 轮回修不过 | 停，报缺口；关键项未完成不得标交付 | rework-budget |

自审标 `parent-self-review`，不冒充独立 Agent 或异源模型。

## 10. 运行时与初始化

统一入口为核心 `scripts/lib/native-runtime.mjs` 的 `openRuntime`。实际 receipt 含 agentId、status、result、evidence。`stop` 必须确认执行停止；检查点交给主进程核对后续作。

`openRuntime` 返回 `mode=parent` 只表示当前无原生端口，不是执行授权；按上表报阻塞、请求亲力授权或重派，不静默接管。

ZCode 本机 profile 初始化是可选能力，详见 [初始化](references/初始化.md)、[配置与体检](references/configuration.md)。未初始化、未激活、无合法 profile 或工具不可用均不阻断主进程已授权的拆派验收工作。profile 漂移时仅停对应子 Agent 路径。初始化不会扩大已有工具、费用或写权限；配置及凭据不入发布包。session 位于项目 `.zcode/ctbz`；Codex session 不使用此目录。
