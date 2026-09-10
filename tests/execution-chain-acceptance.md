# 执行链验收记录

结论：局部自动化检查通过；2026-09-10 本会话已完成真实团队执行链验收（激活→select→真实派发→回执→worktree 落档→测试红→复核→修复→绿→排除重选恢复），真实链路主体通过。剩余：⑦交接后新会话续接验收、宿主权限拒绝不可观测不声称、worktree 工件处置与真实项目集成验收待用户。

## 真实派发验收通过记录（2026-09-10，会话 sess_ec1c2429-0d39-4723-92be-504829607528）

本会话即"新会话"：使用本仓库 skills/ctbz（v1.7.0，methodFingerprint b44fc3e6…）执行真实链路，未触碰全局 ~/.agents/skills/ctbz 旧副本。

**激活**：宿主 Agent 工具列表实测含 40 个 team-ctbz-* profile（8 角色×5 模型），写 loaded JSON 后 `initialize activate` 通过，写入 已初始化.txt 与 activeSessions，status=initialized、drift=null。前两次 activate 报 catalog-fingerprint-drift 为瞬态：宿主会话启动时（07:24）重写 ~/.zcode/v2/config.json 导致现场发现与 prepare 指纹短暂不一致；配置稳定后指纹一致（ef2056f6…），doctor 直跑与 activate 均通过。结论：瞬态窗口内的 DRIFT 是预期保护，非缺陷。

**运行闭环**：can-run=true → init-run（runId=acceptance-dispatch-20260910，dashboard synced）→ checkpoint（seenPlanRevision=0，按实际阅读）→ 逐任务 update-task → finish-run completed（synced，无警告）。已记录顺序偏差：首轮两路派发发生在首个 checkpoint 之前，后续均按"checkpoint 先于派发"执行。

**真实派发 7 次（6 成功 1 真实失败），全部后台运行、回执逐项核对**：

| # | 任务 | 角色/profile | 模型 | write-set | 结果 |
|---|------|-------------|------|-----------|------|
| t1 | 版本/角色清单核实 | explorer-m2247a332420b | GLM-5.3-Flash | 无（只读） | 回执 3 项事实全对，零写入 |
| t2 | median 工件四任务草案 | planner-m3ba8c97bc658 | GLM-5.3 | 无（只读） | 草案含 write-set/验收/依赖，零写入 |
| t3 | worktree 构建 median.mjs | implementer-m2247a332420b | GLM-5.3-Flash | worktree acceptance/median.mjs | 未越界未 commit，v1 缺口如期存在 |
| t4 | 按 v2 规格测试 | tester-m2247a332420b | GLM-5.3-Flash | worktree acceptance/median.test.mjs | 3 绿/3 红（偶数×2、空数组×1），环境失败与缺陷红正确区分 |
| t5 | 双版规格复核归因 | reviewer-m3ba8c97bc658 | GLM-5.3 | 无（只读） | 三红归因规格错配，最小修复清单带行号证据 |
| t6 | 按清单最小修复 | implementer-m2247a332420b | GLM-5.3-Flash | worktree acceptance/median.mjs | 6/6 全绿；测试文件 mtime 未变；父会话独立复跑同结果 |
| t7 | 复测（第一备用） | tester-m1c697a56125f | deepseek-V4.1-flash | 无 | **真实 API 失败**：渠道不支持该模型引用（476ms 零工具执行）；如实记 failed→cancelled，未伪造回执 |
| t8 | 复测（第二备用，接替 t7） | tester-md82d9b508a2f | omen-alpha | 无（只读+运行） | 独立复跑 6/6 绿、断言未弱化 |

**恢复链路实证**：select --excluded 排除失败 profile 后按 调用规则.json 生效规则（exec-roles-flash：Flash→deepseek→omen-alpha）逐级回落；t7 失败为用户 provider 配置含失效模型条目（渠道只认 deepseek-v4-pro/-flash/-flash-vision-exp），属配置卫生问题，非 select/派发逻辑缺陷；未靠降级或伪造绕过。

**worktree 隔离实证**：worktree create（base=e1b1e70 完整 OID）+ bind 所有权校验通过；主工作区 dirty 未被移动清理；全部写操作限定在 allowed-write-set；只读角色（explorer/planner/reviewer）全程零写入。

**尚未执行（不声称通过）**：⑦交接后新会话按同一设计/验收/任务版本续接（需用户新开会话）；宿主权限拒绝不可观测，未验证；真实成本已发生（7 次模型调用）但未做预算核对；工件保留在 /Volumes/数据盘/网站/agent军团/.ctbz-acceptance/wt-20260910/t3-implement-build-82898e83-…（未集成，处置需用户授权）；真实项目级 manifest 模块成果/集成/最终组合验收未做（本次为技能自验收工件）。

证据：/Volumes/数据盘/网站/agent军团/.ctbz-acceptance/（checkpoint、任务 JSON、excluded 列表）；run manifest：~/Documents/.ctbz/generations/d22eaa51-2602-463e-924c-73270cc7e269/state/ctbz/runs/acceptance-dispatch-20260910.json；项目看板：.agents/skills/ctbz/.ctbz-record/。

## 维护批次 maintenance-governance-20260910（16:07，generation ebf93b62）

用户批准"修吧"后实施三项治理修复（真实 CLI 隔离夹具验证 + 12/12 测试绿）：

1. **prepare 携带激活**：profile 名称集合不变时 activeSessions 自动进新代（team-state 同步 `carried-from` 标记），维护批次不再踢出在用会话；名称集合变化时按设计不携带。夹具实测：换代后 select 免重激活通过。
2. **adopt-run 跨代接管**：`--adopter-state-dir` 分离权限代与归属代；旧 manifest 冻结 cancelled 注明去向、新 manifest 重绑当前代并留 adoptions 溯源；终态拒绝再接管（实测）。819bfc01 下午撞到的"跨代 sessionMismatch + work.create 不存在"两个缺口就此关闭。
3. **dashboard work.create**：建组入口 + 重复拒绝（WORK_EXISTS）+ 未知 action 报错附合法清单；项目看板.md 补"先 create 后 claim"顺序。

当日实测补充：用户已清理失效 deepseek-V4.1-flash、新增 deepseek-flash（m76e85086f8d8）并同步调用规则；15:39 f9f0d0d5 代换装新模型集（旧 m1c697a56125f×5 退役），本批次叠加。**因模型集合变化，本批不携带激活，机器处于 awaiting-new-session——需新开会话说"草台班子初始化"一步激活（快路径）**；819bfc01 全天 13 次真实派发（12 完成 1 停止）验证了硬条款与团队链路，其历史工作完好，但该会话在新激活完成前不能再 select。

## 维护批次 maintenance-dispatch-clause-20260910（同日 10:29–10:35）

用户批准后执行：①SKILL.md 写入团队派发硬约束（所有权节）、收窄「小修复直接执行」边界、新增初始化快路径与 drift 双因甄别；②重生成 dependencies.lock.json（88 文件，新指纹 a4b5d285…），methods check 通过、9/9 测试绿；③同 5 模型 prepare（generation 58d1481a）+ 本会话 activate 一次通过零重试；④全局 ~/.agents/skills/ctbz 换软链指向仓库安装根（旧副本备份 ctbz.backup-20260910-103003），经全局路径回归验证 installRoot 归一、drift=null——副本劫持类 drift 结构性根治；⑤新 generation 真实派发冒烟（explorer 只读核实硬条款在 SKILL.md:126 生效，零写入）。

事故与修复：10:26/10:29 两次 prepare 把正在使用的 sess_819bfc01 激活顶掉（用户 10:28 撞上「请在当前会话完成激活」），已用同一名单为其补 activate 并复验 select 通过；教训入记忆——维护批次后须检查其他活跃会话并补登记。遗留：UD1 原型 46 处主会话直改发生在硬条款生效前，不追溯；该会话上下文内技能文本为旧版，新条款自其下次会话起完全生效。改动未 commit（用户未授权提交）。

## 授权修复及配置更新（2026-09-10）

下文为首次验收历史，当前状态以本节为准。用户已授权修复生成规则及重新 prepare。生成说明已按写权限区分执行角色与只读角色，新增断言先失败、修复后两套测试 9/9 通过。沿用原有 5 个模型生成 40 个受管 profile，retired=0，逐文件核验 mismatches=0；API/服务商配置及调用规则未修改。安装来源更新为本仓库 skills/ctbz，status 显示 drift=null、awaiting-new-session、initialized=false。

旧 40 个配置均备份至 /Users/linguojin/Documents/.ctbz/generations/d22eaa51-2602-463e-924c-73270cc7e269/backup。此次 prepare 使用 maintenance-profile-refresh-20260910 维护批次标识，非宿主真实会话 ID；未尝试在旧会话伪造激活。仍需用户新开会话，并明确使用本仓库版脚本激活，之后才能真实派发验收。全局 ~/.agents/skills/ctbz 技能副本未同步，勿误用旧脚本重新覆盖本次绑定。

## 实际运行

- `node --test tests/execution-chain.test.mjs tests/workflow.test.mjs`：9/9 通过。
- `node skills/ctbz/scripts/methods check`：valid=true，16 个索引方法，指纹 d8823bb10ab2c1428ca48abde0cb4c71dedb8eb945025cbdc9bd85e3c1601bd7。
- `git diff --check`：通过。
- 真实 `initialize status`：initialized=false，phase=awaiting-new-session，安装目录或方法版本漂移。

离线测试使用虚构 custom:test 模型，仅验证程序行为，不代表模型在线或宿主真实加载。隔离 CLI 在临时 home/agents 中真实执行 prepare，生成角色文件和状态；未使用全局目录、未调用模型。证据保留于 /private/var/folders/lh/kx292kbn6ms6hsmrc7fzf6cw0000gp/T/ctbz-chain-MM7b8j。

## 覆盖范围

角色数量/工具权限/本地路径；合法模型顺序；排除后重选；未加载/未知模型拒绝；同 provider 默认候选；角色与方法指纹漂移拒绝；未激活 select 拒绝；无有效配置和凭据信息时 activate 拒绝；九步推荐、权限及交接文案静态约束；上游源和许可证。

无效配置激活的拒绝原因断言为 credentials-unverified 与 unknown-model-ref，不能把此测试视为同会话激活限制的验证。

## 发现与阻塞

1. 真实团队绑定已漂移且未激活。需经用户确认目标安装目录及重新 prepare 的全局 profile 写入范围，再新开会话加载激活。不得用通用 Agent 替代、不伪造 loaded 或回执。
2. scripts/lib/初始化.mjs:33 生成 profile 仍笼统写“父会话负责脚本、派发和落盘”，与新共享契约允许授权执行角色生产文档的分工不一致。应区分父会话的项目状态/调度与执行者的任务脚本/文档写入，修订后测试实际生成内容。本轮只记录发现，未修改生成逻辑。
3. Matt 适配方法由父会话通过任务材料直接传递，不在 16 项 roleMethods 索引中。当前结构可工作，但尚无真实派发证明具体角色拿到必要阶段方法；真实验收必须检查任务包，不能仅看 methods check。

## 尚未执行的必要验收

- 实际 initialize select 返回合法团队 profile 后真实 Agent 派发、回执及恢复。
- 授权文档执行角色在隔离 worktree 落档，只读 planner/reviewer 不写入，父会话审定版本与状态。
- 原型构建、真实测试、独立复核与缺陷修复的完整任务链。
- ⑦交接后新会话按同一设计/验收/任务版本继续，不重访谈、不越过用户业务确认。
- 按实际 manifest 完成模块成果、集成与最终组合验收；无法观测的宿主权限拒绝和真实成本不声称已验证。

未改全局配置、未重新初始化团队、未派发模型、未提交推送；保留隔离证据。9 项绿灯不替代上述真实链路验收。
