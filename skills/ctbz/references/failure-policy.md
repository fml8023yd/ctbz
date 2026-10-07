# 原生失败策略 0.0.1

| 触发 | 行为 | 记录 |
|---|---|---|
| 未知宿主 | 主进程执行已有授权任务 | unknown-harness |
| 缺私有 adapter 或真实工具 | 主进程执行 | adapter-unavailable / missing-native-tools |
| 启动失败 | 主进程执行 | native-start-failure |
| 途中失败 | 确认旧执行停止，核查检查点后接管 | native-mid-task-failure + agentId + checkpoint |
| 无法确认旧 Agent 停止 | 先停止旧执行，避免重复写 | awaiting-stop |
| 权限拒绝 | 停止被拒动作，保留现场 | permission-denied |
| 达到在途上限 2 | 排队，真实检查点再派 | concurrency-limit |
| 主进程验收不通过 | 保留缺口，预算内回修 | parent-failed / evidence gap |

降级在当前 session 提示一次；每个受影响任务保留原因、回执及接管证据。主进程自审标 parent-self-review，不冒充独立 Agent 或异源模型。项目完成仍取决于用户原定验收。

ZCode 可选初始化/select/doctor 失败只停对应原生 profile 路径；未初始化、未激活、不合法、未加载均由主进程继续授权工作，不强迫用户新开会话。凭据缺失不索取或探活作为开工前提；API executor 默认不存在。
