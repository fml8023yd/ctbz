# 原生失败策略 0.1.0

原则：失败不回退为"主进程亲力"。默认路径是重派新 Agent；重派不可行时报告阻塞；只有用户明确说"你自己做 / 亲历 / 别派了"才亲力（记录 `mode=亲力`，最终仍要验收）。

失败内审即时化（0.2.1）：失败不等整批结束。任一 Agent 终态为失败 / 失联 / 权限拒绝 / 无证据完成时，班主在该回执到达的当下——立即记录、任务级禁用该 Agent、立即重派（模型失败 / 断流）或停止（权限拒绝）；其余在途 Agent 不受影响。

| 触发 | 行为 | 记录 |
|---|---|---|
| 未知宿主 | 报告阻塞，问是否亲力；用户明确后才亲力 | unknown-harness |
| 缺私有 adapter 或真实工具 | 报告阻塞，问是否亲力；用户明确后才亲力 | adapter-unavailable / missing-native-tools |
| 启动失败 | 重派新 Agent；再失败报阻塞 | native-start-failure |
| 途中失败（Agent 失联） | 确认旧执行停止，核查检查点后重派新 Agent；不接管执行 | native-mid-task-failure + agentId + checkpoint |
| 失败即时内审（任一失败终态） | 不等整批结束：立即写 `.ctbz-record/runs/<runId>/audit-<taskId>-<agentId>.md`，记录失败原因 / 回执 / 检查点；记录保留供 E4 终检与质疑预演引用 | immediate-audit |
| 任务级禁用失败 Agent | 同一 run 内不再派发同一身份到同一任务；禁用不跨 run 泄漏 | agent-disabled |
| 模型失败 / 断流 / 无证据完成 | 按原 brief 立即重派新 Agent（不同 model / profile 优先）；连续 2 次同任务失败升级班主裁决 | immediate-audit + redispatch |
| 无法确认旧 Agent 停止 | 先停止旧执行，避免重复写；未确认停止前不派发写同一 writeSet 的任务 | awaiting-stop |
| 合并者（P2）失败 | 换模型重试；仍失败用最佳单计划 + 分歧记录继续 | merge-fallback |
| 裁决者（P4）失败 | 班主裁决，派 scribe 落盘；班主不执笔 | adjudicator-fallback |
| 法定人数不足 | 到 4/6 即可继续；迟到作附录；缺谁记谁 | quorum |
| 权限拒绝 | 停止被拒动作，保留现场，不绕过；**不重派** | permission-denied |
| 宿主拒绝派发或满载 | 记录原因与真实回执，重试/排队；不静默亲力 | harness-rejected |
| 写集合冲突（正确性，非调度） | 排队，真实检查点再派 | write-conflict |
| 跨 run 写冲突 | 冲突任务排队；不冲突并行；不静默覆盖 | write-conflict |
| 跨 leader 写集冲突 | 父会话统一排队串行；不静默覆盖 | worker-write-conflict |
| 组长派生超过 2 级 | 组长拒绝派生并上报，父会话裁决 | depth-exceeded |
| 组长途中失联 | 按 native-mid-task-failure 重派新组长；父会话不接管执行 | leader-mid-task-failure |
| 复命闸（`内审.mjs 复命`）不过 | 交付标缺口，修复后重跑；exit≠0 不得标交付完成 | fuming-gate |
| 无 Agent 可用 | 报告阻塞，问是否亲力；用户明确后才亲力 | no-native-tools |
| 班主终检（E4）不通过 | 保留缺口，预算内回修；关键项未完成不得标交付 | parent-failed / evidence gap |
| 3 轮回修不过 | 停，报缺口 | rework-budget |

降级在当前 session 提示一次；每个受影响任务保留原因、回执及处置证据。确需班主自审时标 parent-self-review，不冒充独立 Agent 或异源模型。项目完成仍取决于用户原定验收。

ZCode 可选初始化/select/doctor 失败只停对应原生 profile 路径，按上表报告阻塞或请求亲力授权，不强迫用户新开会话。凭据缺失不索取或探活作为开工前提；API executor 默认不存在。
