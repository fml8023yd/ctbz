# ctbz-dsh 与 main 差异清单

- 分支：`ctbz-dsh`（worktree `/Users/maolong/Betty/草台班子/ctbz-dsh`）
- 对照基线：`main`（commit `3361bb0`，HEAD 与 main 同 commit，差异全部在工作区未提交改动）
- 生成方式：`git diff --stat` / `git diff --name-status main` / `git status --short` 实测（见文末「自验」）
- 本文件只描述差异，迁移操作见 `迁移说明.md`。

---

## 1. 分类总览

> 口径：`M`=改写（相对 main 有改动）`D`=删除　`??`=新增（main 无此文件）。`测试回归件` 属 T9 落盘成果，非本任务写集，但计入分支总差异。**行数口径统一为 `git diff --numstat` 的总变更行数（新增+删除，非净变更）**，各文件实测见 §4[E]。

| 类别 | 文件 | 状态 | 一句话理由 |
|---|---|---|---|
| 退役件（删除） | `skills/ctbz/assets/team-config.schema.json` | D | ZCode agent-team JSON Schema（`$id: zcode.local`），随注册链退役删去 | -0/+169 |
| 退役件（删除） | `skills/ctbz/scripts/lib/model-ref.mjs` | D | ZCode `custom:provider:model` 编码归一化，dsh 改用 M1–M5 代号 | -26/+0 |
| 退役件（存根） | `skills/ctbz/scripts/initialize` | M | 入口保留，执行即报「dsh 版不支持 ZCode profile 注册链」(`initialize:4`) | -153/+7 |
| 退役件（存根） | `skills/ctbz/scripts/doctor` | M | 去 ZCode 激活/fingerprint 链，大幅瘦身（总变更 562：-555/+7） | -555/+7 |
| 退役件（存根） | `skills/ctbz/scripts/render-agents` | M | 去 profile 渲染，大幅瘦身（总变更 481：-474/+7） | -474/+7 |
| 退役件（存根） | `skills/ctbz/scripts/discover-config` | M | 去 `~/.zcode` 凭据发现，仅留显式传参入口（总变更 404：-397/+7） | -397/+7 |
| 退役件（存根） | `skills/ctbz/scripts/validate-team` | M | 去 ZCode 团队校验，缩为 8 行报错存根（总变更 160：-153/+7） | -153/+7 |
| 退役件（存根） | `skills/ctbz/scripts/lib/team-config.mjs` | M | 去 ZCode team schema 校验，仅留 fingerprint 导出（总变更 719：-706/+13） | -706/+13 |
| 退役件（存根） | `skills/ctbz/scripts/lib/初始化.mjs` | M | 去 ZCode 初始化逻辑（总变更 68：-57/+11），仅保留兼容壳 | -57/+11 |
| 退役件（存根） | `skills/ctbz/scripts/lib/本机配置.mjs` | M | 去 ZCode 规则/路由/原子写，保留 `read`/`safe`（总变更 76：-57/+19） | -57/+19 |
| 改写件 | `skills/ctbz/SKILL.md` | M | 删 ZCode 专属段、加分支标识行、写 dsh 派发层；`version: 2.0.5` | -36/+37 |
| 改写件 | `skills/ctbz/角色清单.json` | M | 角色规格=`persona`+`toolFilter`+`agentOptions.model`（代号）；`version: 3.0.0-dsh` | -60/+34 |
| 改写件 | `skills/ctbz/scripts/pick-profile` | M | 选型器改写：profile 短名 → `provider`/`model`，输出 workflow 可消费 | -269/+167 |
| 改写件 | `skills/ctbz/scripts/发布检查.js` | M | 第③步由 `initialize status` 改为 `status --smoke`（dsh 版冒烟） | -6/+7 |
| 改写件 | `skills/ctbz/scripts/status` | M | 末段新增 `--smoke` 冒烟分支，供发布检查第③步调用 | -0/+8 |
| 改写件 | `skills/ctbz/cost-rules.json` | M | 成本规则改写：profile 短名 → M1–M5 模型库+取样；`version: 4.0.0-dsh` | -184/+73 |
| 改写件 | `skills/ctbz/dependencies.lock.json` | M | 重算指纹，移除已删 `team-config.schema.json` 条目 | -29/+37 |
| 改写件 | `skills/ctbz/references/configuration.md` | M | 路径契约改 `<ws>/.ctbz-record/`；`--config/--agents/--output` 去默认值 | -27/+43 |
| 改写件 | `skills/ctbz/references/初始化.md` | M | 标注 ZCode 激活流程「已退役」，仅保留存量结构说明 | -5/+28 |
| 改写件 | `skills/ctbz/references/dashboard-workflow.md` | M | 去「ZCode 父会话」措辞，补 `--workspace` 显式约定 | -2/+4 |
| 改写件 | `skills/ctbz/references/项目看板.md` | M | 去 ZCode 措辞，补运行态落点 `<ws>/.ctbz-record/` | -2/+4 |
| 改写件 | `skills/ctbz/scripts/lib/paths.mjs` | M | `DEFAULT_CONFIG`/`DEFAULT_AGENTS` 置 `null`；新增 `.ctbz-record` 常量 | -8/+36 |
| 改写件 | `skills/ctbz/scripts/模型健康.js` | M | 账本改 `provider/model` 复合键 + `0600` 权限（T5） | -28/+64 |
| 改写件 | `skills/ctbz/scripts/team-state` | M | 新增 `migrate-workspace` 存量迁移（T6） | -1/+123 |
| 新增件 | `skills/ctbz/references/派发.md` | ?? | 派发层字段契约 + 模型代号表（T3） | 未提交新增，无 numstat |
| 新增件 | `skills/ctbz/references/反审协议.md` | ?? | 三层反审协议与裁决表（T7） | 未提交新增，无 numstat |
| 新增件 | `skills/ctbz/scripts/preflight.mjs` | ?? | 预检探活与健康账本（T5） | 未提交新增，无 numstat |
| 新增件 | `skills/ctbz/scripts/反审.mjs` | ?? | 反审骨架生成器（T7） | 未提交新增，无 numstat |
| 新增件 | `docs/ctbz-dsh-实施计划-20260921.md` | ?? | 本分支实施计划（T0 前置落盘） | 未提交新增，无 numstat |
| 测试回归件 | `tests/execution-chain.test.mjs` | M | 去 ZCode 耦合断言（T9） | -55/+34 |
| 测试回归件 | `tests/governance.test.mjs` | M | 去 `initialize` 依赖（T9） | -140/+21 |
| 测试回归件 | `tests/workflow.test.mjs` | M | 改旧文案断言（T9） | -0/+10 |
| 测试回归件 | `tests/README.md` | ?? | 测试运行说明（T9） | 未提交新增，无 numstat |
| 测试回归件 | `tests/execution-chain-acceptance.md` | M | 2026-09-21 回修：文件头加「历史存档，非现行测试」标注（-0/+2） | -0/+2 |
| 测试回归件 | `tests/dsh-regression.test.mjs` | ?? | T2/T3/T5 最小回归（T9） | 未提交新增，无 numstat |

删除件清单（仅 2 个文件，确认无脚本再引用被删件——`grep -rn "model-ref\|team-config.schema" skills/ctbz/scripts` 实测**零匹配**（exit 1，2026-09-21 复跑），被删件无任何残留引用）：
```
D  skills/ctbz/assets/team-config.schema.json
D  skills/ctbz/scripts/lib/model-ref.mjs
```

---

## 2. main 保持不动、dsh 继续沿用的部分

以下在 `ctbz-dsh` 工作区与 `main` **完全一致**（已 `git diff main` 验证为空）：

- **治理内核**（在 `SKILL.md` 内，仅改宿主无关措辞，核心未动）：判型三问、四扇门、反审分级、验收表（编号×状态×证据）、功能台账、收尾自记、知识库读写协议。可核对锚点：`SKILL.md:147`（四扇门）、`:146`（判型/三问口语判定）、`:148`（委托与代行）、`:81`（收尾自记）、`:87`（知识库构建）。
- **方法引擎**：`skills/ctbz/scripts/methods/`、`skills/ctbz/scripts/lib/methods.mjs`（verifyBundle / fingerprint / roleMethods）——未改。
- **项目看板 / dashboard 引擎**：`skills/ctbz/scripts/dashboard/`——引擎未改，仅 `references/项目看板.md` 文案去 ZCode 措辞。
- **知识库**：`skills/ctbz/scripts/知识库.js`——未改。
- **发布链**：`skills/ctbz/scripts/发版.sh`——未改（`发布检查.js` 仅第③步改）。
- **worktree 约定**：`skills/ctbz/scripts/worktree/`——未改。
- **部署脚本**：`skills/ctbz/scripts/部署.js`——**未改**（见 §3 遗留与风险）。

---

## 3. 两处关键结论的可核对引用

- **结论 A：安装副本分支身份由 `SKILL.md` 首行标识 + version 决定。**
  引用：`skills/ctbz/SKILL.md:3`（`version: 2.0.5`）与 `skills/ctbz/SKILL.md:7`（`> 宿主：DeepSeek Harness（dsh）｜分支：ctbz-dsh`）。比对 main：同文件 `version: 2.0.3` 且无第 7 行分支标识。
- **结论 B：ZCode 注册链已退役，发布检查第③步切到 dsh 版 `status --smoke`。**
  引用：`skills/ctbz/scripts/发布检查.js` 的 `step("③ dsh 版 status 冒烟（不依赖 ZCode 发现链）", …)` 调用 `status --smoke`；`skills/ctbz/scripts/status` 末段新增 `--smoke` 分支返回 `{"ok":true,…}`；退役入口报错文案见 `skills/ctbz/scripts/initialize:4`。

---

## 4. 自验（真实输出，非编造）

```text
##### [A] git status --short #####
 M skills/ctbz/SKILL.md
 D skills/ctbz/assets/team-config.schema.json
 M skills/ctbz/cost-rules.json
 M skills/ctbz/dependencies.lock.json
 M skills/ctbz/references/configuration.md
 M skills/ctbz/references/dashboard-workflow.md
 M "skills/ctbz/references/初始化.md"
 M "skills/ctbz/references/项目看板.md"
 M skills/ctbz/scripts/discover-config
 M skills/ctbz/scripts/doctor
 M skills/ctbz/scripts/initialize
 D skills/ctbz/scripts/lib/model-ref.mjs
 M skills/ctbz/scripts/lib/paths.mjs
 M skills/ctbz/scripts/lib/team-config.mjs
 M "skills/ctbz/scripts/lib/初始化.mjs"
 M "skills/ctbz/scripts/lib/本机配置.mjs"
 M skills/ctbz/scripts/pick-profile
 M skills/ctbz/scripts/render-agents
 M skills/ctbz/scripts/status
 M skills/ctbz/scripts/team-state
 M skills/ctbz/scripts/validate-team
 M "skills/ctbz/scripts/发布检查.js"
 M "skills/ctbz/scripts/模型健康.js"
 M "skills/ctbz/角色清单.json"
 M tests/execution-chain.test.mjs
 M tests/governance.test.mjs
 M tests/workflow.test.mjs
?? "docs/ctbz-dsh-实施计划-20260921.md"
?? "skills/ctbz/references/派发.md"
?? "skills/ctbz/references/反审协议.md"
?? skills/ctbz/scripts/preflight.mjs
?? "skills/ctbz/scripts/反审.mjs"
?? tests/README.md
?? tests/dsh-regression.test.mjs

##### [B] git diff --name-status main | grep ^D  (退役删除件) #####
D	skills/ctbz/assets/team-config.schema.json
D	skills/ctbz/scripts/lib/model-ref.mjs

##### [C] git diff main -- "skills/ctbz/scripts/部署.js"  (应为空) #####
（空输出 = 部署.js 相对 main 未改动）

##### [D] git diff main -- methods/ 知识库.js 发版.sh worktree  (应为空) #####
（空输出 = 治理内核/知识库/发布链/约定全部沿用 main）
```

> 注：差异全部为**工作区未提交改动**（HEAD 与 main 同 commit `3361bb0`）。本任务（T8）只新建本文与 `迁移说明.md`，不回改任何上述文件。

> 补注（2026-09-21 回修）：结论 B 所指 `skills/ctbz/scripts/status` 改动已补入 §1 分类总览表（M，-0/+8，末段新增 `--smoke` 分支）；同批回修使 `tests/execution-chain-acceptance.md` 成为新 M 件（文件头历史存档标注），一并入表。除此外本次回修只改本文与 `tests/README.md`，不触碰代码。

##### [E] git diff --numstat（§1 表「行数」列唯一数据源，总变更=新增+删除） #####

```text
37	36	skills/ctbz/SKILL.md
0	169	skills/ctbz/assets/team-config.schema.json
73	184	skills/ctbz/cost-rules.json
37	29	skills/ctbz/dependencies.lock.json
43	27	skills/ctbz/references/configuration.md
4	2	skills/ctbz/references/dashboard-workflow.md
28	5	skills/ctbz/references/初始化.md
4	2	skills/ctbz/references/项目看板.md
7	397	skills/ctbz/scripts/discover-config
7	555	skills/ctbz/scripts/doctor
7	153	skills/ctbz/scripts/initialize
0	26	skills/ctbz/scripts/lib/model-ref.mjs
36	8	skills/ctbz/scripts/lib/paths.mjs
13	706	skills/ctbz/scripts/lib/team-config.mjs
11	57	skills/ctbz/scripts/lib/初始化.mjs
19	57	skills/ctbz/scripts/lib/本机配置.mjs
167	269	skills/ctbz/scripts/pick-profile
7	474	skills/ctbz/scripts/render-agents
8	0	skills/ctbz/scripts/status
123	1	skills/ctbz/scripts/team-state
7	153	skills/ctbz/scripts/validate-team
7	6	skills/ctbz/scripts/发布检查.js
64	28	skills/ctbz/scripts/模型健康.js
34	60	skills/ctbz/角色清单.json
34	55	tests/execution-chain.test.mjs
2	0	tests/execution-chain-acceptance.md
21	140	tests/governance.test.mjs
10	0	tests/workflow.test.mjs
```

（`??` 新增件未提交、不在 numstat 内，故表中行数列标「未提交新增，无 numstat」。）
