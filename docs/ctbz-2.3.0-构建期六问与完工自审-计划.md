# ctbz 2.3.0 构建期六问与完工自审 · 实施计划

review_scale: 重
review_level: l1
计划正文版本: r9（2026-09-23，L1 第七轮回执后回修；冻结 sha 见 §0 末行）
定级依据: write-set 含改公共闸（`派发闸.mjs`）与改主文（`SKILL.md`）→ 按定级表取「重」（8 席 = 4 阵营 × 双轮）↗ #8
取证文件: `docs/取证/ctbz-2.3.0-构建期六问与完工自审.md`

## 0 修订记录

### r2 sha `d77b9197…` → r3

| # | r2 阻塞项 | 出处 | 本轮回修 |
|---|---|---|---|
| R1 | §3.1「`:1`–`:748` 逐行不变」与 §3.2 的十行原位替换自相矛盾；V8 同一句内亦矛盾 | 四路一致 | §3.1 重述为「**行号零漂移**：除 §3.2 列的 12 行原位替换外，`:1`–`:748` 其余行逐字不变、不得增删行」；V8 同步 ↗ #12 |
| R2 | M11 落点 `:751` 令 `:752` 的 `process.exitCode` 下移 → A6 依据自杀，实施后本计划 l1 必红、V7 自指不可达 | 四路一致 | A6 依据改 `:748`（`createHash`），位于插入点之前、实施后永真 |
| R3 | §3.7 T1 未给 `SIX_OK` 逐字；内容敏感（首猜文案实测 `fail 16`）；补一个六行全「无」的版本虽能转绿但绕过闸 | deepseek、moonshot、tencent | T1 改为逐字给出 `sixOk(ref)` 模板函数；反例/真实两行带**本夹具 ws 内可达**的 `文件:行号` |
| R4 | M2/M3/M4/M5/M6 在 Markdown 单元格内含 `\|\|` 与 `\`` 转义，照抄即 `SyntaxError` | 四路一致 | §3.2 改为 **js 围栏 diff 块**（`-` 旧行 / `+` 新行），彻底取消单元格转义 |
| R5 | §3.4 内 `stripFences`/`FILE_LINE_RE` 的行号引用失实（写 `:308`/`:57`，实为 `:305`/`:60`） | moonshot | 全部按实测重写：`:305`、`:60`、`:748`、`:18` |
| R6 | l4 报错文案沿用「L2 隔离失效」；`USAGE` 与文件头未同步 l4 | tencent | 新增 M6'（`:546` 去「L2」）与 M12/M13（`:6`/`:79` 折进 l4 说明，零增行） |
| R7 | `MANIFEST_ROW_RE` 无越界护栏（清单可指 ws 外文件） | deepseek | §3.4 插入块加 `resolve(ws)` 边界判定；含空格路径明确**不支持**（表现为 0 行有效条目判红） ↗ #0 |
| R8 | l4 回执无生成工具（`反审.mjs` 只产 l1 骨架） | deepseek | 主文完工自审小节加逐字「回执骨架」JSON 块（§3.5） |
| R9 | `sixProblems` 作用域过宽（l2/l3 亦强制） | tencent | M10 改 `level === "l1"` 分支；l2/l3 只跑账闸 |

### r3 sha `1961ecfe…` → r4（主进程影子仓照抄实测后回修）

| # | 照抄实施实测出的缺陷 | 出处 | 本轮回修 |
|---|---|---|---|
| P1 | **M10 漏掉 `artifactProblems` 调用**：r3 采纳第二轮建议写成 `level === "l1"` 分支，l4 的 sha 兜底与越界护栏整条不被调用 → 改产物后跑 l4 仍 exit 0（实测 `{"ok":true,…,"review_level":"l4"}`） | 影子仓 V13/V14 复现 | M10 改为 l4 分支优先 |
| P2 | `:601` 锚点错位：`:601` 是 `function scaleNote(...)` 签名行，目标行 `if (level === "l2") return …` 在 `:602` | 影子仓按行号替换时首个不符项 | §3.2 锚点改 `:602` |
| P3 | §3.1 写「12 行」但 §3.2 实列 13 个锚点（含 `:6`/`:79`） | 影子仓 diff 实测 | 改「13 行」并补全清单 ↗ #12 |
| P4 | `T1` 的 `writePlan` 替换串在源文件中不匹配（实际后接 `\n\n| 断言 |`） | 影子仓替换计数 0 | T1 改给完整匹配串 |
| P5 | `makeWs` 的替换串在 `:547` 的 `makeEvWs` 模板内亦出现（计数 2） | 影子仓替换计数 2 | T1 注明须全局替换 |
| P6 | 新增用例的具体构造未写进计划（V9–V14 六例） | 本轮回修自补 | §3.7 逐例写明夹具、断言与判红文案 |

### r4 sha `98300efc…` → r5（L1 第三轮回执后回修，终轮）

| # | r4 残留缺陷 | 出处 | 本轮回修 |
|---|---|---|---|
| Q1 | §3.7 围栏内 `-`/`+` 两行裹了 markdown 反引号，字面照抄作搜索串 → 命中 0 次，夹具未改，实测 `fail 11` | deepseek（本项为唯一阻塞） | 去掉围栏内反引号 ↗ #3 |
| Q2 | 残留三处「12 行」（`:308`/`:321`/`:347` 邻域）与 §3.2 的 13 个锚点不符 | deepseek | 全部改 13 行 ↗ #12 |
| Q3 | §3.3 写主文增至「约 540 行」，实测 512 | deepseek | 改 512 行（实测值） ↗ #473 |
| Q4 | V10b 是否独立成例未钉死 → 实测用例数 128 或 129 | deepseek、zhipu、moonshot | 钉死「V10b 并入 V10」，用例数恒为 128；判据只看 `# fail 0` |

### r5 sha `f6a52558…` → r6（L1 第四轮回执后回修，终轮）

| # | r5 残留缺陷 | 出处 | 本轮回修 |
|---|---|---|---|
| S1 | V8 行仍写「这 12 行变动」，与 §3.1/§3.2 的 13 行矛盾 | deepseek、moonshot | 改 13 行 ↗ #12 |
| S2 | SKILL.md 两节按行号 `:199`/`:233` 定位，先插后者再插前者会插错位置，且**错法下 128 用例仍全绿**（静默失败） | tencent | §3.3 改为按节标题定位，并给定位命令与必命中次数 |
| S3 | 行数口径不一：正文写「约 511（实测 511/512）」，取证 §10 记 512/795 | deepseek | 正文钉 511；取证 §10 标注两次实测与差异原因 |

### r6 sha `a346c758…` → r7（l4 完工自审 4 项发现后加固）

| # | l4 完工自审发现 | 出处 | 本轮回修 |
|---|---|---|---|
| T1 | `blocking` 与 `verdicts` 脱钩：回执可写 `blocking:0` 而六视角全是「阻塞」仍判过 | tencent（阻塞） | `:544` 加一致性判据 |
| T2 | `implementer_camp` 无白名单：可填任意值绕过隔离 | tencent（阻塞） | `:544` 加 `CAMP_ORDER` 白名单 |
| T3 | 路径边界用字面 `resolve`，符号链接可把清单指向 ws 外 | tencent（阻塞） | `artifactProblems` 改用 `realpathSync`（`:18` import 同步） |
| T4 | 清单少列即漏审，闸无法自证清单完整性 | tencent（阻塞） | **不作机械修补**，改声明限制 ＋ 补偿控制：完工自审席位须把清单与 `git status --porcelain` 逐条对照，漏列即判阻塞 |

### r7 sha `68288a8f…` → r8（L1 第六轮回执后回修，收尾轮）

| # | r7 阻塞项 | 出处 | 本轮回修 |
|---|---|---|---|
| U1 | §3.2 的 `:18` 锚点与替换对**双双写错**：`:18` 是注释行，import 在 `:18`；照抄会让 `realpathSync` 未导入（软链越界复活）或删掉 fs import（闸整体不可用） | deepseek、tencent | 改 `:18` 并给正确 `+` 行 |
| U2 | 行数口径分裂：§3.1 已改 14，但 V8／R10／A6／覆盖行仍写 13 | tencent | 统一为 16（含新增两行） |
| U3 | 无 symlink 用例，U1 的错法在 128 全绿下不被发现 | tencent | 新增 V15 用例（软链越界判红 ＋ ws 内软链不误杀）→ 用例数 129 |
| U4 | 文件头 `:12` 与 `USAGE` `:74` 的级别清单缺 l4 | zhipu、tencent | 两行原值补 l4 ↗ #2 |

### r8 sha `f47abe55…` → r9（L1 第七轮回执后回修，终轮）

| # | r8 阻塞项 | 出处 | 本轮回修 |
|---|---|---|---|
| V1 | §3.2 的 `:544` `+` 行丢了 4 空格缩进（首列只有 1 空格），照抄后与实码不符、`diff` 残留 1 行，V8 自验收必红 | moonshot | `+` 行按实码逐字补回缩进 ↗ #16 |
| V2 | §2 现状表仍写 `:16`，未随 U1 改为 `:18` | deepseek | 全表改 `:18` |
| V3 | R10 括号内只枚举 13 个锚点，与 16 行口径不符 | deepseek | 补全 16 个 ↗ #16 |

### r9 sha `abf90c77…` → r10（l4 完工自审第二轮发现后加固）

| # | 发现 | 出处 | 本轮回修 |
|---|---|---|---|
| W1 | `artifactProblems` **fail-open**：含 64 位 sha 但不符合条目格式的行（序号表行、含空格路径、非 ASCII 路径）被**静默跳过** → 清单可少列/异形行仍 exit 0，与主文「按清单逐行重算」矛盾 | zhipu、tencent（阻塞） | 逐行解析：含 64 位 sha 而不合格式即判红；路径改 `(\S+)` 并保留 realpath 越界判定；新增 V16 用例 |
| W2 | CHANGELOG 2.3.0 段残留「13 行」「128 用例」旧口径 | moonshot（非阻塞） | 改为 16 行 / 130 用例 ↗ #16 |

## 1 需求诊断

| 项 | 内容 |
|---|---|
| 用户原话 | 「ctbz 下任何一步行动，能否经得起质疑。这个确实没办法保证，但是你至少自己构建的时候，多想一想其中的逻辑（任何事情） 构建结束之后，再自己走一遍反审协议」 |
| 真问题 | 构建质量当前靠**事后**反审兜底：成本高、滞后，且反审只审计划不审产物——计划过闸后产物仍可能带缺陷出厂 |
| 上游欠账 | `docs/待办.md:27`（TD-23） |
| 根因 | ①六问只在脑子里，不留痕、不校验 → 每次都要重犯 ②「完工」判据缺失：L1 审完计划即默认可以交付，无人重审产物 |
| 不做什么 | 不新增阵营、不改定级表、不改 L1/L2/L3 既有判法、不动 `内审.mjs`、不动冻结的镜像块与硬门行、不改 `反审.mjs` |

## 2 现状（逐字核对，行号 r1 冻结）

| 事实 | 锚点 |
|---|---|
| 闸层级只有 l1/l2/l3/audit，无产物级 | `skills/ctbz/scripts/派发闸.mjs:50`（`LEVELS`） |
| 回执目录按级别三元映射，无产物级分支 | `skills/ctbz/scripts/派发闸.mjs:612`（`任务级`） |
| l2 隔离判法已存在，可直接复用给产物级 | `skills/ctbz/scripts/派发闸.mjs:539`（`ctx.level === "l2"`） |
| 同阵营判定行；`:544` 逐字为 `    }`（该 if 的闭合行） | `skills/ctbz/scripts/派发闸.mjs:545`（`implementer_camp`） |
| 隔离判红文案仅出现在脚本内，测试无断言（故可改文案） | `skills/ctbz/scripts/派发闸.mjs:546`（`L2 隔离失效`） |
| l2 覆盖度分支 | `skills/ctbz/scripts/派发闸.mjs:589`（`else if`）、`:590`（`任务级合格回执`） |
| `scaleNote` 形参 `(level, scale, qualified, camps)`，`camps` 是数字 | `skills/ctbz/scripts/派发闸.mjs:601`（`function scaleNote`） |
| 计划级断言闸接入点（唯二） | `skills/ctbz/scripts/派发闸.mjs:627`（`evidenceProblems`）、`:628`（`ledgerProblems`） |
| 定级表 | `skills/ctbz/scripts/派发闸.mjs:49`（`SCALE_SEATS`） |
| sha 计算法可复用给产物清单 | `skills/ctbz/scripts/派发闸.mjs:748`（`createHash("sha256")`） |
| 可复用模块级名字：`stripFences`／`FILE_LINE_RE`／`readFileSync` | `skills/ctbz/scripts/派发闸.mjs:305`、`:60`、`:18` |
| 文件末三行逐字（**实施前快照**）：`:750` `}`／`:751` 空行／`:752` `process.exitCode = main();` | `skills/ctbz/scripts/派发闸.mjs:752`（`process.exitCode`，实施后下移） |
| 主文 37 个小节 ↗ #37；两个插入锚 | `skills/ctbz/SKILL.md:199`（`## 自证与自疑（交付前必跑）`）、`skills/ctbz/SKILL.md:233`（`## 统一模式规则`） |
| 夹具构造器 3 个：`makeWs`（18 处调用 ↗ #18）、`makeLedgerWs`（13 处调用 ↗ #13）、`writePlan`（中/重 2 处） | `tests/派发闸.test.mjs:43`、`tests/派发闸.test.mjs:645`、`tests/dsh-regression.test.mjs:133` |

## 3 改动清单（逐字级契约）

### 3.1 行号零漂移硬约束

| 项 | 规定 |
|---|---|
| 允许的改动 | 只在 §3.2 列的 **16 行**做原位整行替换：`:6`／`:12`／`:18`／`:50`／`:74`／`:79`／`:539`／`:544`／`:546`／`:589`／`:590`／`:602`／`:612`／`:618`／`:627`／`:628` ↗ #12 |
| 其余 `:1`–`:748` | **逐字不变、不得增删任何行** |
| 新增代码 | 唯一落点 `:751`（`:750` 的 `}` 之后、`:752` 的 `process.exitCode = main();` **之前**）。落点必须在此，否则 `main()` 先执行、`const SIX_HEAD` 命中 TDZ：`ReferenceError: Cannot access 'SIX_HEAD' before initialization`（四路影子仓实测复现） |
| 实施后的行号 | `:751`/`:752` 两个快照行会下移（文件由 752 行增至约 790 行）；**跨实施稳定锚点是 `:748`**，本计划一切依据锚点均 ≤ `:748` ↗ #752 |

### 3.2 `skills/ctbz/scripts/派发闸.mjs` 逐字替换块（`-` 旧行 / `+` 新行，照抄即可）

```js
// :6  文件头注释折进 l4（零增行）
-//   --level audit 内审待办（<ws>/.ctbz-record/内审/pending.json）
+//   --level audit 内审待办（<ws>/.ctbz-record/内审/pending.json）；--level l4 产物级自审（--plan 传产物清单）

// :18
-import { existsSync, readFileSync, readdirSync } from "node:fs";
+import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";

// :12  文件头级别清单补 l4
-//        [--level l1|l2|l3|audit] [--task <T号>] [--json] [--host-model <模型名>]
+//        [--level l1|l2|l3|l4|audit] [--task <T号>] [--json] [--host-model <模型名>]

// :50
-const LEVELS = ["l1", "l2", "l3", "audit"];
+const LEVELS = ["l1", "l2", "l3", "l4", "audit"];

// :74  USAGE 内级别清单补 l4（零增行）
-       [--level l1|l2|l3|audit] [--task <T号>] [--json] [--host-model <模型名>]
+       [--level l1|l2|l3|l4|audit] [--task <T号>] [--json] [--host-model <模型名>]

// :79  USAGE 行折进 l4（零增行）
-  --level <级别>       l1 计划反审 / l2 任务级反审 / l3 项目级复查 / audit 内审待办；默认 l1
+  --level <级别>       l1 计划反审 / l2 任务级反审 / l3 项目级复查 / l4 产物级自审（--plan 传产物清单） / audit 内审待办；默认 l1

// :539
-  if (ctx.level === "l2") {
+  if (ctx.level === "l2" || ctx.level === "l4") {

// :544  原文逐字为四个空格 + }
-    }
+    } if (ctx.level === "l4") { const nb = Array.isArray(d.verdicts) ? d.verdicts.filter((v) => v && v.category === "阻塞").length : -1; if (d.blocking !== 0) bad(`产物级阻塞数须为 0（字段缺失或非数字同判）：${JSON.stringify(d.blocking)}`); if (d.blocking !== nb) bad(`blocking 与 verdicts 阻塞数不符：blocking=${JSON.stringify(d.blocking)}，verdicts 阻塞 ${nb} 条`); if (!CAMP_ORDER.includes(d.implementer_camp)) bad(`implementer_camp 未落阵营表：${JSON.stringify(d.implementer_camp)}（∈ ${CAMP_ORDER.join(",")}）`); }

// :546  去掉「L2」，l2/l4 共用（测试无断言，见 §2）
-      bad(`实施/复核同阵营（L2 隔离失效）：implementer_camp == reviewer_camp == ${d.implementer_camp}`);
+      bad(`实施/复核同阵营（隔离失效）：implementer_camp == reviewer_camp == ${d.implementer_camp}`);

// :589
-  } else if (level === "l2") {
+  } else if (level === "l2" || level === "l4") {

// :590
-    if (qualified.length < 1) out.push(`✗ ${dir}: 任务级合格回执 ${qualified.length} 份，l2 需 ≥1 份`);
+    if (qualified.length < (level === "l4" ? 3 : 1) || (level === "l4" && new Set(qualified.map((it) => it.data.camp)).size < 3)) out.push(`✗ ${dir}: ${level === "l4" ? "产物级" : "任务级"}合格回执 ${qualified.length} 份、阵营 ${new Set(qualified.map((it) => it.data.camp)).size} 个，${level} 需 ≥${level === "l4" ? 3 : 1} 份` + (level === "l4" ? "且 ≥3 阵营" : ""));

// :602  scaleNote
-  if (level === "l2") return `l2 定级 ${scale}：任务级回执需 ≥1 份；当前合格 ${qualified} 份`;
+  if (level === "l2" || level === "l4") return level === "l4" ? `l4 产物级：需 ≥3 份且 ≥3 阵营；当前合格 ${qualified} 份、覆盖 ${camps} 个阵营` : `l2 定级 ${scale}：任务级回执需 ≥1 份；当前合格 ${qualified} 份`;

// :612
-  const dir = level === "l1" ? join(record, slug) : level === "l2" ? join(record, "任务级", task) : join(record, "项目级", slug);
+  const dir = level === "l1" ? join(record, slug) : level === "l2" ? join(record, "任务级", task) : level === "l4" ? join(record, "产物级", slug) : join(record, "项目级", slug);

// :618
-  const sc = readScale(planText);
+  const sc = level === "l4" ? { scale: "重" } : readScale(planText);

// :627
-  missing.push(...evidenceProblems(planText, ws));
+  if (level !== "l4") missing.push(...evidenceProblems(planText, ws));

// :628  l4 走产物清单闸；l1 另跑六问；l2/l3 仍跑账闸（r4：l4 分支必须优先，否则 sha 兜底整条不被调用）
-  missing.push(...ledgerProblems(planText, ws));
+  if (level === "l4") missing.push(...artifactProblems(planText, ws)); else if (level === "l1") { missing.push(...ledgerProblems(planText, ws)); missing.push(...sixProblems(planText, sc.scale)); } else missing.push(...ledgerProblems(planText, ws));

// :751  插入 §3.4 逐字块
```

不改：`parseArgs`、`main`、`expectFromName`、`validate` 的 `plan`/`plan_sha256` 字段名。l4 复用 `--plan` 传产物清单路径，回执既有字段名与 L1 完全一致——**不新增 CLI 开关，不改回执既有字段**。

### 3.3 `skills/ctbz/SKILL.md`

两节**按节标题定位插入，与插入顺序无关**（不要依赖行号，行号是 r1 冻结快照）：

| 新小节 | 插在谁的**前面** | 定位命令（须各命中 1 次） | ↗ #1
|---|---|---|
| `## 构建期六问（动手前先想）` | `## 自证与自疑（交付前必跑）` | `grep -c '^## 自证与自疑（交付前必跑）$' skills/ctbz/SKILL.md` |
| `## 完工自审（审产物，不只审计划）` | `## 统一模式规则` | `grep -c '^## 统一模式规则$' skills/ctbz/SKILL.md` |

两节各自与目标标题之间保留一空行。**若按 `:199`/`:233` 行号先插后者再插前者，会因行号漂移插错位置——实测该错法仍能让 128 用例全绿，属静默失败，必须按标题定位。** 正文逐字见 §3.5。冻结区不动：硬门行、末段契约镜像块、哑巴模式镜像块。插入后主文由 473 行增至 511 行（实测）↗ #473。 ↗ #473

### 3.4 插入块（逐字，落点 `:751`）

```js
// §3.6 构建期六问（2.3.0，TD-23）：l1 且 中/重 级计划须含「## 构建期六问」；反例/真实两行须带 文件:行号
const SIX_Q = ["自指", "反例", "冲突", "覆盖", "一致", "真实"];
const SIX_HEAD = /^##\s*构建期六问.*$/m;
const SIX_CITE_REQUIRED = ["反例", "真实"];
function sixProblems(raw, scale) {
  if (scale !== "中" && scale !== "重") return [];
  const planText = stripFences(raw);   // 自指：围栏内的样例不得冒充真小节
  if (!SIX_HEAD.test(planText)) return ["✗ 计划缺「## 构建期六问」小节（中/重 级必填）"];
  const body = planText.split(SIX_HEAD)[1].split(/\n##\s/)[0];
  const rows = body.split(/\r?\n/).filter((l) => l.trim().startsWith("|") && !/^\|[\s:|-]+\|$/.test(l.trim()));
  const out = [];
  for (const q of SIX_Q) {
    const row = rows.find((l) => (l.split("|")[1] || "").trim() === q);
    if (!row) { out.push(`✗ 构建期六问缺「${q}」行`); continue; }
    if (SIX_CITE_REQUIRED.includes(q) && !new RegExp(FILE_LINE_RE.source).test(row)) {
      out.push(`✗ 构建期六问「${q}」行须带 文件:行号`);
    }
  }
  return out;
}

// §3.7 产物清单（2.3.0，l4）：每行「路径 sha256」或表格行；闸重算比对，产物在自审后被改即红
// fail-closed：含 64 位 sha 却不符合条目格式的行一律判红，不得静默跳过（防漏列/异形行绕过）
const MANIFEST_ROW_RE = /^[|\s]*(\S+)[|\s]+([0-9a-f]{64})[|\s]*$/;
const HEX64_RE = /[0-9a-f]{64}/;
function artifactProblems(manifestText, ws) {
  const out = [];
  let root = resolve(ws);
  try { root = realpathSync(root); } catch { /* ws 不存在：后续读取自会报错 */ }
  const seen = new Set();
  for (const raw of manifestText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || !HEX64_RE.test(line)) continue;
    const m = line.match(MANIFEST_ROW_RE);
    if (!m) { out.push(`✗ 产物清单无法解析的行（含 64 位 sha 却不合条目格式）：${line.slice(0, 60)}`); continue; }
    const rel = m[1];
    const want = m[2];
    if (seen.has(rel)) continue;
    seen.add(rel);
    let abs = resolve(ws, rel);
    try { abs = realpathSync(abs); } catch { /* 文件不存在：交给下方读取报错 */ }
    if (abs !== root && !abs.startsWith(root + sep)) { out.push(`✗ 产物清单 ${rel}: 越出 workspace 边界（含符号链接解析）`); continue; }
    let got = null;
    try { got = createHash("sha256").update(readFileSync(abs)).digest("hex"); } catch { got = null; }
    if (got === null) out.push(`✗ 产物清单 ${rel}: 文件不存在或不可读`);
    else if (got !== want) out.push(`✗ 产物清单 ${rel}: sha 不符（清单 ${want.slice(0, 12)}… ≠ 实际 ${got.slice(0, 12)}…）＝清单后产物被改`);
  }
  if (seen.size === 0) out.push("✗ 产物清单 0 行有效条目：至少 1 行「路径 sha256」");
  return out;
}
```

### 3.5 主文新增小节（逐字）

````md
## 构建期六问（动手前先想）

**反审是补刀，不是第一道防线。动手前先自己咬一遍。**

| # | 问 | 判法 | 机械兜底 |
|---|---|---|---|
| 自指 | 这条规则是否也约束它自己的产物？ | 计划自身跑 `派发闸 --level l1`；产物跑 `--level l4` | `派发闸.mjs` E/A 全查 + l4 清单 sha 重算 |
| 反例 | 什么结果会证明这条检查是空的？ | 每条新检查须有一处先红后绿用例 | 计划「构建期六问」反例行须带 `文件:行号` |
| 冲突 | 会不会打红既有条款、夹具或镜像块？ | 全量 `node --test tests/*.test.mjs` | `tests/主文锚点.test.mjs` 冻结镜像块与硬门行 |
| 覆盖 | 所有调用点与实例都改到了吗？ | 数量断言须 `↗` 出证 | E3/E4：同行锚点 + 取证原文回查 |
| 一致 | 签名、参数、字段、命名是否一致？ | 计划与实现签名逐字对齐 | A3 括号原文须在被引行命中 |
| 真实 | 最后编辑之后，行号与原文还成立吗？ | 冻结后重跑一次 l1 | E2 行号可达 + A3 原文命中 |

中/重 级计划的六问答案落 `## 构建期六问` 小节，由 `sixProblems()` 机械校验；轻/免审级免填。
````

````md
## 完工自审（审产物，不只审计划）

**L1 审计划，l4 审产物；计划过闸不等于产物过闸。**

| 项 | 规定 |
|---|---|
| 触发 | 任一版本/批次实施完成、打 tag 之前，主进程必跑，无例外 |
| 对象 | 产物清单 `docs/取证/<批次>-产物清单.md`，每行 `<路径> <sha256>`（至少 1 行，路径不得含空格） |
| 命令 | `node skills/ctbz/scripts/派发闸.mjs --plan <产物清单> --workspace <ws> --level l4` |
| 回执 | `.ctbz-record/反审/产物级/<清单名>/<camp>.json`；L1 全字段 ＋ `implementer_camp`（实施阵营）＋ `reviewer_camp`（逐字等于 `camp`）＋ `blocking`（整数，须为 `0`） |
| 门槛 | ≥3 独立阵营各 1 份；实施阵营按隔离剔除（`implementer_camp` ≠ `reviewer_camp`） |
| 真实兜底 | 闸按清单逐行重算 sha；含 64 位 sha 却不符合条目格式的行**判红**（fail-closed，不静默跳过）；产物在自审后被改动即判红 |
| 已声明限制 | 清单完整性不由闸保证：漏列即漏审。自审席位须把清单与 `git status --porcelain` 逐条对照，漏列即判阻塞 |

回执骨架（复制后填值；`plan` 指产物清单，`plan_sha256` 为清单字节 sha256）：

```json
{"camp":"<camp>","camp_label":"<阵营名>","provider":"<provider>","model":"<model>","round":"1",
 "plan":"<产物清单绝对路径>","plan_sha256":"<64 位小写 hex>","generated_at":"<ISO8601>","verdict":null,
 "fresh_agent_test":{"conclusion":"<结论>","blockers":[]},
 "verdicts":[{"view":"需求一致性","category":"可接受","evidence":"<证据>","conclusion":"接受","disposition":"<处置>"}],
 "implementer_camp":"<实施阵营>","reviewer_camp":"<camp>","blocking":0,"summary":"<一句话>"}
```
````

### 3.6 l4 回执 schema（逐字，§3.5 表格已引用）

| 字段 | 取值 |
|---|---|
| `camp` / `camp_label` / `provider` / `model` / `round` / `plan` / `plan_sha256` / `generated_at` / `verdict` / `fresh_agent_test` / `verdicts` / `summary` | 同 L1；`plan`＝产物清单绝对路径，`plan_sha256`＝清单字节 sha256 |
| `implementer_camp` | 本批实施的阵营键（如 `deepseek`） |
| `reviewer_camp` | 逐字等于 `camp`（`validate` 既有判法） |
| `blocking` | 整数阻塞数，须为 `0`；缺失或非数字同判 |

### 3.7 测试夹具与新增用例

| # | 改动（无行漂移：全部原地行内替换或文件末尾追加） |
|---|---|
| T1 | 夹具构造器（共 3 个 ↗ #3）原地行内插值，`sixOk` 定义见 §3.8；三处替换串逐字见下（围栏内，须全局替换） |
```js
// ① tests/派发闸.test.mjs:48（makeWs）—— 全局替换（该子串在 :547 的 makeEvWs 内亦出现，计数 2）
-${LEDGER_OK}\n\n## 现场核对
+${LEDGER_OK}\n\n${sixOk('docs/plan.md:1')}\n\n## 现场核对
// ② tests/派发闸.test.mjs:645（makeLedgerWs）
-${ledger ? ledger + '\n\n' : ''}## 现场核对
+${ledger ? ledger + '\n\n' : ''}${sixOk('docs/plan.md:1')}\n\n## 现场核对
// ③ tests/dsh-regression.test.mjs:137（writePlan）
-LEDGER_OK + '\n\n## 现场核对\n\n| 断言 |
+LEDGER_OK + '\n\n' + sixOk('plan.md:1') + '\n\n## 现场核对\n\n| 断言 |
```

| T2 | 新增用例：中/重 级缺 `## 构建期六问` → 判红；六问缺一行 → 判红；反例行无 `文件:行号` → 判红；轻级不填 → 放行 |
| T3 | 新增用例：l4 正常（3 阵营回执含三字段 + 清单 sha 相符）→ exit 0 ↗ #3 |
| T4 | 新增反例：清单所列文件被改后 sha 不符 → 判红；清单路径越出 ws → 判红 |
| T7 | 新增用例 **V16**：清单里追加序号表行 `\| 1 \| <路径> \| <sha> \|` 或含空格路径行 → 判红（`无法解析的行`／`文件不存在或不可读`）；恢复原清单 → exit 0。用例数由 129 增至 130 |
| T6 | 新增用例 **V15**：`ws` 内建软链指向 `ws` 外文件 → 清单列该软链 → exit 1 且含「越出 workspace 边界（含符号链接解析）」；再换成指向 `ws` 内文件的软链 → exit 0（不误杀）。用例数由 128 增至 129 |
| T5 | 新增反例：l4 仅 2 阵营 → 判红 ↗ #2；`blocking: 1` → 判红；缺 `blocking` → 判红；`implementer_camp == reviewer_camp` → 判红（加固后 `blocking:0` ＋ verdicts 含「阻塞」、`implementer_camp` 非阵营键、符号链接越界亦判红） |

### 3.8 `sixOk` 逐字（追加在各测试文件末尾；模块顶层先执行完 const 再跑用例，故尾部定义可用）

```js
// 2.3.0：夹具补 `## 构建期六问`（l1 且 中/重 级必填）；反例/真实两行须带**本夹具 ws 内可达**的 文件:行号
const sixOk = (ref) =>
  '## 构建期六问\n\n| 问 | 本版自查 |\n|---|---|\n' +
  '| 自指 | 夹具自指：本模板须过 sixProblems |\n' +
  '| 反例 | 删本行后 sixProblems 判红（对照 ' + ref + '） |\n' +
  '| 冲突 | 夹具冲突面由 T1 消解 |\n' +
  '| 覆盖 | 覆盖以 grep 复算 |\n' +
  '| 一致 | 签名与主文逐字对齐 |\n' +
  '| 真实 | 本行锚点须可达（' + ref + '） |';
```

三个构造器的（共 3 个 ↗ #3） `ref` 取值与可达性：`makeWs` 与 `makeLedgerWs` 的计划是 `<ws>/docs/plan.md` → `ref = 'docs/plan.md 第 1 行'` 可达；`writePlan` 的计划是 `<ws>/plan.md` → `ref = 'plan.md 第 1 行'` 可达。**不得改成六行全填 `无`**——那样 `sixProblems` 的反例/真实判据失效，等于绕过闸而非补夹具。

### 3.9 新增用例逐例（V9–V14，夹具与断言）

新增夹具（追加在 `tests/派发闸.test.mjs` 末尾）：

```js
const stripSix = (plan) => fs.writeFileSync(plan, fs.readFileSync(plan, 'utf8').replace(sixOk('docs/plan.md:1') + '\n\n', ''));
const artDir = (ws) => path.join(ws, '.ctbz-record', '反审', '产物级', '清单');
const ART_CAMPS = CAMPS.filter((c) => c.camp !== 'deepseek');
// makeArtWs(extra)：建 ws ＋ docs/art.md ＋ 清单 docs/清单.md（每行 `<相对路径> <sha256>`，extra 可追加一行）
// artReceipt(manifest, camp, patch)：产出含 implementer_camp/reviewer_camp/blocking 的 l4 回执
```

| # | 夹具与动作 | 断言 |
|---|---|---|
| V9 | `makeWs('中')` → `stripSix(plan)` → 写 4 份回执 → 跑 l1 | exit 1 且含 `缺「## 构建期六问」小节`；再追加 `sixOk` 并**重写回执**（计划 sha 变了）→ exit 0 ↗ #3 |
| V10 | `makeWs('中')` → 删掉 `\| 覆盖 \| 覆盖以 grep 复算 \|` 行 → 跑 l1 | 含 `构建期六问缺「覆盖」行` |
| V10b | 同上夹具（**并入 V10 同一 test 内，不得独立成例**）→ 把反例行的 `（对照 …）` 抹成 `删本行后判红` → 跑 l1 | 含 `「反例」行须带 文件:行号` |
| V11 | `makeWs('轻')` → `stripSix` → 写 3 份回执 → 跑 l1 | exit 0（轻级免填） ↗ #3 |
| V12 | `makeArtWs()` → 写 `ART_CAMPS` 三份 l4 回执 → 跑 `--level l4` | exit 0；`review_level === 'l4'`；`review_camps === ['zhipu','tencent','moonshot']` ↗ #3 |
| V13 | 同上，依次改回执/产物：仅 2 阵营 → `blocking:1` → `blocking` 置 `undefined`（JSON 略去键）→ `implementer_camp:'zhipu'` → 3 阵营齐全后改 `docs/art.md` | 前四例各 exit 1；`blocking` 两例含 `产物级阻塞数须为 0`；同阵营例含 `隔离失效`；末例含 `sha 不符` ↗ #3 |
| V14 | `makeArtWs('../outside.md ' + 'a'.repeat(64))` ＋ 3 份回执 → 跑 l4 | exit 1 且含 `越出 workspace 边界` ↗ #3 |

**注意**：凡改动计划/清单文本后必须重写回执（`plan_sha256` 随文件字节变），否则判红原因是 sha 不符而非目标判据——V9 首轮实测即踩此坑。

## 构建期六问

| 问 | 本版自查 |
|---|---|
| 自指 | 本计划自身须过「行动账」节与本节；`:199` 的六问小节由 `sixProblems` 自己校验（§3.4 用 `stripFences` 堵住「围栏样例冒充真小节」）；l4 产物清单由 `artifactProblems` 自己重算 sha |
| 反例 | 先红后绿见 §3.7 T2–T5；反审两轮共实测出反例 ↗ #12：TDZ 崩溃、`:627` 锚点自杀、`SIX_HEAD` 自指不可达、`fail 16` 的 SIX_OK 首猜稿、`:752` 依据自杀（`tests/派发闸.test.mjs:645`） |
| 冲突 | 六问入闸会打红 3 个构造器覆盖的全部 中/重 夹具 ↗ #3；以 T1 原地插值消解，且 T1 无行漂移以保住 `tests/派发闸.test.mjs:239` 等依据锚点；镜像块与硬门行不动 |
| 覆盖 | 原地替换 16 行逐条列于 §3.2；夹具面实测：`makeWs` 18 处 ↗ #18、`makeLedgerWs` 13 处 ↗ #13、`writePlan` 中/重 2 处；`--level l4` 零新增 CLI 开关，故 `parseArgs`/`main` 无漏改面 |
| 一致 | l4 复用 l2 隔离判法与 L1 回执字段名，新增字段仅三且已在 §3.6 逐字定义；`USAGE` 与文件头已同步 l4（§3.2 首尾两处） |
| 真实 | 依据锚点全部 ≤ `:748`（`:751`/`:752` 是实施前快照，已在 §3.1 声明）；稳定性锚点取 `skills/ctbz/scripts/派发闸.mjs:748`（`createHash("sha256")`），以冻结后重跑 l1 兑现 |

## 行动账

| A# | 动作 | 依据 | 取舍 | 证伪 |
|---|---|---|---|---|
| A1 | 定 `review_scale: 重`（8 席）↗ #8 | `skills/ctbz/scripts/派发闸.mjs:49`（`SCALE_SEATS`） | 否掉「中」：write-set 含改公共闸与主文，2.2.0 同形判重 | 跑 `grep -n SCALE_SEATS skills/ctbz/scripts/派发闸.mjs`（`派发闸.mjs:49`）无 `重: 8` 即本行失效 |
| A2 | 新增 `l4` 产物级，而非复用 l1 | `skills/ctbz/scripts/派发闸.mjs:50`（`LEVELS`） | 否掉「复用 l1 传产物清单」：l1 强制跑 `evidenceProblems`，清单无 `## 现场核对` 必红；否掉「只靠文字约定」：无强制触发点＝复刻 K4 | 产物清单跑 `--level l1` 不再报缺「现场核对」即本行失效（判红点对照 `派发闸.mjs:627`） |
| A3 | 产物清单 sha 重算放在 `artifactProblems`，接入 `:628` | `skills/ctbz/scripts/派发闸.mjs:748`（`createHash("sha256")`） | 否掉「只信回执自述 sha」：自证不优先于自述（主文 2.0.8）；否掉「并入 evidenceProblems」：E 管计划断言、l4 无计划 | 清单所列文件改一个字节后跑 l4 仍 exit 0 即本行失效 |
| A4 | l4 隔离复用 l2 判法，`blocking` 须为 0 | `skills/ctbz/scripts/派发闸.mjs:539`（`ctx.level === "l2"`） | 否掉「允许实施阵营自审」：2.2.0 实测 deepseek 席自审被 l2 判红；否掉「新建字段名」：schema 分歧即维护面翻倍 | 造 `implementer_camp == reviewer_camp` 的 l4 回执仍 exit 0 即本行失效 |
| A5 | `sixProblems` 接在 `:628` 的 l1 分支，中/重 级强制 | `skills/ctbz/scripts/派发闸.mjs:627`（`evidenceProblems`，M9 后逐字保留） | 否掉「并入 `ledgerProblems`」：账管动作可交代、六问管动手前逻辑，合并后错误提示无法区分；否掉「l2/l3 亦强制」：扩大夹具爆炸半径 | 删掉本计划 `## 构建期六问` 节后跑 l1 得 exit 0（对照 `派发闸.mjs:628`）即本行失效 |
| A6 | 除 16 行原位替换外 ↗ #12 `:1`–`:748` 逐行不变；新增块唯一落点 `:751` | `skills/ctbz/scripts/派发闸.mjs:748`（`createHash`，位于插入点之前，跨实施稳定） | 否掉「就近插入」：插入即令 §2 引用的行号漂移；否掉「追加文件末尾」：四路影子仓实测 TDZ `ReferenceError` | 实施后 `派发闸.mjs:748` 取不到 `createHash` 原文即本行失效 |
| A7 | 主文新增 2 个小节 ↗ #2，插在 `:198`/`:232` 与 `:199`/`:233` 之间 | `skills/ctbz/SKILL.md:108`（`## 反审硬门（1.8.2）`） | 否掉「追加到文末」：六问属动手前、完工自审属交付前，文末割裂时间序 | `grep -c "^## 构建期六问" skills/ctbz/SKILL.md` 得 0（对照 `SKILL.md:108`）即本行失效 |
| A8 | 补 3 个夹具构造器，消解 中/重 夹具冲突 ↗ #3 | `tests/派发闸.test.mjs:239`（`makeWs('重')`） | 否掉「放宽 sixProblems 只对新用例生效」：等于给旧夹具开后门；否掉「插件具常量于文件头」：会令 `:239` 下移、本行依据自身失效 | 跑 `node --test tests/*.test.mjs` 出现 `fail` 非 0（对照 `tests/派发闸.test.mjs:239`）即本行失效 |
| A9 | l4 回执三字段写进主文并给逐字骨架，而非改 `反审.mjs` | `skills/ctbz/scripts/派发闸.mjs:545`（`implementer_camp`） | 否掉「给 `反审.mjs` 加 l4 骨架」：扩大 write-set 且骨架器只服务 l1 四路；否掉「l4 免填三字段」：则隔离与阻塞门槛同时失效 | 按骨架抄出的 l4 回执跑 l4 若报「blocking 须为 0」或「同阵营」即本行失效（对照 `派发闸.mjs:544`） |

## 自疑（设计阶段）

| # | 假设 | 证伪实验 | 结果 |
|---|---|---|---|
| S1 | 假设新增块可追加在文件末尾 | 四路影子仓按 r1 原文追加到 `:752` 后跑 l1，全部复现 `ReferenceError: Cannot access 'SIX_HEAD' before initialization`，exit 1 | **假设错**：落点改 `:751` |
| S2 | 假设「3 处重级夹具」是完整冲突面 ↗ #3 | 实跑 `grep -c "makeWs('中')"` 得 15、`makeWs('重')` 得 3、`makeLedgerWs` 得 14 处（含定义）、`writePlan` 中/重 2 处；影子仓只补 `makeWs` 后仍 `fail 4` | **假设错**：冲突面是 3 个构造器，非 3 处调用 |
| S3 | 假设 `## 4 构建期六问` 能被 `SIX_HEAD` 命中 | 跑 `node -e 'console.log(/^##\s*构建期六问.*$/m.test("## 4 构建期六问"))'` 得 `false`；影子仓对计划本体输出「缺「## 构建期六问」小节」 | **假设错**：标题去序号（与「行动账」同规） |
| S4 | 假设「依据锚点写成 `:752`（`process.exitCode`）不影响自指」 | 影子仓补丁后 `:752` 变为插入块首行、`process.exitCode` 下移至 `:790`，跑 l1 报 `计划:行199 「A6」依据原文不符：派发闸.mjs:752 括号原文未在该行命中`，exit 1 | **假设错**：A6 依据改 `:748` |
| S5 | 假设夹具补六问只需给个合规模板 | 影子仓按「最自然猜法」造 `SIX_OK` 后跑全量测试得 `pass 106 / fail 16`；改用逐字 `sixOk(ref)` 后 `pass 122 / fail 0` | **假设错**：夹具常量必须逐字给出且锚点须在本夹具 ws 内可达 |

## 7 验收标准

| # | 标准 | 判法 |
|---|---|---|
| V1 | 六问机械闸生效 | 中/重 级夹具删六问小节 → exit 1 |
| V2 | l4 正常路径过闸 | 3 阵营回执（含三字段）+ 清单 sha 相符 → exit 0 ↗ #3 |
| V3 | l4 真实兜底生效 | 清单后改产物一字节 → exit 1 |
| V4 | l4 隔离与门槛生效 | 同阵营自审 / `blocking:1` / 缺 `blocking` / 仅 2 阵营 / `blocking:0` 但 verdicts 含「阻塞」 / `implementer_camp` 非阵营键 / 符号链接指向 ws 外 → 各 exit 1 ↗ #2 |
| V5 | 既有面不回归 | `node --test tests/*.test.mjs` → 122 通过 ↗ #122、0 失败 |
| V6 | 冻结面不动 | 硬门行 sha 与两个镜像块字节不变（`tests/主文锚点.test.mjs` 绿） |
| V7 | 自指成立 | 本计划自身 `--level l1` exit 0；产物 `--level l4` exit 0 |
| V8 | 行号零漂移 | `diff <(sed -n '1,748p' 新) <(sed -n '1,748p' 旧)` 只显示 §3.2 的 16 行；`git diff --unified=0` 仅有这 16 行变动 + `:751` 处插入 |

## 8 现场核对

| 实测 | 命令 | 结果 |
|---|---|---|
| R1 | `node --test tests/*.test.mjs`（实施前基线） | `# pass 122 / # fail 0` ↗ #122 |
| R2 | `sed -n '750,752p' skills/ctbz/scripts/派发闸.mjs` | `:752` ＝ `process.exitCode = main();` ⇒ 追加其后必 TDZ |
| R3 | `grep -c "makeWs('中')" tests/派发闸.test.mjs` | `15` ↗ #15 |
| R4 | `grep -c "makeLedgerWs" tests/派发闸.test.mjs` | `14`（1 定义 ＋ 13 调用）↗ #14 |
| R5 | `grep -n "function makeLedgerWs" tests/派发闸.test.mjs` | 命中 `:640`；其计划模板行是 `:645` |
| R6 | `grep -n "createHash" skills/ctbz/scripts/派发闸.mjs` | 命中 `:748`，sha 计算法可复用 |
| R7 | `node -e` 测 `SIX_HEAD.test("## 4 构建期六问")` | `false` ⇒ r1 自指不可达 |
| R8 | L1 第一轮四路影子仓 | 复现 TDZ `ReferenceError`、`:627` 锚点失效、`fail 4` |
| R9 | L1 第二轮四路影子仓 | 复现 `:752` 依据自杀、`SIX_OK` 首猜 `fail 16`、`node --check` SyntaxError；三类均已在本轮回修 |
| R10 | 主进程影子仓 `/tmp/shadow230` 按 §3.2/§3.4/§3.5/§3.7 逐字实施 | `node --check` 通过；`diff <(sed -n '1,748p' 新) <(sed -n '1,748p' 旧)` 恰 16 行变动（`:6`/`:12`/`:18`/`:50`/`:74`/`:79`/`:539`/`:544`/`:546`/`:589`/`:590`/`:602`/`:612`/`:618`/`:627`/`:628`） ↗ #3 |
| R11 | 影子仓全量测试 | `# tests 128 / # pass 128 / # fail 0` ↗ #128（122 基线 ＋ V9–V14 六例；V10b 并入 V10，故用例数恒为 128，独立成例则 129——判据只看 `# fail 0`） |
| R12 | 影子仓对本计划跑 `--level l1` | 仅剩回执覆盖类缺项；E/A/六问零报错 ⇒ V7 自指成立 |

## 9 迁移与回滚

| 项 | 内容 |
|---|---|
| 向后兼容 | 轻/免审级不填六问；l1/l2/l3 判法不变（仅 l1 新增六问校验）；新增 `l4` 为纯增量 |
| 既有夹具 | 夹具构造器（3 个 ↗ #3）原地插值，无行漂移，调用点无需逐个改 |
| 历史计划 | 2.0.x–2.2.x 计划缺 `## 构建期六问`，在 2.3.0 的 l1 下会被判红；不追溯、不重跑，CHANGELOG 记一行 |
| 回滚 | `git revert` 本批次提交；`l4` 为增量，回滚不影响任何既有闸 |
| 发布 | 版本 2.3.0（对外变严：新增必填小节 + 新增闸级）；CHANGELOG 加 2.3.0 段；tag `v2.3.0` |
