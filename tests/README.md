# ctbz-dsh 测试与回归（T9）

## 运行命令

仓库无 `package.json`，必须用带引号的 glob：

```bash
/usr/local/bin/node --test 'tests/*.test.mjs'
```

预期全部绿（pass，无 fail）。各文件互相隔离（每个用例用 `fs.mkdtempSync` 建临时夹具），不触碰全局 `~/.agents/skills`、`~/.zcode`、`~/.dsh`，不发网络请求。

## 测试文件清单

| 文件 | 内容 |
|---|---|
| `governance.test.mjs` | ZCode 注册链存根退役断言 + 项目看板 `dashboard work.create` |
| `execution-chain.test.mjs` | 退役件移除断言 + `初始化.mjs`/`本机配置.mjs` 退役导出断言 + `status --smoke` |
| `workflow.test.mjs` | 九步预设/设计委派/上游源与许可证 + dsh 版 SKILL.md 锚点 |
| `settings.test.mjs` | settings 继承与中文路径 CLI |
| `dsh-regression.test.mjs` | T3 选型器 / T5 账本解析 / T7 骨架生成器最小回归 |

## 被改/被删用例清单与理由

### governance.test.mjs（原 5 例 → 现 3 例）

| 原用例 | 处置 | 理由 |
|---|---|---|
| `prepare carries activated sessions across generations...` | 删除 | 跑 `initialize prepare/activate/select`，ZCode 注册链已退役（T4 存根）。dsh 无 profile 生成/换代概念。 |
| `adopt-run crosses generations...` | 删除 | 夹具依赖 `initialize prepare` 造出两代 state；dsh 无 prepare 换代，跨代接管失去宿主语义。 |
| `prepare refuses unselected full-candidate catalogs...` | 删除 | 同上，跑 prepare/select 退役链。 |
| `activate accepts role-covered partial loads...` | 删除 | 同上，跑 prepare/activate/select 退役链。 |
| `dashboard work.create registers independent work groups...` | 保留 | 项目看板是 dsh 版仍保留的治理能力，不依赖注册链。 |

新增 2 例：`ZCode 注册链 CLI 已退役`（initialize/doctor/render-agents/discover-config/validate-team 返回退役文案且 exit 非 0）、`initialize 旧子命令同样走退役文案`（prepare/activate/select/status）。

### execution-chain.test.mjs（原 4 例 → 现 5 例，全部重写）

原文件 `import {initialize, selectProfile} from '.../初始化.mjs'` 与 `import {route, defaultRules} from '.../本机配置.mjs'`——这两个模块已按 T4 存根化（导出退役抛错函数），原用例的"离线生成 profile / 路由 / 漂移"语义在 dsh 下不存在。

改写为：① 断言已删除件 `lib/model-ref.mjs` 不存在；② 断言 `初始化.mjs` 的 `initialize/selectProfile/highest` 抛退役文案；③ 断言 `本机配置.mjs` 的 `route/defaultRules/atomic` 抛退役文案、而保留函数 `safe/read` 仍可用；④ 断言 `initialize` CLI 存根 exit 非 0；⑤ 断言 `status --smoke` 通过。

### workflow.test.mjs（新增 1 例）

原 5 例断言 `references/recommended-workflow.md` 与 `methods/contract.md` 的文案（这两份文件不在本分支任何写集内，仍含 `initialize select` 等 ZCode 时代措辞），断言仍成立，予以保留。新增 1 例：dsh 版 SKILL.md 含分支标识行 `宿主：DeepSeek Harness（dsh）｜分支：ctbz-dsh`、`name: ctbz`、治理内核锚点（判型/三问/四扇/反审规模分级/验收表/台账/收尾自记），且 `.zcode` 零引用。

## 新增最小回归

- **T3 选型器**（`scripts/pick-profile`）：讨论类 `--kind discussion` 覆盖 DeepSeek/智谱/腾讯/月之暗面 4 阵营；开发类 `--kind dev` 不含 M5（月之暗面缺席）；反审席位 `--role reviewer` 时 DeepSeek 席位换 `deepseek-v4-pro`。用临时 `{}` 账本与 `--now` 定时刻，无网络、无真实账本读写。
- **T5 账本解析**（`scripts/模型健康.js`）：样例限额错误文本 `[1310][...限额将在 2026-09-25 18:00:00 重置...]` 解析出 `2026-09-25T10:00:00.000Z`（北京时间→UTC）；`retry after 3600s` 解析为未来时刻；账本文件 0600；`check` 在冷却中 exit 1。全程 `HOME` 指向临时目录，不发网络请求、不触碰真实账本。
- **T7 骨架生成器**（`scripts/反审.mjs`）：`--dry-run` 输出可被 `new Function` 解析的 workflow 脚本体，含四路 `agent(prompt,{provider,model})`、DeepSeek 席位 `deepseek-v4-pro`、每路裁决独立落盘的 `RECORD_DIR`。

## 无测试引用被退役件（grep 证明）

见 T9 自验第 4 步：`tests/` 下无 `.test.mjs` 引用 `model-ref` / `initialize prepare` / `doctor --activate` / `render-agents` 等退役件。历史记录 `execution-chain-acceptance.md` 为 2026-09-10 ZCode 时代的验收存档，非测试、不入测试运行器，保留作溯源。

> 历史存档注记（2026-09-21 补）：`tests/execution-chain-acceptance.md` 为 2026-09-10 ZCode 时代真实执行链验收存档，描述的注册链/激活流程已在 dsh 分支退役，**仅作历史溯源，非现行测试**；现行执行链断言以 `tests/execution-chain.test.mjs` 为准。

## 已修复缺陷（曾列「已知缺陷」，2026-09-21 核验为已修）

- ~~**T3 `pick-profile` 在账本文件缺失时崩溃**~~（已修复，属 T3 写集）：原 `loadLedger` 对"文件不存在"返回普通对象 `{}`，后续 `ledger.get(...)` 抛 `TypeError`。现 `loadLedger` 的 `readFileSync` `catch` 分支早返回 `new Map()`（`pick-profile:63-67`），坏 JSON 同样返回空 Map。**验证方式**：`node skills/ctbz/scripts/pick-profile --kind discussion --ledger <不存在路径> --now <ISO时刻>` 实测 exit 0、正常输出 4 阵营 decision_table 且 `warnings: []`，符合 `references/派发.md` §5「账本缺失/坏 JSON 按无冷却处理」规格；`--test` 全套 21 pass 0 fail 未回归。
