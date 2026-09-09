# 1.5.0 工作范围、回执与成果

本协议补充项目看板和运行记录约定。主会话仍是唯一调度者；没有后台模型执行器，网页不自动唤醒、打断或恢复 ZCode。

## 目录、任务和会话

目录保存项目看板。旧项目继续使用 `scopeId:null` 默认任务；独立任务是现有树中的顶层 group，带 work 配置。`work.upsert`：

```json
{"node":{"id":"model-study","title":"分层建模研究"},"work":{"mode":"loop","goal":"比较已确认的候选方向","budget":{"maxRounds":12,"minutes":180}}}
```

后代节点属于该独立任务。普通 node.upsert 创建模块时传 parentId；跨独立任务移动已有节点不允许，创建有来源的后续任务。各范围单独保存模式、阶段、状态、预算、轮次、负责会话及计划版本。项目全景汇总展示，控制操作必须选定具体任务。

主会话直做使用 `scope.claim {scopeId,sessionId}` 登记所有者；有所有者时其他会话需要 `takeover:true,reason`，接管递增 epoch。后续 dashboard apply 传 `--session <实际会话ID> --epoch <返回epoch>`。心跳过期不自动接管。未登记的旧项目仍可使用主会话直接记录；实际使用时应先登记。一个会话可负责多个范围，独立会话可分别负责不同范围。

团队任务：

```sh
node <skill>/scripts/team-state init-run --state-dir <实际状态目录> --team ctbz --session <实际会话ID> --run-id <新runID> --workspace <项目绝对路径> --scope-id model-study --goal <已确认目标>
node <skill>/scripts/team-state checkpoint --state-dir <实际状态目录> --team ctbz --session <实际会话ID> --run-id <runID> --file <检查点JSON绝对路径>
```

省略 --scope-id 使用默认任务。init-run 登记负责人和 epoch；每个 scope 同一时刻一个负责人。模型配置仍需每个 session 实际加载并分别 activate，相同配置下多个已激活会话互不失效。配置 generation 变化后重新验证，不把旧激活复制到新配置。

## 检查点与采用计划

入口先核对当前 scope 的关联 run 和执行记录，补投影，再发布检查点。无法对账时 canDispatch=false；未知或需接管的在途任务单独列出，不能依据旧看板重新派发。

检查点 JSON：

```json
{"seenPlanRevision":3,"summary":"已核对目标调整和本轮回执","decisionStatus":"adopted"}
```

seenPlanRevision 来自实际读取的 scope.planRevision，不能直接抄最新值冒充阅读。目标、预算、优先级或用户决定变化后，新派发须先采用新计划；未解决用 needs-clarification。省略 seenPlanRevision 保留此前采用值。返回 checkpoint、requests、changes、inFlight、unknown、canDispatch、dispatchReason、dashboard。原节点 execution.planRevision 保留最初派发依据。

同 generation 换会话继续使用 adopt-run，登记接管原因，保留原会话历史并使旧 epoch 写入失效。接管只转交记录，新主进程必须核实实际子 Agent 状态。新任务派发前 checkpoint；真实旧 Agent 恢复能力由宿主决定。

## 请求、暂停和结果修订

control.request 建立 pending 请求，包含 scopeId 和 action；每个范围一条有效请求。pending 可用 control.withdraw {requestId} 撤回，或新请求携带 replaceRequestId 明确替代。收到后不可悄悄替换。

主进程 checkpoint 可带 control 回执：

```json
{"summary":"停止新派发，等待在途任务","control":{"requestId":"实际请求ID","stage":"received","message":"已收到暂停请求"}}
```

完成后 stage=completed，失败用 failed 并解释原因；也可直接 dashboard control.ack。必须绑定原 requestId；同内容重复回执幂等，旧请求不能影响新请求。收到暂停不等于全部子任务已停止；暂停/停止完成要求范围内无 active 执行。停止设 stopped，显式 resume 才恢复。等待期间仍保存迟到成果及其验收、集成状态，不删除现场。

绑定 run 的节点执行状态、结果、证据不接受 node.upsert 覆盖。网页取消、重开、修订生成请求，主进程核对实际执行后处理：取消用正常 update-task cancelled，不能只改网页；重开或修订用：

```sh
node <skill>/scripts/team-state revise-task --state-dir <实际状态目录> --team ctbz --session <实际会话ID> --run-id <runID> --request-id <实际请求ID> --reason <核对依据>
```

此命令只接受对应 run 中的 reopen/correct 请求；仍 running 的任务先到达实际检查点。修订保留旧任务的完整证据，不能改变角色或模型身份；重开保留前次尝试、清除旧 agentId 并变为 pending，不自动创建 Agent。成功后 checkpoint 完成原请求回执。拒绝或尚不能执行的请求回执 failed。重复同一修订只补投影，不增加第二份修改。

## 历史、知识和导出

round.start/finish 传 scopeId，每个范围一轮一个方向，范围之间独立。轮次保存选择排序和完成时节点结果快照；之后重开不改变历史。旧版缺失快照明确不可用。

未解决问题可以编辑；question.void {id,reason} 作废保留历史。知识修订新建 experience，填写 supersedesId 指向旧 confirmed 条目；用户确认替代后旧条目变 superseded。竞争修订不能同时替代同一有效旧版。

导出范围与读者分开：`dashboard export --section rounds --audience leader` 也包含轮次。--scope-id 限定独立任务，省略导出全部；已解决问题包含实际选择与补充答案。JSON 是记录归档，不是盲目覆盖现有项目的恢复命令。

## 成果表和文件

结果由主进程计算并核对，网页只负责展示、筛选、排序及下载。登记 table 使用 JSON：

```json
{"id":"strata-v1","title":"分层结果","scopeId":"model-study","nodeId":null,"round":null,"version":"v1","source":"实际计算产物及数据版本","methodology":"说明统计对象、时间范围、分母、分层规则和可比条件","baseline":"实际基准版本","columns":[{"key":"layer","label":"层级","type":"text"},{"key":"sampleCount","label":"样本量","type":"number","unit":"条"},{"key":"baseline","label":"基准","type":"number"},{"key":"current","label":"本版","type":"number"},{"key":"delta","label":"差异","type":"number"}],"rows":[]}
```

空 rows 是模板，不能据此声称实验完成。每行按列提供 text、number 或 null；缺失数据用 null，不写成 0。列定义包含单位，表级保留口径与来源。最多 100 列、10000 行、10 MiB；更大结果保存摘要表及单独文件，不能静默截断。各指标由实际定义计算，不对各层比率直接平均。

可编辑模板见 [分层结果 JSON](../assets/stratified-results.json)。登记前替换来源、口径、单位和基准，填写真实行；各表级描述合计不得超过 256 KiB。升级时若既有 schema 1 备份损坏或与原件不同，停止迁移并保留两个文件，核对后再继续。

```sh
node <skill>/scripts/dashboard artifact-add --workspace <项目绝对路径> --file <表格JSON绝对路径> --format table
node <skill>/scripts/dashboard artifact-add --workspace <项目绝对路径> --file <报告绝对路径> --format file --title <报告名> --scope-id model-study --version v1
```

登记复制到 .ctbz-record/artifacts，以唯一 ID 保存不可覆盖版本和 SHA-256；同 ID 不覆盖，新版本用新 ID。CSV 原文件可按 file 登记下载，结构化比较表使用 JSON 格式，不猜 CSV 的数据类型。网页通过受限接口读取登记内容，JSON/CSV 下载与页面使用同一数据；CSV 对可能执行公式的文本转义。不要登记凭据或模型配置。服务只提供受管成果，不接受网页提交任意本机路径。远程访问沿用认证、只读服务及 HTTPS/FRP 约定。
