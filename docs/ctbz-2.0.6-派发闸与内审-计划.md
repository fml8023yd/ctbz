# ctbz 2.0.6 派发闸与内审协议 · 实施计划

review_scale: 重
review_level: l1
计划正文版本: r5（2026-09-22，L1 四轮反审后定稿）

| 键 | 值 |
|---|---|
| 源码根（唯一源） | `/Users/maolong/Betty/草台班子/ctbz-dsh` |
| 工作区 ws | `/Users/maolong/Betty/草台班子/ctbz-dsh` |
| 技能根 `<skill>` | `/Users/maolong/Betty/草台班子/ctbz-dsh/skills/ctbz` |
| 部署副本 | `~/.agents/skills/ctbz`（只由 `scripts/部署.js` 写入） |
| 版本 | `2.0.5` → `2.0.6` |
| 缺陷单（需求来源） | `/Users/maolong/Betty/建模/ctbz缺陷单_调用了ctbz却没做反审.md` |
| 定级依据 | 改「主文 + 3 脚本 + 2 references + 全局指令」，属**重** |

### 0 修订记录

| 轮次 | 回执 | 处置 |
|---|---|---|
| r1（sha `6c03bf5f…`） | `.ctbz-record/反审/ctbz-2.0.6-派发闸与内审-计划/{deepseek,zhipu,tencent,moonshot}.json` | 4/4 席到位，40 条裁决，13 条阻塞。r2 逐条处置见下表 |

| # | r1 阻塞项 | 出处 | r2 处置 |
|---|---|---|---|
| C1 | §3.7 模板预填 `L2 流程缺失` 使「L1 忘了→不合格」不可达 | zhipu/tencent 阻塞 | §4.7 模板 `根因:` 留空；判定优先级 `含L3 > 含L2 > 纯L1`；V10 三态用例根因原文写进 §7 |
| C2 | V10 第三态「默认路径更省力」不含 L1/L2/L3 → 按规则判不合格 | tencent 阻塞 | §4.7 增 L3 判据：含 `L3` 或匹配 `/默认路径\|更省力\|无闸门\|不做比做省力/` |
| C3 | 骨架 `RECORD_DIR` 相对路径 vs §4.4 绝对落点 → 闸门结构性扫不到回执 | tencent 阻塞 | §4.6 硬要求 `--workspace` 注入骨架使 `RECORD_DIR` 为绝对路径；T2 验收加断言 |
| C4 | `.gitignore` 排在 T5，T1–T4 并行期已落回执 → 污染仓库 | tencent 阻塞 | 新增 **T0**（秒级前置，先补 `.gitignore`），T5 不再承担 |
| C5 | T5 未列 commit 范围 + 计划文件 untracked → `部署.js:44` 必拒 | tencent 阻塞 | §5 T5 步骤④显式列 `git add` 范围（含 `docs/`） |
| C6 | §3.5 无精确必填字段清单与类型 | deepseek 阻塞 | §4.5「必填字段清单」逐字段给类型/取值域/校验动作 |
| C7 | 内审「编号」生成规则缺失；文件名 / `pending.json.file` / 模板首行三处不一致 | deepseek 阻塞 + zhipu 阻塞 + tencent 阻塞 | §4.7 定义 `编号 = YYYY-MM-DD-<主题>`；三者逐字相等 |
| C8 | 「同类」判定口径未定义 → V12 不可判 | zhipu 阻塞 + tencent 阻塞 | §4.7：`<dir>` 内文件名「日期后主题段」去空白归一化后全等 |
| C9 | 计划自称「本文件自足」但 T3 依赖外部缺陷单原文 | deepseek 阻塞 + moonshot 阻塞 | §9 新增真实附录，M3/M5/M6/M7/M8 与内审协议全文逐字内联 |
| C10 | `--json` 无语义定义；失败路径无结构化输出 | deepseek 阻塞 + zhipu/tencent 非阻塞 | §4.5 `--json` 定义：成功/失败均单行 JSON |
| C11 | F1/F8 与实测不符 | moonshot 阻塞 | §2 事实改写 |
| C12 | V13/V14 验收缺口 | tencent 阻塞 | §7 新增 V13（`SKILL.md:77` 逐字未改）、V14（`.ctbz-record` 已 gitignore） |
| C13 | `--host-model` 覆盖为席位模型时同模型自审漏检 | deepseek 非阻塞（安全） | §4.5 增显式比较 + 禁止 `--host-model` 取席位模型值 |
| C14 | T1 `--level audit` 验收依赖 T3 产物，并行期无法全绿 | deepseek 非阻塞 + zhipu 非阻塞 | T1 用 `mkdtemp` 自备 stub `内审.mjs`；真实联调挪 T5 |
| C15 | T2 `--gate` 用例软依赖 T1 | zhipu 非阻塞 | T2 用例检测 `派发闸.mjs` 存在性，缺失则 `skip` 并注明 |
| C16 | 重级「8 席」允许复用 `provider/model`，`-r2.json` 区分 | tencent 阻塞 + deepseek 非阻塞 | §4.1/§4.3 明文写出；「6+ 按总回执数解释」写入 §4.1 定论 |
| C17 | 回修后计划 sha 变化，r1 回执 sha 必然不匹配 | tencent（隐含） | §4.5 规则：每阵营取**最高 round** 回执与当前 sha 比对；低轮回执仅 schema 校验 |
| C18 | `init` 的 `--workspace` 缺省会污染任意 cwd | deepseek 非阻塞 | §4.6：非 `--dry-run` 且未显式给 `--workspace` → exit 2 |
| C19 | audit 路径遍历 / 参数注入 / 无超时 / 无上限 | tencent 非阻塞 | §4.5 audit 约束：resolve 前缀白名单、数组参数、`timeout 10s`、≤100 条 |
| C20 | V6/V7 证据依赖会话产物与评审判断，不可重跑 | tencent 非阻塞 + deepseek 非阻塞 | §7 标注「人工核对」，不宣称命令可重跑 |
| C21 | 骨架注释插入锚点「现有 4 行注释之后」与实际 12 行注释不符 | moonshot 非阻塞 | §4.6 改为「文件头注释块末行（`L.push` 第 13 行）之前」 |
| C22 | 失败输出把说明行混进可执行命令 | tencent 非阻塞 | §4.5 定义：可执行命令行以 `node ` 开头且占位符已替换；说明行前缀 `[说明]` |
| C23 | 定级表把「改主文」并入重级属第二处未声明偏离 | tencent 非阻塞 | §4.1 显式声明两处偏离 |
| C24 | T2 新增文件写副作用未纳入向后兼容说明 | deepseek 非阻塞 | §5 T2 约束补一句：落空模板属 M2 有意变更，非兼容回归 |
| C25 | `--camps` 少于定级席位即不过闸，意图未写明 | zhipu 非阻塞 | §4.6 补说明「属预期，非 bug」 |
| C26 | T4 未写测试隔离约定；`~/.dsh/AGENTS.md` 写前备份 | tencent 非阻塞 | §5 T4 约束补 |

### 0.1 L1 第二轮（r2，sha `fb0b1433…`）回执与 r3 处置

| 座席 | 回执 | r1 项复核 | r2 新提 |
|---|---|---|---|
| deepseek | `deepseek-r2.json` | 6 卡点闭合 | 3 |
| zhipu | `zhipu-r2.json` | 阻塞项闭合 | 3 |
| tencent | `tencent-r2.json` | 4 阻塞全闭合 | 8（+1 提示） |
| moonshot | `moonshot-r2.json` | 全部解决，六视角接受 | 0 |

| # | r2 新提 | 出处 | r3 处置 |
|---|---|---|---|
| D1 | §4.7 L3 判据含「无闸门」与 §9.10「无闸门=L2 流程缺失=合格」自相矛盾 | deepseek 阻塞 | §4.7 L3 正则删「无闸门」；§7 V10 增 `L2 无闸门` → 合格用例 |
| D2 | §4.7 同类抽取「首个 `-` 之后」在 `YYYY-MM-DD-主题.md` 上取到 `MM-DD-主题`，恒不命中 | deepseek 阻塞 + zhipu 阻塞 | §4.7 改为「去 `^\d{4}-\d{2}-\d{2}-` 前缀后取主题段」 |
| D3 | §4.6 骨架注释锚点「12 行注释 / 第 13 行 `L.push`」与实测不符 | deepseek 非阻塞 + zhipu 非阻塞 + tencent 非阻塞 | §4.6 锚点改为「`buildSkeleton` 内 `L.push("// 规避 maxResultChars…")`（`反审.mjs:75`）之后、`L.push("")`（`:76`）之前」 |
| D4 | V13 比对基准不存在（缺陷单只引行号无原文） | zhipu 阻塞 | 新增 §9.11 内联 `SKILL.md:77` 原文快照；V13 断言 == §9.11 |
| D5 | `review_receipt` 输出相对串，与 §4.4 绝对落点矛盾，契约消费方无法定位 | tencent 提示 | §4.5 review 块改输出 **绝对** `<ws>/.ctbz-record/反审/<slug>/` |
| D6 | `--out` + `--gate` 分支语义未定（`反审.mjs:125-129` 带 `--out` 即 return） | tencent 提示 | §4.6 定死：落模板与 gate 在 `--out`/非 `--out` 两条路径**都执行**；`--dry-run` 两条都不执行 |
| D7 | `--level l3` 无任何 V 项覆盖 | tencent 提示 | §7 新增 **V15**；§5 T1 验收补 l3 三分支 |
| D8 | 「4 份合格回执」fixture 无样板 | tencent 提示 | 新增 §9.12 fixture 规格；§5 T1 引用 |
| D9 | 同模型比较口径 `provider + "/" + model != --host-model` 两侧结构不同 → 恒真 | tencent 提示 | §4.5 改为「比较 `model` 字段与 `--host-model` 逐字相等 → exit 2」；缺省 `deepseek-flash` 参与比较 |
| D10 | T5 步骤⑦验收表写在 commit/部署之后 → 留脏致回滚重跑被 `部署.js:44` 拒 | tencent 提示 | §5 T5 验收表前移到步骤④之前并纳入 commit |
| D11 | `--task` 取值格式未定 | tencent 提示 | §4.4 定死：`<task>` == §5 任务号字面量（`T0`–`T5`），目录名逐字取该值 |
| D12 | `实现状态` 枚举未在 `check` 校验 → 错误延到 `link` 才暴露 | tencent 非阻塞 | §4.7 `check` 增行：`实现状态 ∈ {已实现,未实现}` |
| D13 | stub 注入机制未定（gate 按固定 `<skill>` 路径找 `内审.mjs` 时 stub 永不命中） | zhipu 非阻塞 | §4.5 定死：`内审.mjs` 按 `派发闸.mjs` **同目录**解析（`import.meta.url`）；T1 夹具复制两脚本 |
| D14 | `--camps` 空串/纯分隔符行为未定义 | zhipu 非阻塞 | §4.6 补：过滤后为空 → 用法错误 exit 2；T2 增一例 |
| D15 | `fix` 数组内命令未明是否同受「占位符已替换」约束 | tencent 非阻塞 | §4.5 把命令格式约束提升为**两种模式通用** |
| D16 | 重复 `init` 时 `checked:true` 是否允许覆盖未定 | tencent 非阻塞 | §4.7 补：已存在且 `pending[].checked === true` → exit 1「已审结，不得覆盖」 |

**协议补丁（回修 → sha 失效的洞）**：见 §4.5「重签复核」。回修必然改计划字节，故 r1/r2 回执 sha 必然与定稿不符 —— 这正是闸门要防的「审旧计划」，但也不能因此卡死回修闭环。定死规则：**每阵营取最高 round 回执与当前 sha 比对；回修后必须跑一轮「重签复核」（round = 上一轮 + 1）**，只逐条核验本轮回修点（其余视角写「本视角无回修点，复核通过」），不重开六视角全量。

### 0.2 r3 之后的裁决记录（避免自指，不写进本文件）

| 轮次 | 触发 | 回执 |
|---|---|---|
| r3 | D1–D16 回修后重签 | `<slug>/{camp}-r3.json`：4/4 到位；zhipu/tencent 各提 1 条硬缺陷（D9 残端恒真比较、`round ∈ {"1","2"}` 与重签协议互斥），deepseek/moonshot 通过 |
| r4 | 上述两处回修后定稿重签 | `<slug>/{camp}-r4.json`：4/4 签字通过；tencent 另提 3 处非阻塞元数据滞后 |
| r5 | 元数据滞后（版本标、§6 死 sha、§7 标题漏 V15）修正后定稿签字 | `<slug>/{camp}-r5.json` |

本文件不登记自身最终 sha（会自指失效）；定稿 sha 由 `派发闸.mjs` 实时计算并输出 review 块，人工轮留痕 `<slug>/_gate.md`。



---

## 1 需求诊断

| 项 | 内容 |
|---|---|
| 原始表述 | 「解决一下这个问题」（指向缺陷单：调用了 ctbz 却没做反审） |
| 真实问题 | 反审/内审是「靠自律记得做」的环节，无闸门、无产物契约、无入口可见性 → 快节奏下必然被跳过 |
| 目标结果 | 把「忘记审」变成「发不出去」：派发前有可执行闸门，闸门校验回执产物；回执缺失 / 同模型自审 / 旧计划复用一律拒发 |
| 非目标 | 不改模型阵营表与 `pick-profile` 取样守恒顺序；不下调 `SKILL.md:77` 硬门原文；不引第三方依赖；不手改 `~/.agents/skills/ctbz` |
| 成功证据 | V1–V15（§7）；其中 V2–V5、V9–V15 为可重跑命令 |
| 未知事实 | ①T1 与 T3 的真实联调只能在 T5 做（并行期用 stub）②「重」级 6+ 的解释（见 §4.1） |
| 替代解释 | 也可能只是「主进程没读 references」——但缺陷单已给出 `SKILL.md:267`/`派发.md:17` 入口不可见证据，且「不审也能发」这一默认路径客观存在，故按机制缺失处理 |
| 意图置信度 | 高 |
| 反事实 | 不做：缺陷必然复发（同类第 2 次即判缺陷失效）。更小改动：只加 prose 提醒 → 不成立（缺陷单 §三：新增 prose 只作工具输出说明，不承担约束） |

---

## 2 现状事实（本会话实测，r2 勘误后）

| # | 事实 | 证据 |
|---|---|---|
| F1 | 本地 `ctbz-dsh` 在 `d5544ba`（2.0.5），与 `origin/ctbz-dsh` 同点；**跟踪文件**干净，`docs/ctbz-2.0.6-…-计划.md` 为新增 untracked | `git rev-parse HEAD origin/ctbz-dsh` 同值；`git status --porcelain` 仅该计划文件 |
| F2 | `SKILL.md`（296 行）零提及 `反审.mjs` / `派发闸` / `preflight` / `内审` | `grep -n` 四项均无输出 |
| F3 | 既有反审设施齐备：`scripts/反审.mjs`(145 行)、`scripts/preflight.mjs`(341 行)、`scripts/pick-profile`、`references/反审协议.md`(140 行)、`references/派发.md`(118 行) | `ls scripts/ references/` |
| F4 | 4 阵营 5 模型全部探活成功 | `node skills/ctbz/scripts/preflight.mjs --json` → M1–M5 全 `ok`/HTTP 200 |
| F5 | `部署.js` 硬要求：`git -C <源码根> status --short` 为空、安装目录相对部署基线无漂移 | `scripts/部署.js:41-52` |
| F6 | 测试入口 `node --test 'tests/*.test.mjs'`；各用例 `mkdtempSync` 隔离，不碰全局目录、不发网络 | `tests/README.md:1-12` |
| F7 | `ctbz-dsh/.gitignore` 当前只有 `ctbz-pack-*.tar.gz` 一行 | `cat ctbz-dsh/.gitignore` |
| F8 | 源码根下 `.ctbz-record/` **本次反审已建立**（r1 前不存在），内含 r1 四路回执 | `ls -la .ctbz-record/反审/ctbz-2.0.6-派发闸与内审-计划/` |
| F9 | `~/.dsh/AGENTS.md` 56 行：第 7 行为 ZCode 句，`## ctbz 默认加载` 节为 5–9 行，第 16–27/29–56 行为两个镜像标记块 | `read ~/.dsh/AGENTS.md` |
| F10 | `SKILL.md` 关键锚点：`:3` version、`:7` 宿主行、`:62` 主进程服务姿态、`:70` 反审规模分级、`:77` 硬门、`:263` 模型阵营表、`:267` 三层反审首句、`:271` L3 条 | `read skills/ctbz/SKILL.md` |

---

## 3 交付物与依赖

| 文件 | 动作 | 任务 |
|---|---|---|
| `ctbz-dsh/.gitignore` | 追加 `.ctbz-record/` | T0 |
| `skills/ctbz/scripts/派发闸.mjs` | 新增 | T1 |
| `tests/派发闸.test.mjs` | 新增 | T1 |
| `skills/ctbz/scripts/反审.mjs` | 增量修改 | T2 |
| `tests/dsh-regression.test.mjs` | 仅在既有断言不变前提下追加 | T2 |
| `skills/ctbz/scripts/内审.mjs` | 新增 | T3 |
| `skills/ctbz/references/内审协议.md` | 新增 | T3 |
| `tests/内审.test.mjs` | 新增 | T3 |
| `skills/ctbz/SKILL.md` | 修改（2 处插入 + 1 处替换 + 版本号） | T4 |
| `skills/ctbz/references/派发.md` | 追加 §1.1 | T4 |
| `CHANGELOG.md` | 追加 `## [2.0.6]` | T4 |
| `~/.dsh/AGENTS.md` | 修改（2 处插入，镜像块禁改） | T4 |
| `tests/主文锚点.test.mjs` | 新增 | T4 |
| `.ctbz-record/**`、`docs/验收表-2.0.6.md` | 新增 | T5 |

依赖：`T0 → (T1 ∥ T2 ∥ T3 ∥ T4) → T5`。T1–T4 文件集两两不相交。

---

## 4 冻结接口（写者不得改动；改需回主会话）

### 4.1 定级表（替换 `SKILL.md:267` 那句；同时是闸门校验依据）

| 改动面 | 定级 `review_scale` | 席位数（总回执数） | 阵营覆盖 | 附加要求 |
|---|---|---:|---|---|
| 只读/诊断、仅写我方临时目录 | 免审 | 0 | — | 计划正文含非空 `免审依据:` 行 |
| 单文件小改 | 轻 | ≥3 | ≥3 个不同阵营 | — |
| 模块级 | 中 | 4 | 4 阵营齐全 | 六视角齐全 |
| 架构级 / 改公共库 / 改他人文件 / 删除 / 注册模型 / **改主文** | 重 | 8 | 4 阵营齐全 | 每阵营 1 份 `round=2` 回执（双轮）；先审后派、改前备份、回归证据 |

**两处对缺陷单 M4 的显式偏离（已定论）**：
1. **「重 = 6+」按「总回执数」解释**，非互异席位。实测模型库 5 模型 4 阵营，互异 `provider/model` 上限 5（deepseek 1 + zhipu 1 + tencent 2 + moonshot 1），6 互异席位物理不可达。折算 `4 阵营 × 双轮 = 8 份回执`，同时满足 M1「4 阵营回执齐全」与 `SKILL.md:155`「完整计划 ≥4 个 × 双轮」。
2. **「改主文」并入重级行**，缺陷单 M4 重级行未列该项；理由：改主文影响所有后续任务，风险等同改公共库。

### 4.2 回执 schema（L1/L2/L3 通用）

```json
{
  "camp": "deepseek",
  "camp_label": "DeepSeek",
  "provider": "deepseek-official",
  "model": "deepseek-v4-pro",
  "round": "1",
  "plan": "<计划文件绝对路径，与 --plan 逐字相同>",
  "plan_sha256": "<计划文件字节的 sha256 小写 hex>",
  "generated_at": "<ISO8601>",
  "verdict": null,
  "fresh_agent_test": { "conclusion": "<非空>", "blockers": ["<卡点>"] },
  "verdicts": [
    { "view": "需求一致性", "category": "阻塞|非阻塞|可接受",
      "evidence": "<文件:行号 或 可重跑命令>",
      "conclusion": "接受|有条件接受|不接受",
      "disposition": "<非空>" }
  ],
  "summary": "<非空>"
}
```

- `verdict: null` + `verdicts: []` = **空模板**（= 没审），闸门判不合格。
- L2 额外必填：`implementer_camp`、`reviewer_camp`；`camp` 必须 == `reviewer_camp`，且 `implementer_camp != reviewer_camp`。
- L3 额外必填：`checks` = 4 条，`id` ∈ {`集成一致性`,`调用名统一`,`main未污染`,`安装副本分支标识`}，每条含非空 `conclusion` 与 `evidence`。

### 4.3 席位表（唯一来源 `references/派发.md §3`+§4.6 骨架）

| camp | 允许 provider | 允许 model |
|---|---|---|
| `deepseek` | `deepseek-official` | `deepseek-v4-pro` |
| `zhipu` | `workbuddy` | `glm-5.3-flash` |
| `tencent` | `workbuddy` | `hy4-preview-f` / `hy3` |
| `moonshot` | `workbuddy` | `kimi-k2.8-preview` |

主进程模型默认 `deepseek-flash`（`--host-model` 可覆盖，但**禁止取席位表内的值**，否则 exit 2）。回执必须落表内，且回执 `model` 字段与 `--host-model`（缺省 `deepseek-flash`）**逐字比较不得相等**，相等即 exit 2 —— 该比较与席位表独立，二者都要过。

### 4.4 目录与命名

| 层 | 目录 | 文件名 |
|---|---|---|
| L1 | `<ws>/.ctbz-record/反审/<slug>/` | `<camp>.json`（round=1）；`<camp>-r<N>.json`（round=N，N≥2：重签回复核轮 N=3,4,…） |
| L2 | `<ws>/.ctbz-record/反审/任务级/<task>/` | 任意 `*.json`，≥1 份 |
| L3 | `<ws>/.ctbz-record/反审/项目级/<slug>/` | `<camp>.json`，4 份 |
| 内审待办 | `<ws>/.ctbz-record/内审/pending.json` | `{"pending":[{"id":"<编号>","file":"<绝对路径>","subject":"<主题>","checked":false}]}` |

`slug` = 计划文件名去掉末尾 `.md`（保留中文，不转义、不拼音化）。**允许同一 camp 在 round=1/round=2 复用同一 `provider/model`，由文件名 `-r2` 区分。**
`<task>`（L2 目录名）== §5 任务号字面量（`T0`–`T5`），目录名逐字取该值，不去 `T` 前缀、不改大小写。

### 4.5 `scripts/派发闸.mjs` CLI（T1 实现，T2 调用）

```
node <skill>/scripts/派发闸.mjs --plan <计划md绝对路径> --workspace <项目绝对路径>
     [--level l1|l2|l3|audit] [--task <T号>] [--json] [--host-model <模型名>]
```

| 退出码 | 含义 |
|---:|---|
| 0 | 通过 |
| 1 | 校验不通过；逐条列缺项 + 补齐命令 |
| 2 | 用法/环境错误（`--plan` 不存在、`--task` 缺失、`--host-model` 取席位值、`内审.mjs` 缺失、audit 路径越界/pending 过载） |

`--json` 语义：**开则 stdin 无关、stdout 恒为单行 JSON**。
- exit 0 → `{"ok":true,...review块}`
- exit 1 → `{"ok":false,"missing":["✗ <文件>: <缺什么>"],"fix":["node …"]}`
- exit 2 → `{"ok":false,"error":"<原因>"}`
不传 `--json`：exit 0 仍打印单行 review 块；exit 1/2 打印人读多行文本。**命令格式约束（两种模式通用，含 `--json` 的 `fix` 数组元素）**：可执行命令行一律以 `node ` 开头且占位符已替换为实际绝对路径；说明行前缀 `[说明]`。

`review` 块（exit 0，可整行粘进任务契约；契约只取 M7 四行，多余字段忽略）：

```json
{"ok":true,"review_scale":"重","review_level":"l1","review_receipt":"<ws>/.ctbz-record/反审/<slug>/","review_camps":["deepseek","zhipu","tencent","moonshot"],"plan_sha256":"<hex>","seats":8}
```

`review_receipt` 为**绝对路径**（消费方无需再拼前缀）。

**sha 与重签复核（回修闭环）**：
- 每阵营只对**最高 round** 的回执校验 `plan_sha256 == 当前计划 sha`；低轮回执仅校验格式（保留历史留痕）。
- 回修必然改变计划字节 → 回修后必须跑一轮**重签复核**，`round = 上一轮 + 1`，文件名 `<camp>-r<N>.json`；只逐条核验本轮回修点（`disposition` 写「已解决 / 未解决 / 部分解决」），其余视角写「本视角无回修点，复核通过」；不重开六视角全量、不重提已否决意见。
- `重` 级要求每阵营 ≥2 份回执（含 `round=2`）；重签轮不设上限。

**必填字段清单（§4.5 步骤 5 逐项校验，缺一即不合格）**：

| 字段 | 类型 | 取值域 / 校验 |
|---|---|---|
| `camp` | string | ∈ {deepseek,zhipu,tencent,moonshot} |
| `camp_label` | string | 非空 |
| `provider` / `model` | string | 落 §4.3 席位表；且 `model` 字段与 `--host-model`（缺省 `deepseek-flash`）逐字比较**不得相等**，相等即不合格 |
| `round` | string | 十进制正整数字符串（`"1"`,`"2"`,`"3"`,…，重签轮不设上限）；且与文件名后缀一致：无后缀 ⇔ `"1"`，`-r<N>` ⇔ `"<N>"`（N≥2） |
| `plan` | string | == `--plan` 逐字 |
| `plan_sha256` | string | 64 位小写 hex；**仅对每阵营最高 round 的回执**要求 == 当前计划 sha；低轮回执只校验格式 |
| `generated_at` | string | 非空 |
| `verdict` | null\|string | 空模板判据之一；非 null 不额外扣分 |
| `fresh_agent_test` | object | 必填；`conclusion` 非空字符串；`blockers` 为数组（可为空） |
| `verdicts` | array | 长度 ≥6；六视角 `需求一致性/架构合理性/测试完整性/边界条件/性能安全/用户体验` 各 ≥1 条 |
| `verdicts[].view` | string | ∈ 六视角 |
| `verdicts[].category` | string | ∈ {阻塞,非阻塞,可接受} |
| `verdicts[].conclusion` | string | ∈ {接受,有条件接受,不接受} |
| `verdicts[].evidence` / `.disposition` | string | 非空 |
| `summary` | string | 非空 |

`--level l1` 步骤：①`--plan` 存在，读字节算 SHA ②正文含 `review_scale:` 且值合法 ③按 §4.1 得席位数与阵营覆盖 ④扫回执目录（目录不存在/不可读按 0 份计，不抛栈）；空模板单独计数并报「空模板 N 份（= 没审，与没写同判）」⑤逐份按上表校验 ⑥重级要求每阵营有 `round=2` 回执 ⑦汇总。

`--level l2`：`--task` 必填；≥1 份回执；`implementer_camp != reviewer_camp`；`camp == reviewer_camp`；其余同上表。
`--level l3`：4 阵营 `<camp>.json` 齐全 + `checks` 四项齐全 + 六视角。
`--level audit`（M11）：读 `<ws>/.ctbz-record/内审/pending.json`；不存在或 `pending` 空 → exit 0 输出 `{"ok":true,"review_level":"audit","pending":0}`；否则逐条：
- `file` 经 `path.resolve` 后必须位于 `<ws>/docs/内审/` 之下，越界 → exit 2「路径越界」
- `pending` 条数 >100 → exit 2「pending 过载」
- `spawnSync(process.execPath, [SELF_DIR + "/内审.mjs","check",file,"--json"], {timeout:10000, killSignal:"SIGTERM"})`（数组参数，禁 `shell:true`）；超时按未通过计
  `SELF_DIR = dirname(fileURLToPath(import.meta.url))` —— **按 `派发闸.mjs` 同目录解析**，不用固定 `<skill>` 绝对路径（T1 测试据此把两脚本复制进 `mkdtemp` 夹具即可注入 stub）
- 任一未通过 → exit 1 列未通过项；`内审.mjs` 不存在 → exit 2

### 4.6 `scripts/反审.mjs` 增量（T2：只增不改）

| 选项 | 语义 |
|---|---|
| `--workspace <ws>` | 回执根目录。**非 `--dry-run` 且未显式给出 → exit 2**（防污染任意 cwd）。注入骨架后 `RECORD_DIR` 必须是 `<ws>/.ctbz-record/反审/<slug>` **绝对路径** |
| `--gate` | 骨架产出后 `spawnSync(node, [<skill>/scripts/派发闸.mjs, "--plan", plan, "--workspace", ws, "--level", "l1"])`，脚本退出码 = 闸门退出码 |

- 落盘：非 `--dry-run` 时按 §4.4 写 4 份**空模板** `<camp>.json`（`--round 2` 时 `<camp>-r2.json`），字段齐全、`verdict: null`、`verdicts: []`；`--camps` 少于 4 也照落 4 份。
- **两条返回路径（`--out <文件>` 与不带 `--out`）都要落模板、都要跑 `--gate`**（现有 `反审.mjs:125-129` 带 `--out` 即 `return 0`，须改为先落模板/gate 再返回，或把两者提到分支之前）。
- `--camps` 少于定级席位数 → **必然不过闸，属预期行为，非 bug**（骨架头部注释写明）。
- `--camps` 过滤后为空（空串、纯分隔符）→ 用法错误 exit 2，不落模板、不跑 gate。
- `--dry-run`：不写盘、不跑 gate（两条返回路径都不执行）。
- 骨架注释锚点：在 `buildSkeleton()` 内第 4 行头注释 `L.push("// 规避 maxResultChars 50000 静默截断…")`（`反审.mjs:75`）**之后**、`L.push("")`（`:76`）**之前**追加三个 `L.push("// …")`：
  `// 回执落盘：<ws>/.ctbz-record/反审/<slug>/<camp>.json`
  `// 校验命令：node <skill>/scripts/派发闸.mjs --plan <plan> --workspace <ws> --level l1`
  `// schema：camp/camp_label/provider/model/round/plan/plan_sha256/generated_at/verdict/fresh_agent_test/verdicts/summary`
- 骨架 prompt 增补：回执须含上述字段；`provider/model` 填自身实际席位；`fresh_agent_test` 必含【新鲜 Agent 测试】结论与卡点清单。
- **向后兼容边界**：stdout（`// ===== ctbz 四路反审骨架（start/end）=====`）与 stderr 提示不变；新增的「落 4 份空模板」是 M2 的**有意副作用**，不是兼容回归，写入脚本头注释。

### 4.7 `scripts/内审.mjs` CLI（T3 实现）

```
node <skill>/scripts/内审.mjs init  --subject <主题> [--prev <编号>] [--workspace <ws>] [--dir <目录>] [--date YYYY-MM-DD]
node <skill>/scripts/内审.mjs check <文件> [--json]
node <skill>/scripts/内审.mjs link  --prev <编号> --file <当前内审文件> [--dir <目录>]
```

**编号与三处一致性（C7 定论）**：
- `编号 = <YYYY-MM-DD>-<主题>`（`--date` 缺省取当日）。
- 文件名 = `<编号>.md`；`pending.json[].id` == 编号；`pending.json[].file` == `path.resolve(<dir>/<编号>.md)`；文件首行 == `# 内审 <编号>`。四者逐字相等，`check` 由 `file` 的 basename 反查 `pending.json` 的 `id`。
- `--dir` 默认 `<ws>/docs/内审`；`--workspace` 默认 `git rev-parse --show-toplevel`，失败回退 cwd。

**同类判定（C8/D2 定论）**：扫 `<dir>/*.md`，取文件名**去掉 `^\d{4}-\d{2}-\d{2}-` 日期前缀后的主题段**，去空白归一化后与 `--subject` 归一化值**全等**即判同类（不做子串、不做同义、不按「首个 `-` 之后」切）。近似/同义主题不进脚本判定，由 `link --prev` 显式承担。

| 命令 | 行为 | 退出码 |
|---|---|---|
| `init` | 生成模板到 `<dir>/<编号>.md`；追加 `pending.json` | 0；`<编号>.md` 已存在→1；已存在且 `pending[].checked === true`→1（「已审结，不得覆盖」）；同类主题已存在且未带 `--prev`→1（提示「必须 --prev <编号>」） |
| `check` | 六字段 + 归因层级 + 禁止项；通过时把 `pending.json` 对应 `id` 置 `checked: true` | 0/1 |
| `link` | 读前条 `实现状态`：`已实现` → exit 1 报「缺陷失效，按 §5.3 约束2 强制升级 L3」；字段缺失或非枚举 → exit 1「前条不可判定」；否则把 `--file` 的 `同类史:` 行改写为 `<编号>` | 0/1 |

模板（**`根因:` 留空**，字段名固定；解析口径：单行为准，字段名后冒号支持全半角，空值即不合格）：

```markdown
# 内审 <编号>

现象: 
证据: 
根因: 
修改项: 
同类史: 首次
可执行性声明: 
实现状态: 未实现
```

`check` 判定（**优先级：含 L3 > 含 L2 > 纯 L1**）：

| 判据 | 规则 | 结果 |
|---|---|---|
| 六字段 | `现象/证据/根因/修改项/同类史/可执行性声明` 均非空 | 缺→不合格 |
| 实现状态 | 第 7 行 `实现状态:` ∈ {`已实现`,`未实现`} | 其它值或缺失→不合格（错误在 `check` 阶段暴露，不留到 `link`） |
| 归因层级 | `根因` 必含 `L1`/`L2`/`L3` 之一，或匹配 `/默认路径\|更省力\|不做比做省力\|默认分支/` | 否则→不合格 |
| L3（优秀） | `根因` 含 `L3` 或匹配上述默认路径正则 | 合格 + 标「优秀」 |
| L2（合格） | `根因` 含 `L2`（且不含 L3） | 合格 |
| L1（不合格） | `根因` 含 `L1` 或匹配 `/忘了\|没注意\|太赶\|疏忽/`，且不含 `L2`/`L3` | **不合格**，提示「继续下探」 |
| 禁词 | `修改项` 匹配 `/加强意识\|下次注意\|更仔细\|提高警惕\|引起重视/` | 不合格 |
| 文件落点 | `修改项` 含 `*.mjs\|*.js\|*.md\|*.json\|*.yaml\|*.yml\|*.sh` 形式的路径 | 无→不合格 |
| 验收标准 | `修改项` 含「验收」或 `/判据\|退出码\|预期/` | 无→不合格 |

### 4.8 实施任务契约必填四行（M7）

```
review_scale: 轻|中|重
review_receipt: <派发闸输出的 review_receipt>
review_camps: deepseek,zhipu,tencent,moonshot
plan_sha256: <派发闸输出的 plan_sha256>
```

---

## 5 任务契约

### T0 前置（秒级，串行）

| 项 | 内容 |
|---|---|
| 目标 | 让 `.ctbz-record/` 与计划文件不再污染 `部署.js:44` 的干净判定 |
| write-set | `ctbz-dsh/.gitignore` |
| 动作 | 追加一行 `.ctbz-record/`；`git add .gitignore docs/ctbz-2.0.6-派发闸与内审-计划.md` 并 commit（commit message：`plan: ctbz 2.0.6 派发闸与内审协议 实施计划（r2）`） |
| 验收 | `git status --porcelain` 不含 `.ctbz-record`；`git check-ignore -v .ctbz-record/反审/x.json` exit 0（V14） |
| 完成标准 | 上述两条命令实测通过 |

### T1 派发闸（M1 + M11）

| 项 | 内容 |
|---|---|
| 目标 | 新增 `skills/ctbz/scripts/派发闸.mjs`，实现 §4.4/§4.5 全部行为 |
| write-set | `skills/ctbz/scripts/派发闸.mjs`、`tests/派发闸.test.mjs` |
| 输入依赖 | §4.1–§4.5；`内审.mjs` 仅 audit 运行时 spawn（§4.7 接口） |
| 约束 | 只用 node 标准库（`fs`/`path`/`crypto`/`child_process`/`url`）；`#!/usr/bin/env node`；中文路径用 `fileURLToPath`，stderr 报错里的路径也不得 percent-encode；只读回执目录，不写任何文件 |
| 测试 | 用例全走 `mkdtempSync` 夹具，合格/不合格回执按 §9.12 生成；audit 分支在夹具内**自备 stub `内审.mjs`**（能 `exit 0`/`exit 1` 两种），并按 §4.5 的「同目录解析」把 `派发闸.mjs` 与 stub 一起复制进夹具，不依赖 T3 产物；不碰 `~/.agents`、`~/.dsh` |
| 验收 | V2、V3、V4、V5、V14、V15、l3 三分支（缺阵营→1；`checks` 缺项→1；齐全→0）、audit 三分支（pending 空→0；check 不过→1；越界→2） |
| 完成标准 | `node --test 'tests/派发闸.test.mjs'` 全绿 |

### T2 反审骨架增强（M2）

| 项 | 内容 |
|---|---|
| 目标 | 按 §4.6 增量改造 `scripts/反审.mjs` |
| write-set | `skills/ctbz/scripts/反审.mjs`、`tests/dsh-regression.test.mjs` |
| 输入依赖 | §4.2/§4.4/§4.6；闸门按 §4.5 以路径调用（不 import） |
| 约束 | 向后兼容见 §4.6；`--dry-run` 零写盘；`CAMPS` 取值不得改；`--gate` 用例先检测 `派发闸.mjs` 是否存在，缺失则 `skip` 并注明「依赖 T1」 |
| 验收 | 既有 `tests/dsh-regression.test.mjs` 断言全绿（V8 前半）；新增断言：非 dry-run 落 4 份空模板且 `verdict:null`；`--round 2` 落 `<camp>-r2.json`；骨架文本含 `<ws>` 绝对路径字面量；未给 `--workspace` 非 dry-run → exit 2；`--camps` 过滤后为空 → exit 2；`--out` 与非 `--out` 两条路径都落模板 |
| 完成标准 | `node --test 'tests/dsh-regression.test.mjs'` 全绿 |

### T3 内审协议（M9 + M10）

| 项 | 内容 |
|---|---|
| 目标 | 新增 `scripts/内审.mjs`（§4.7）+ `references/内审协议.md`（**逐字取自 §9.10**） |
| write-set | `skills/ctbz/scripts/内审.mjs`、`skills/ctbz/references/内审协议.md`、`tests/内审.test.mjs` |
| 输入依赖 | §4.7、§9.10（协议正文全文已内联，无需读缺陷单） |
| 约束 | `references/内审协议.md` 内容 = §9.10 全文，不得增删语义；`.md` 内不写散文段（哑巴模式） |
| 验收 | V9、V10（四用例根因原文：`L1 忘了` / `L2 无必填字段` / `L2 无闸门` / `L3 默认路径更省力`）、V11、V12；V9 断言表达式 = `references/内审协议.md` 触发节内的 `-` 列表项数 ≥5 |
| 完成标准 | `node --test 'tests/内审.test.mjs'` 全绿 |

### T4 主文与全局指令（M3+M4+M5+M6+M7+M8+M9 链接节）

| 项 | 内容 |
|---|---|
| 目标 | 冷启动执行者只读 `SKILL.md` 即可复述命令与回执落盘路径（V1） |
| write-set | `skills/ctbz/SKILL.md`、`skills/ctbz/references/派发.md`、`CHANGELOG.md`、`tests/主文锚点.test.mjs`、`~/.dsh/AGENTS.md` |
| 编辑点 | A 插 `SKILL.md:62` 之前 ← §9.1 ②B 插 `SKILL.md:7` 之后 ← §9.2 ③替换 `SKILL.md:267` 整句 ← §9.3 ④插 `SKILL.md:271` 之后 ← §9.4 ⑤插 `references/派发.md` 的 `## 2. 角色规格（角色清单.json）` 之前 ← §9.6 ⑥插 `~/.dsh/AGENTS.md:7` 之后 ← §9.7 ⑦插 `~/.dsh/AGENTS.md:9` 之后（`## 环境事实` 之前）← §9.8 ⑧`SKILL.md:3` `version: 2.0.5` → `2.0.6` ⑨`CHANGELOG.md` 第 1 行 `# Changelog` 之后 ← §9.9 |
| 约束 | 不得改动 `SKILL.md:77` 硬门原文（缺陷单 §六）；不得改动 `~/.dsh/AGENTS.md` 第 16–27/29–56 行两个镜像块内任何字符；新增文本一律取 §9 原文，**不做创作**；测试用 `mkdtempSync` 隔离、零网络；写 `~/.dsh/AGENTS.md` 前 `cp` 到 `/tmp/AGENTS.md.bak` |
| 验收 | V1、V6、V13 |
| 完成标准 | `node --test 'tests/主文锚点.test.mjs'` 全绿；`diff <(sed -n '/末段契约:BEGIN/,/末段契约:END/p' SKILL.md) <(sed -n '/末段契约:BEGIN/,/末段契约:END/p' ~/.dsh/AGENTS.md)` 无差异，哑巴模式块同理 |

### T5 集成收口

| 项 | 内容 |
|---|---|
| 目标 | 集成、验收、部署、记录 |
| write-set | `.ctbz-record/**`、`docs/验收表-2.0.6.md`（`.gitignore` 已由 T0 处理） |
| 步骤 | ①`node --test 'tests/*.test.mjs'` 全绿 ②跑真实联调：伪造缺回执项目验闸门 exit 1；补 4+4 份合格回执验 exit 0 ③写 `docs/验收表-2.0.6.md`（编号×状态×证据，**在 commit 之前**，否则留 untracked 脏文件）④`git status --porcelain` 自查为空后 `node skills/ctbz/scripts/部署.js --check-only` ⑤`git add .gitignore docs/ CHANGELOG.md skills/ tests/` 并 commit ⑥`node skills/ctbz/scripts/部署.js` 真部署 ⑦`diff -rq skills/ctbz ~/.agents/skills/ctbz` 与两个镜像块 `diff` 核对 |
| 约束 | 不 push（未授权）；不改 `ctbz`(main) worktree；`部署.js` 报安装侧漂移则停下报主会话 |
| 验收 | V8（既有命令行为不变 + `部署.js` 跑通） |

---

## 6 本计划自身的闸门

| 步骤 | 命令 | 状态 |
|---|---|---|
| 启动自检 | `node <skill>/scripts/preflight.mjs --json` | 已跑，M1–M5 全 ok（F4） |
| L1 第一轮 | workflow 4 席（deepseek-v4-pro / glm-5.3-flash / hy4-preview-f / kimi-k2.8-preview） | 已完成，4/4 回执，40 条裁决，13 阻塞 |
| 回修 | 本文件 r2（C1–C26 逐条处置） | 已完成 |
| L1 第二轮 | 4 席，只针对 r1 未解决项 + r2 新证据 | 已完成，4/4 回执；r1 项全闭合，新提 D1–D16 |
| 回修 | 本文件 r3（D1–D16 逐条处置，见 §0.1） | 已完成 |
| L1 第三轮（重签复核） | 4 席，只逐条核验 D1–D16 的回修点 | 已完成，`<camp>-r3.json`；2 席提硬缺陷，2 席通过 |
| 回修 | D9 残端恒真比较 + `round` 枚举与重签协议互斥 | 已完成 |
| L1 第四轮（定稿重签） | 4 席，核上述两处 | 已完成，`<camp>-r4.json` 4/4 签字 |
| 回修 | 元数据滞后（版本标 / §6 死 sha / §7 标题漏 V15） | 已完成 |
| L1 第五轮（定稿签字） | 4 席 | 见 `<slug>/<camp>-r5.json`（本表不登记本轮结果，登记即自指改文件） |
| 闸门 | 按 §4.5 人工对照校验（T1 交付前 `派发闸.mjs` 不存在），留痕 `.ctbz-record/反审/<slug>/_manual-gate.md` | 待跑 |
| L2 | 每任务由未参与实现的阵营复核 | 待跑 |
| L3 | 4 阵营整体复查（集成/调用名/main 未污染/安装副本分支标识） | 待跑 |

**诚实声明**：T1 交付前闸门不存在，本轮 L1 由主会话按 §4.5 人工校验并留痕；不得声称闸门已拦过。

---

## 7 验收表（V1–V15）

| # | 验收项 | 通过标准 | 证据形式 |
|---|---|---|---|
| V1 | 冷启动可发现 | 只读 `SKILL.md` 能复述可复制命令与回执落盘路径 | `tests/主文锚点.test.mjs` 断言 SKILL.md 含 `scripts/派发闸.mjs`、`scripts/反审.mjs`、`scripts/preflight.mjs`、`.ctbz-record/反审/`、`review_receipt`、`spawn_teammate` + 「禁止」；**人工核对**：L2/L3 复核时复述一次并留痕 |
| V2 | 闸门可拦 | 无回执 → exit 1 且输出含补齐命令；补 4 份合格回执 → exit 0 | `tests/派发闸.test.mjs`（可重跑） |
| V3 | 同模型自审被拦 | `model=deepseek-flash` 拒；`deepseek-v4-pro` 过 | 同上 |
| V4 | 旧计划不可复用 | 改计划文件后最高轮回执 `plan_sha256` 不匹配 → 拒 | 同上 |
| V5 | L2 隔离可判 | `implementer_camp == reviewer_camp` → 拒 | 同上 |
| V6 | 启动自检 | `SKILL.md` 含 `preflight.mjs` 命令与「反审阻塞」处置文案 | `tests/主文锚点.test.mjs`（可重跑）；preflight 实测输出仅作附录留痕 |
| V7 | 新鲜 Agent 测试 | 计划单独交零上下文 Agent 可开工，卡点 0 或全部可指认于本文件 | 四路回执 `fresh_agent_test` 字段 + 主会话抽验（**人工核对，不可重跑**） |
| V8 | 不破坏既有 | `部署.js` 跑通；`【反审】` 等既有命令行为不变；`反审.mjs` 原输出向后兼容 | `node --test 'tests/*.test.mjs'` + `部署.js` 输出 |
| V9 | 触发可自查 | `references/内审协议.md` 触发节 `-` 列表项 ≥5 条 | `tests/内审.test.mjs` |
| V10 | 归因层级可判 | 根因 `L1 忘了` → 不合格；`L2 无必填字段` → 合格；`L2 无闸门` → 合格（**不得判优秀**）；`L3 默认路径更省力` → 优秀 | 同上 |
| V11 | 禁止项被拦 | 修改项写「加强意识」→ exit 1 | 同上 |
| V12 | 同类第二次 | 未带 `--prev` → 拒；前条 `实现状态: 已实现` → 报「缺陷失效」要求升级 L3 | 同上 |
| V13 | 硬门未被下调 | `SKILL.md:77` 行文本与 §9.11 快照（`sha256 d7bef505…`）逐字相等 | `tests/主文锚点.test.mjs` 断言（断言常量取自 §9.11，不取编辑后文件自证） |
| V14 | 状态目录不进仓库 | `git check-ignore -v .ctbz-record/反审/x.json` exit 0 且 `git status --porcelain` 不含 `.ctbz-record` | T0/T1 用例 + 命令 |
| V15 | L3 可判 | l3 回执缺阵营 → exit 1；`checks` 缺 `集成一致性`/`调用名统一`/`main未污染`/`安装副本分支标识` 任一项 → exit 1；四阵营 + 四项齐全 → exit 0 | `tests/派发闸.test.mjs`（可重跑） |

---

## 8 风险与回滚

| # | 风险 | 处置 |
|---|---|---|
| RK1 | `deepseek-v4-pro` 通道不可用 | 不得滑链到 `deepseek-flash`（同模型自审）；报「反审阻塞」，降级为 3 阵营 + 明示未验证 |
| RK2 | T4 误改 `~/.dsh/AGENTS.md` 镜像块 | 写前 `cp` 备份；改后 `diff` 两个标记块；破坏即 `cp` 回滚 |
| RK3 | 并行写者触碰同一文件 | 写集两两不相交（§3）；T1↔T2 只共享文档冻结的 CLI 契约 |
| RK4 | `.ctbz-record/` 未 gitignore → `部署.js:44` 拒部署 | T0 先补（已从 T5 前移） |
| RK5 | `发布检查.js` 重写安装副本 `dependencies.lock.json`，与源码侧分叉 | T5 部署后核对源码侧 lock，分叉即记录 |
| RK6 | 改动部署后立即影响正在跑的会话 | 部署前 commit，回滚 = `git revert` + 重跑 `部署.js` |
| RK7 | r1 回执 sha 与 r2 计划不符 | §4.5 规则：只对最高轮回执校验 sha（已定论） |

---

## 9 附录（逐字文本，T3/T4 直接誊写，不做创作）

### 9.1 M3 插入块（`SKILL.md:62` 之前）

```markdown
## 派发前必跑（硬闸，未过不得创建实施任务）

1. 计划反审：`node <skill>/scripts/反审.mjs --plan <计划md> --gate`
2. 回执校验：`node <skill>/scripts/派发闸.mjs --plan <计划md> --workspace <ws> --level l1`
3. 实施任务契约必须带 `派发闸.mjs` 输出的 `review` 块；`review_receipt` 为空 → 不得派发。
4. 每个实施任务完成时跑 `--level l2`；全部通过后交付前跑 `--level l3`。
反审一律走「`pick-profile` 取样 → `反审.mjs` 生成骨架 → `workflow.agent()` 执行」。
**禁止**用 `spawn_teammate` / `subagent` 承担反审席位（无法指定 provider/model，等同同模型自审）。

**派发即实施**：修改公共库、修改他人文件、删除、模型库注册，在任务创建那一刻即视为实施开始 —— 必须先过 L1，不得以"还没跑起来"为由跳过。

实施任务契约头部固定四行（`派发闸.mjs` 可解析；`review` 块多余字段忽略）：

```
review_scale: 轻|中|重
review_receipt: <派发闸输出的 review_receipt>
review_camps: deepseek,zhipu,tencent,moonshot
plan_sha256: <派发闸输出>
```

`<skill>` = 安装副本绝对路径 `~/.agents/skills/ctbz`；`<ws>` = 项目绝对路径。
```

### 9.2 M5 启动自检块（`SKILL.md:7` 之后）

```markdown
## 会话启动自检（每次会话一次）

```
node <skill>/scripts/preflight.mjs --json
```

输出 4 阵营可用性；**每次会话只跑一次**。全部不可用 → 标「反审阻塞」并告知用户，不得静默开工。
```

### 9.3 替换 `SKILL.md:267` 整句

```markdown
反审规模分级（唯一来源；`review_scale` 是计划文件的**必填字段**，由 `派发闸.mjs` 校验）：

| 改动面 | 定级 | 席位数 | 阵营覆盖 | 附加要求 |
|---|---|---:|---|---|
| 只读/诊断、仅写我方临时目录 | 免审 | 0 | — | 计划含非空 `免审依据:` 行 |
| 单文件小改 | 轻 | ≥3 | ≥3 个不同阵营 | — |
| 模块级 | 中 | 4 | 4 阵营齐全 | 六视角齐全 |
| 架构级 / 改公共库 / 改他人文件 / 删除 / 注册模型 / 改主文 | 重 | 8 | 4 阵营齐全 | 每阵营 1 份 `round=2` 回执（双轮）；先审后派、改前备份、回归证据 |

四路调度走 workflow 并显式传 provider/model，每路裁决写入独立文件 `.ctbz-record/反审/<slug>/<camp>.json`（workflow 只回路径＋摘要，规避 50k 截断）。
```

### 9.4 M9 链接节（`SKILL.md:271` 之后）

```markdown
## 内审协议（自省与缺陷回流）

Agent 跳过或没按约定执行时，必须 **取证 → 归因到机制 → 向 ctbz 提可执行的修改**，不许停在"下次注意"。触发条件、三步取证/归因/提案、归因层级判定、禁止项与硬约束见 [内审协议](references/内审协议.md)。落盘 `docs/内审/<编号>.md`；未完成由 `派发闸.mjs --level audit` 拦后续实施任务。
```

### 9.5 （保留编号，无内容）

### 9.6 M7 契约字段节（`references/派发.md` 的 `## 2. 角色规格（角色清单.json）` 之前）

```markdown
### 1.1 实施任务契约必填字段（`派发闸.mjs` 可解析）

实施任务契约（`team_task_create` 的 description / `subagent` prompt 头部）固定四行：

```
review_scale: 轻|中|重
review_receipt: <派发闸输出的 review_receipt>
review_camps: deepseek,zhipu,tencent,moonshot
plan_sha256: <派发闸输出>
```

`review_receipt` 为空 → 不得派发。
```

### 9.7 M6 边界修正句（`~/.dsh/AGENTS.md:7` 之后）

```markdown
- 不适用范围**仅限** ZCode 的 `initialize prepare/activate` 与 profile 注册链。**反审席位链在 dsh 完全适用**：`scripts/pick-profile`（席位取样）、`scripts/反审.mjs`（骨架生成）、`scripts/preflight.mjs`（探活）必须照常使用。
```

### 9.8 M5 全局指令行（`~/.dsh/AGENTS.md:9` 之后）

```markdown
- 每次会话开始、开始任何任务前，先跑一次 `node ~/.agents/skills/ctbz/scripts/preflight.mjs --json`（每次会话只跑一次）；全部不可用 → 标「反审阻塞」并告知用户，不得静默开工。
```

### 9.9 CHANGELOG 追加段（`CHANGELOG.md` 第 1 行之后）

```markdown
## [2.0.6] - 2026-09-22

把「忘记审」变成「发不出去」：新增派发闸与内审协议。

### 新增
- `scripts/派发闸.mjs`：派发前硬闸（L1 四路回执 / L2 任务隔离 / L3 总项目复查 / audit 内审待办），逐项校验回执 schema、席位表、`plan_sha256`，通过时输出可粘贴的 `review` 块。
- `scripts/内审.mjs`：`init` / `check` / `link` 三命令，六字段校验 + 归因层级（L1 不合格 / L2 合格 / L3 优秀）+ 禁止项拦截 + 同类第二次强制挂链。
- `references/内审协议.md`：自省与缺陷回流协议全文。
- `SKILL.md` 新增「派发前必跑（硬闸）」「会话启动自检」「内审协议」三节，并在三层反审协议处补定级表（`review_scale` 为计划必填字段）。

### 变更
- `scripts/反审.mjs`：骨架生成时按 `--workspace` 落 4 份空回执模板（`verdict: null`，区分「没写」与「没审」）；骨架头注释固定写出回执落盘路径与闸门校验命令；新增 `--gate` 直连闸门。既有 stdout/stderr 格式不变。
- `~/.dsh/AGENTS.md`：澄清「ZCode 不适用」仅限 profile 注册链，反审席位链照常使用；补会话启动自检。
- 定级表统一：单文件小改 ≥3 / 模块级 4 / 架构级 8（4 阵营 × 双轮）。
```

### 9.10 内审协议全文（T3 的 `references/内审协议.md` 逐字来源）

```markdown
# ctbz 内审协议（自省与缺陷回流）

一句话：Agent 跳过或没按约定执行时，必须 **取证 → 归因到机制 → 向 ctbz 提可执行的修改**，不许停在「下次注意」。

## 触发（可自查，不靠自觉）

命中任一条即触发：

- 跳过反审（L1 / L2 / L3）
- 计划未定级，或未写 `review_scale`
- 反审席位同模型自审（provider/model = 主进程模型）
- 未落回执、未写验收表、未写记录
- 超出 write-set 写入
- 对用户的承诺未兑现
- 用户指出「你没按约定做」（**不得辩解为先**）
- 自查时出现「本来应该 X 但我没做」

## 三步（缺一步不算完成）

### ① 取证 —— 先看自己的工作记录，不对齐不归因

调本轮真实痕迹：任务板 revision 与状态变迁、工具调用序列、产物路径与 sha256、日志与心跳。

产出对照表：

```
约定（出处 文件:行号） | 实际动作 | 差异 | 证据路径
```

证据缺失本身要记为一条差异 —— 「没留痕」也是违规。

### ② 归因 —— 必须下探到机制层

| 层级 | 表述 | 判定 |
|---|---|---|
| L1 疏忽 | 「忘了 / 没注意 / 太赶」 | **不合格**，继续下探 |
| L2 流程缺失 | 无闸门 / 无必填字段 / 无产物契约 | 合格 |
| L3 默认路径错误 | 不做比做更省力，且没有任何拦截 | **优秀** —— 修它才真正防复发 |

判据（硬）：**把「人的自觉」删掉，机制还拦得住吗？**
答「拦不住」→ 归因未到位，继续下探；答「拦得住」→ 才允许进入 ③。

### ③ 提案 —— 向 ctbz 提修改意见

落 `<ctbz 仓库>/docs/内审/<编号>.md`，编号 = `<YYYY-MM-DD>-<主题>`，必含六字段：

```
现象 | 证据（路径或命令） | 根因（标明 L1/L2/L3） | 修改项（文件 + 改法 + 验收） | 同类史（前一条编号，或「首次」） | 可执行性声明
```

**禁止项**（`内审.mjs check` 必须拦）：把「加强意识 / 下次注意 / 更仔细」写成修改项；无文件落点的修改项；无验收标准的修改项。

## 硬约束（防协议本身退化成 prose）

| # | 约束 |
|---|---|
| 1 | 内审未完成，不得开始下一个任务（任务板上用 `blocked_by` 挂住；`派发闸.mjs --level audit` 校验） |
| 2 | **同类违规第二次发生**必须引用第一次 defect 编号；若第一条已实现却仍未拦住 → 判为**缺陷失效**，开新条目并**强制升级到 L3 层** |
| 3 | 用户催促 / 口头豁免**不豁免内审**（与四扇门同理） |
| 4 | 内审产物必须落盘且字段齐全，由脚本校验；**不留痕 = 未完成** |

## 与既有条款的边界

| 条款 | 管什么 | 区别 |
|---|---|---|
| 收尾自记 | 做了什么、有什么坑 | 自记是**事实流水**；内审是**约定未守的归因与改进** |
| 意见箱 | 用户提的意见 | 意见箱是外部输入；内审是 Agent 自我发现的缺陷回流 |
| 反审协议 | 计划 / 任务的质量 | 反审审「活对不对」；内审审「约定守没守」 |

## 实现项

| # | 内容 |
|---|---|
| M9 | 本文件；`SKILL.md` 主文加「内审协议」一节链到它 |
| M10 | `scripts/内审.mjs`：`init --subject <主题> [--prev <编号>]` / `check <文件>` / `link --prev <编号> --file <文件>` |
| M11 | `派发闸.mjs --level audit` 校验待办内审回执；未完成的，后续实施任务 `ready=false` |

## 挂链接口

- 待办登记：`<ws>/.ctbz-record/内审/pending.json`，形如 `{"pending":[{"id":"<编号>","file":"<绝对路径>","subject":"<主题>","checked":false}]}`
- `check` 通过时把对应 `id` 置 `checked: true`；不自动改文件里的 `实现状态`
- `实现状态: 已实现` 由收尾环节显式改写；`link --prev` 读到即报「缺陷失效」
```

### 9.11 `SKILL.md:77` 原文快照（V13 比对基准）

`sha256(sed -n '77p' SKILL.md) = d7bef505d4af949974b16948014d4fba8196c0c3156b823e7dcd173fd54d929e`

```text
所有计划实施前必须走反审协议（按规模分级）；快速模式验证性产出为例外（转正需反审）；倒计时/自动模式授权不得替代反审执行。反审必含硬问题【新鲜 Agent 测试】："把计划单独给一个没读过任何上下文的 Agent，能不能不问问题就开工？"卡住点=计划欠的具体性，补齐才过。反审通过的计划下一步只能派发，主会话不得自己执行（"写完计划自己开工"违规）；普通与自动模式的小修复也保留独立反审。
```

T4 不得改动该行；`tests/主文锚点.test.mjs` 以本快照为断言常量（禁取编辑后文件自证）。

### 9.12 合格回执 fixture 规格（T1 用例内生成，不手写进仓库）

| 字段 | 夹具取值 |
|---|---|
| 夹具计划文件 | `mkdtemp` 内 `plan.md`，正文含 `review_scale: 中`（V2 用）或 `review_scale: 重`（V15/重级用） |
| `camp` / `camp_label` | 依次 deepseek/DeepSeek、zhipu/智谱、tencent/腾讯、moonshot/月之暗面 |
| `provider` / `model` | 按 §4.3 取该 camp 首个允许组合 |
| `round` 与文件名 | `"1"` ↔ `<camp>.json`；`"2"` ↔ `<camp>-r2.json`；`"3"` ↔ `<camp>-r3.json`（重签轮同规则，N≥2）；重级用例两轮各 4 份 = 8 份 |
| `plan` | 夹具计划文件绝对路径（逐字） |
| `plan_sha256` | `createHash("sha256").update(readFileSync(plan)).digest("hex")`（实时算） |
| `generated_at` | `new Date().toISOString()` |
| `verdict` | `null` |
| `fresh_agent_test` | `{"conclusion":"通过","blockers":[]}` |
| `verdicts` | 六视角各 1 条：`{"view":"<视角>","category":"可接受","evidence":"fixture","conclusion":"接受","disposition":"fixture"}` |
| `summary` | `"fixture"` |

不合格变体（每例只破一处）：`model:"deepseek-flash"`（V3）/ `plan_sha256:"0"×64`（V4）/ `verdicts:[]`（空模板）/ 删 `fresh_agent_test` / `round` 与文件名后缀不一致 / 重级只给 4 份（缺 `-r2`）。
l3 用例另备 `<ws>/.ctbz-record/反审/项目级/<slug>/<camp>.json`，在合格回执上追加 `checks` 四条（缺任一即 V15 失败）。

---

## 10 不做

- 不改 `~/.agents/skills/ctbz/`（只经 `部署.js`）
- 不改模型阵营表与 `pick-profile` 取样守恒顺序
- 不下调 `SKILL.md:77` 硬门原文
- 不引新依赖（只用 node 标准库）
- 不 push（未授权）
