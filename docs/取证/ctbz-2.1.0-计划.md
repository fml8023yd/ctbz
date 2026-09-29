# ctbz 2.1.0 —— ZCode 线回归（恢复原生链 + 移植宿主无关机制 + 看板多图）

review_scale: 重

版本: 2.1.0

workspace: /Users/maolong/Betty/草台班子/ctbz

取证文件: docs/取证/ctbz-2.1.0-取证.md

## 前言

用户原话：「回到原来的逻辑…从 2.0.3 作为基础版，更新一个 2.1…不认 2.3 2.4 那些更新，但是我们评估其内容是否有必要加入。同时你也看到了，dsh 和 cc 已经作为独立的项目了，其实也没必要沿用这些」。

背景：`2.0.4`（2026-09-21 `fad75e6`）把 ZCode 注册链整体退役以适配 dsh 宿主（`initialize`/`doctor`/`render-agents`/`discover-config`/`validate-team`/`lib/team-config`/`lib/初始化`/`lib/本机配置` 降为存根，删 `lib/model-ref.mjs` 与 `assets/team-config.schema.json`）。现 dsh 与 cc 已拆为独立项目（`ctbz-dsh` 独立仓、`ctbz-cc` 独立仓），ctbz 主仓回归 ZCode 原生线。

关键事实：**main 分支从未被阉割**——上述原生机件在 main 上完好（分支于 `3361bb0` 分叉，dsh 改动全在 dsh 线），本版无需"恢复动作"，只需**移植 dsh 线上与宿主无关的质量机制 + 看板多图**。

## 现场核对

| 断言 | 锚点 | 出处（路径相对 workspace 根） |
|---|---|---|
| main 测试基线 17 例全绿 | ↗A | 取证文件 §1（node --test 实测 tests 17 / pass 17 / fail 0） |
| main SKILL.md 253 行 | ↗B | 取证文件 §1（grep -c 实测） |
| main HEAD 与 v2.0.3 tag 的关系（施工基线） | ↗U | 取证文件 §9（git log/diff 实测） |
| 2.0.4 迁移提交为分叉原因 | ↗C | `skills/ctbz/SKILL.md:7`（开发工作区节：唯一源） |
| main 含 ZCode 原生 initialize 节 | ↗D | `skills/ctbz/SKILL.md:193`（## 一句话初始化） |
| main 含所有权与运行闭环节 | ↗E | `skills/ctbz/SKILL.md:203`（## 所有权） |
| 派发闸.mjs 803 行待移植 | ↗F | 取证文件 §2（文件清点实测） |
| 内审.mjs 554 行待移植 | ↗G | 取证文件 §2 |
| 反审直连.mjs 494 行待移植 | ↗H | 取证文件 §2 |
| preflight.mjs 341 行待移植 | ↗I | 取证文件 §2 |
| 待移植 references 三件 | ↗J | 取证文件 §2（反审协议 144 / 内审协议 84 / 派发 133 行） |
| 待移植测试四件 | ↗K | 取证文件 §2（派发闸 893 / 内审 578 / 主文锚点 215 / 看板视图 123 行） |
| graph-math.js 62 行待移植 | ↗L | 取证文件 §2 |
| ~/.zcode/AGENTS.md 无镜像块 | ↗M | 取证文件 §3（grep 计数 0） |
| 源仓 HEAD 与工作区干净 | ↗N | 取证文件 §4（git rev-parse HEAD = 00e1951…；status 0 项） |
| 12 项移植件 + 1 项删除件（13 项处置） | ↗O | 取证文件 §4（逐文件哈希表） |
| app.js 差异恰 8 hunk 且全为多图 | ↗P | 取证文件 §5（diff 实测清单） |
| 反审直连凭据路径非 dsh 专有 | ↗Q | 取证文件 §6（共用同一份凭据文件） |
| 反审.mjs 仅在被替换的「派发前必跑」节内被引用 | ↗R | 取证文件 §7（grep 命中清单） |
| 各闸门门槛（派发闸定级门槛） | ↗S | `skills/ctbz/scripts/派发闸.mjs:49`（SCALE_SEATS） |

## 处置清单（四类，用户已确认评估结论）

| 类别 | 内容 | 处置 |
|---|---|---|
| ZCode 原生机件 | initialize・doctor・render-agents・discover-config・validate-team・pick-profile・lib/team-config・lib/初始化・lib/本机配置・lib/model-ref.mjs・assets/team-config.schema.json | **不动**（main 上完好，无需恢复） |
| 宿主无关机制 | 末段契约・哑巴模式・派发前必跑・反审硬门・边界延伸・自证自疑・行动账・构建期六问・完工自审 | **移植 + 去 dsh 化** |
| 看板多图 | graph-math.js + 甘特/依赖图/里程碑 + 视图测试 + docs/演示 | **移植** |
| dsh/cc 适配层 | 反审.mjs（workflow 骨架生成器）・dsh-regression.test.mjs・迁移说明・与main差异清单 | **丢弃**（宿主专有） |

## 任务契约

### T1 机制移植（去 dsh 化）

- 目标：把 dsh 线的宿主无关机制落到 ZCode 线，剔除 dsh 专有描述。
- write-set（相对 workspace 根）：
  `skills/ctbz/scripts/派发闸.mjs`（新建）、`skills/ctbz/scripts/内审.mjs`（新建）、`skills/ctbz/scripts/反审直连.mjs`（新建）、`skills/ctbz/scripts/preflight.mjs`（新建）、`skills/ctbz/references/反审协议.md`（新建）、`skills/ctbz/references/内审协议.md`（新建）、`skills/ctbz/references/派发.md`（新建）、`tests/派发闸.test.mjs`（新建）、`tests/内审.test.mjs`（新建）、`tests/主文锚点.test.mjs`（新建）、`skills/ctbz/SKILL.md`、`CHANGELOG.md`。
- 具体改动（逐条）：
  1. **逐字节复制**（清单见 ↗F–↗L）自 dsh 仓（源 `/Users/maolong/Betty/草台班子/ctbz-dsh` HEAD `00e1951`），随后仅做下述 dsh 措辞替换，**不改逻辑**。
  2. 去 dsh 化替换（机械，逐字）：注释与文案中「（dsh 版）」「dsh 线」「cc-haha 线」→ 去标记或改「ZCode 线」；镜像标记 `~/.dsh/AGENTS.md` → `~/.zcode/AGENTS.md`；**凭据路径 `~/.dsh/settings.yaml` 与 `~/.dsh/.credentials.yaml` 保留原样**（↗Q：两宿主同机共用这一份，是实际落点非 dsh 专有）；脚本头部 shebang 统一为 `#!/usr/bin/env node`（实测：`派发闸.mjs`/`内审.mjs` 已是 env 形态；`反审直连.mjs` 为 env 形态；`preflight.mjs` 待复制后核对，如为绝对路径 shebang 则改 env）。
  3. `references/派发.md` 重写为 ZCode 版：原三通道表（workflow/subagent/spawn_teammate）整节替换为 ZCode 原生描述（Agent 工具 + profile 派发 + 反审直连），其余字段契章节保留。
  4. `SKILL.md` 增补各节（**本版已执行**；插入锚点：末段契约/哑巴模式 → 「极简输出」节之后；派发前必跑 → 「主进程服务姿态」之前；其余八节 → 「反审硬门」之后；层级反审/内审/模型阵营三节 → 「统一模式规则」之前）：末段契约・哑巴模式・派发前必跑（硬闸）・反审硬门・边界延伸・自证与自疑・行动可质疑性・构建期六问・完工自审。原「反审硬门（1.8.2）」节内容被新版替换。
  5. `SKILL.md` 版本 → `2.1.0`；`CHANGELOG.md` 顶部加 `## [2.1.0] - 2026-09-29` 段（新增/变更/丢弃/验收四节）。
- 验收标准：
  1. 移植脚本全部 `node --check` → 均 exit 0（↗F–↗I）。
  2. `node --test tests/派发闸.test.mjs tests/内审.test.mjs` → 全绿（dsh 线实测通过，本机应同；↗F/↗G）。
  3. `node --test tests/*.test.mjs` → 基线 17 例（↗A）全绿 + 新增全绿，0 fail。
  4. 去 dsh 化自查：
     - `grep -rn "dsh" skills/ctbz/SKILL.md` 命中为 0 或全为溯源句；
     - **`grep -rn "反审\.mjs" skills/ctbz/` 零命中**（↗R：丢弃件不得留引用；`派发前必跑` 节已改为「反审一律走 反审直连.mjs」）；
     - `test ! -f skills/ctbz/scripts/反审.mjs && test ! -f tests/dsh-regression.test.mjs` → exit 0。
- 风险：`派发闸.test.mjs` 与 `内审.test.mjs` 内嵌夹具可能引用 dsh 专有路径（如 `~/.dsh`），跑测试时若红则同步改夹具路径。
- 完成标准：四脚本 + 三 reference + 三测试就位，测试全绿，SKILL.md 九节增补完毕。

### T2 看板多图移植

- write-set：`skills/ctbz/dashboard/graph-math.js`（新建）、`skills/ctbz/dashboard/app.js`、`skills/ctbz/dashboard/index.html`、`skills/ctbz/dashboard/style.css`、`tests/看板视图.test.mjs`（新建）、`docs/演示/进度可视化演示/`（新建，demo.mjs + README.md）。
- 具体改动：
  1. `graph-math.js` 与 `tests/看板视图.test.mjs` 从 dsh 仓**逐字节复制**。
  2. `app.js`/`index.html`/`style.css`：**已实测三文件差异全部为多图相关**（↗P：app.js 恰 8 hunk、index.html 1 行、style.css 2 行），故可**整文件复制**，无需人工 hunk 合并；复制后须跑 `diff` 复核与取证 §5 清单一致。
     **策略唯一化 + 已执行**：以 ↗P 实测（8 hunk 全为多图，清单逐条见取证 §5）为准**直接整文件复制**；本版已复制并复核 `diff | grep -cE "^[0-9]"` = 8（与取证 §5 一致）。
  3. `docs/演示/进度可视化演示/` 整目录复制（demo.mjs/README.md），运行生成 `.ctbz-record`。
- 验收标准：
  1. `node --check skills/ctbz/dashboard/graph-math.js` → exit 0；`node --test tests/看板视图.test.mjs` → 全绿（↗K）。
  2. 合并后 `git diff` 审查：app.js 变更只含多图段（人工核对变更 hunk 清单）。
  3. `node docs/演示/进度可视化演示/demo.mjs` 连跑两次 → 均 exit 0（幂等）；`dashboard show` 输出 9 节点 / 2 轮 / 1 待决（↗O 同源 demo 数据）。
  4. 起 serve 后四视图切换成功（浏览器实测或 curl 静态资源 200）。
- 风险：若 dsh 仓在 00e1951 之后又有改动（本版冻结点已定，不存在），则需重跑 diff；当前已实测 8 hunk 全为多图，风险低。
- 完成标准：多图可用、测试全绿、演示可跑。

### T3 发布收尾（保守序列：先只读核对，再分步执行）

- 原则（吸收 r2 两路阻塞意见）：**不可逆操作前先 dry-run 与备份**；**不直接推 main**，先推分支供确认。
- 步骤：
  1. 闸门链：L1（四路双轮）→ L2（T1/T2）→ L3 → 产物清单 l4；任一不过即停。
  2. 测试与残留扫描：`node --test tests/*.test.mjs` 全绿；`grep -rn "反审\.mjs" skills/ctbz/` 零命中；`test ! -f skills/ctbz/scripts/反审.mjs` 与 `test ! -f tests/dsh-regression.test.mjs`。
  3. 反审直连自检：`node skills/ctbz/scripts/反审直连.mjs --dry-run` → exit 0。
  4. 部署（含备份）：`rsync -a ~/.agents/skills/ctbz/ ~/Documents/.ctbz/备份/ctbz-before-2.1.0-$(date +%Y%m%d-%H%M)/` → `node skills/ctbz/scripts/部署.js` → 失败则 `rsync` 回滚。
  5. 远程只读核对：`gh api repos/fml8023yd/ctbz/releases --jq '.[] | "\(.id) \(.tag_name)"'` 列出 dsh 线已占 tag 的 release id 映射（**先核对，不删**）。
  6. **先清占用、后打 tag**（腾讯 r2 阻塞修正：顺序不可倒置）：按 release id 逐个删 dsh 线已占的 Release（先 Release 后 tag），**确认远程 `git ls-remote --tags origin v2.1.0` 为空**；每步核对返回；本地 tag 保留至 push 成功。
  7. 推分支（不碰 main）：`git push origin ctbz-2.1:refs/heads/ctbz-2.1` → 报告用户确认后再决定是否合并到 main。
  8. 打 tag v2.1.0 并推（**在步骤 6 确认远程无占用之后**）：`git tag v2.1.0 && git push origin v2.1.0`。
  9. Release + 附件：`tar -czf ctbz-pack-v2.1.0-<日期>.tar.gz skills CHANGELOG.md docs`（**白名单仅三顶层项**，与既有发布链一致）→ 阿里云中转。**确认门禁**：步骤 6/7/8 每步执行前向用户报告实际命令与预期影响，得到确认才继续。
  10. 若任一步失败即停并报告；回滚见文末。
- 授权（用户已确认）：迁移 dsh 线已占 tag（↗T）；覆盖部署（旧版备份）。
- 回滚：部署有备份目录可整体还原；tag/Release 删除前先导出 `gh api` 元数据留档；本地 tag 与 bundle 均在。

## 反审重点（供席位）

1. 「不改逻辑只改措辞」的移植策略是否可行——`references/派发.md` 整节重写是否引入契约断裂（派发闸只校验回执字段与目录，不读 references，风险应可控）。
2. 本仓 app.js（2.0.3）与 dsh 版差异可能超出「多图」范围，hunk 级合并的核对清单是否足够。
3. 丢弃 `反审.mjs` 后，SKILL.md 中「反审一律走 pick-profile 取样 → 反审.mjs 生成骨架 → workflow.agent() 执行」的表述需同步改写为「走反审直连执行」，是否漏改其他引用点。
4. 【新鲜 Agent 测试】新 Agent 拿本计划能否不问就开工：所有移植均为「从指定仓指定 HEAD 复制指定文件」，无创作环节。

## 构建期六问

| 问 | 答 |
|---|---|
| 自指 | 本计划自身跑 l1 闸；产物跑 l4 |
| 反例 | 若移植后 `node --test tests/派发闸.test.mjs` 红，即证明"逐字节复制 + 措辞替换"策略失败 → `skills/ctbz/SKILL.md:59` |
| 冲突 | 不动 main 既有原生脚本（↗D/↗E）；新增文件均为 dsh 线已有且测试通过者 → `skills/ctbz/scripts/initialize:1` |
| 覆盖 | 待移植清单 13 项已在取证 §2 逐行清点 ↗F 至 ↗L；调用点=write-set 列出的全部路径 |
| 一致 | 席位表在派发闸/反审直连/反审协议处一致（↗F/↗H/↗J），移植后复核 |
| 真实 | 行号冻结于 main `d24c2f5` 与 dsh `00e1951`，冻结后重跑 l1 核对 → `skills/ctbz/SKILL.md:193` |

## 自疑（设计阶段）

1. 假设：main 原生机件能直接被 dsh 线的机制复用（例如 `pick-profile` 与 `派发闸` 无冲突） → 证伪实验：`node --test tests/*.test.mjs` 全量跑（含移植件与原 17 例） → 结果：待实施后跑。
2. 假设：反审直连的凭据读取（`~/.dsh/.credentials.yaml`）在 ZCode 线仍可用 → 证伪实验：`node skills/ctbz/scripts/反审直连.mjs --dry-run` → 结果：待实施后跑（本机该文件存在，本会话已实测全程反审通过）。
3. 假设：app.js 的 hunk 合并不会带入 dsh 专有改动 → 证伪实验：合并后 `git diff --stat` 与 hunk 清单人工核对 → 结果：待实施后跑。
4. 假设：删 `反审.mjs` 后无别处引用 → 证伪实验：`grep -rn "反审.mjs" skills/ctbz/` → 结果：待实施后跑。

## 行动账

| # | 动作 | 依据 | 取舍 | 证伪 |
|---|---|---|---|---|
| A1 | 从 main 建 ctbz-2.1 分支施工，不直接改 main | `skills/ctbz/SKILL.md:394`（## 版本权威（1.6.0 起生效）） | 否掉直改 main（施工中不可随时回退） | git branch --show-current 得 ctbz-2.1（exit 0） |
| A2 | 移植用「逐字节复制 + 措辞替换」，不重写 | 「dsh 线机制已经 L1 反审与全量测试验证」 | 否掉重写（重写引入新缺陷面、需重新全量验证） | node --test tests/派发闸.test.mjs 得 pass 46 fail 0 |
| A3 | 丢弃 dsh 专有的 `反审.mjs`（workflow 骨架生成器） | 「派发闸为宿主无关闸门，可直接使用」 | 否掉改造 `反审.mjs`（其产物是 dsh workflow 脚本，ZCode 无此宿主接口） | grep -rn 反审.mjs skills/ctbz/ 得 exit 1（零命中） |
| A4 | 版本号用 2.1.0（迁移 dsh 线已占 tag 让位，↗T） | 「迁移全部 6 个 dsh tag」 | 否掉 2.4.0（与 dsh 线号段混淆）与 3.0.0（非删条款级变更） | git tag -l v2.1.0 得非空输出（exit 0） |
| A5 | 看板多图以实测 hunk 清单为准：一致则整文件复制 | 「两版 app.js 差异实测全部为多图 hunk」 | 否掉无条件整文件复制（须先重跑 diff 与 ↗P 一致）；实测全为多图故直接复制 | diff 重跑得 exit 0 且 hunk 数与取证 §5 一致 |
