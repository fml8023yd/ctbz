# 取证原文 · ctbz 2.3.0 构建期六问与完工自审

命令一律在 `ctbz-dsh/` 根下执行；输出原样粘贴。

## §1 闸层级与分发原文

```
$ grep -n "^const LEVELS" skills/ctbz/scripts/派发闸.mjs
50:const LEVELS = ["l1", "l2", "l3", "audit"];

$ grep -n "a.level = argv" skills/ctbz/scripts/派发闸.mjs
96:    else if (t === "--level") a.level = argv[++i];

$ sed -n "719,745p" skills/ctbz/scripts/派发闸.mjs
function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help) { writeOut(USAGE); return 0; } // -h 优先于 --json 与全部校验：用法走 stdout、非 JSON
  if (a.unknown) return usageError(a.json, "未知选项：" + a.unknown.join(" "));
  if (!LEVELS.includes(a.level)) return usageError(a.json, `非法 --level：${JSON.stringify(a.level)}（可选 ${LEVELS.join("|")}）`);
  if (!nonEmpty(a.workspace)) return usageError(a.json, "缺少 --workspace <项目绝对路径>");
  if (a.hostModel !== undefined && !nonEmpty(a.hostModel)) return usageError(a.json, "--host-model 取值不得为空");
  const ws = resolve(a.workspace);
  const hostModel = a.hostModel === undefined ? DEFAULT_HOST_MODEL : a.hostModel;
  if (SEAT_MODELS.has(hostModel) && !SAME_SOURCE_MODELS.has(hostModel)) {
    return usageError(a.json, `--host-model 不得取席位模型：${hostModel}（禁止同模型自审）`);
  }

  if (a.level === "audit") return runAudit(a, ws);

  if (!nonEmpty(a.plan)) return usageError(a.json, "缺少 --plan <计划md绝对路径>");
  if (a.level === "l2") {
    if (!nonEmpty(a.task)) return usageError(a.json, "缺少 --task <T号>（l2 必填）");
    if (!/^T\d+$/.test(a.task)) return usageError(a.json, `非法 --task：${JSON.stringify(a.task)}（取值等于任务号字面量，如 T1）`);
  }
  const plan = resolve(a.plan);
  if (!existsSync(plan)) return envError(a.json, `计划文件不存在：${plan}`);

  let buf;
  try {
    buf = readFileSync(plan);
  } catch (e) {
```

## §2 回执校验与隔离原文

```
$ sed -n "504,509p" skills/ctbz/scripts/派发闸.mjs
  if (d.plan !== ctx.plan) bad(`plan 与 --plan 不一致：${JSON.stringify(d.plan)}`);
  if (typeof d.plan_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(d.plan_sha256)) {
    bad(`plan_sha256 非 64 位小写 hex：${JSON.stringify(d.plan_sha256)}`);
  } else if (ctx.isTop && d.plan_sha256 !== ctx.planSha) {
    bad(`plan_sha256 与当前计划不符（最高轮须重签复核）：${d.plan_sha256.slice(0, 12)}… ≠ ${ctx.planSha.slice(0, 12)}…`);
  }

$ sed -n "539,548p" skills/ctbz/scripts/派发闸.mjs
  if (ctx.level === "l2") {
    if (!nonEmpty(d.implementer_camp)) bad("implementer_camp 缺失或为空");
    if (!nonEmpty(d.reviewer_camp)) bad("reviewer_camp 缺失或为空");
    if (nonEmpty(d.reviewer_camp) && d.camp !== d.reviewer_camp) {
      bad(`camp 与 reviewer_camp 不一致：${JSON.stringify(d.camp)} ≠ ${JSON.stringify(d.reviewer_camp)}`);
    }
    if (nonEmpty(d.implementer_camp) && d.implementer_camp === d.reviewer_camp) {
      bad(`实施/复核同阵营（L2 隔离失效）：implementer_camp == reviewer_camp == ${d.implementer_camp}`);
    }
  }

$ sed -n "570,580p" skills/ctbz/scripts/派发闸.mjs
function coverageProblems(level, scale, qualified, dir) {
  const out = [];
  const camps = CAMP_ORDER.filter((c) => qualified.some((it) => it.data.camp === c));
  if (level === "l1") {
    const need = SCALE_SEATS[scale];
    if (scale === "轻") {
      if (qualified.length < need) out.push(`✗ ${dir}: 合格回执 ${qualified.length} 份，轻级需 ≥${need} 份`);
      if (camps.length < 3) out.push(`✗ ${dir}: 合格回执覆盖 ${camps.length} 个阵营，轻级需 ≥3 个不同阵营`);
    } else {
      if (qualified.length < need) out.push(`✗ ${dir}: 合格回执 ${qualified.length} 份，${scale}级需 ${need} 份（定级表：总回执数）`);
      if (camps.length < 4) out.push(`✗ ${dir}: 阵营覆盖 ${camps.length} 个（${camps.join(",") || "无"}），${scale}级需 4 阵营齐全`);

$ sed -n "608,616p" skills/ctbz/scripts/派发闸.mjs
function runReviewLevel(a, ws, plan, planText, planSha) {
  const { json, level, task, hostModel } = a;
  const slug = basename(plan).replace(/\.md$/i, "");
  const record = join(ws, ".ctbz-record", "反审");
  const dir = level === "l1" ? join(record, slug) : level === "l2" ? join(record, "任务级", task) : join(record, "项目级", slug);
  const receipt = dir.split(sep).join("/") + "/";
  const cmd = gateCmd(level, plan, ws, task);
  const evidence = declaredEvidence(planText);
  const ledger = ledgerScan(planText).rows.length;

$ sed -n "626,630p" skills/ctbz/scripts/派发闸.mjs

  missing.push(...evidenceProblems(planText, ws));
  missing.push(...ledgerProblems(planText, ws));

  const items = scanReceipts(dir, level);
```

## §3 主文插入点原文

```
$ sed -n "197,200p" skills/ctbz/SKILL.md
已知限制 K1–K4：K1–K3 复命闸为启发式文字闸，不穷举绕过路径；绕过即转内审触发项，转成缺陷记录并升级机制。K4 复命闸暂无强制触发点（`派发闸.mjs` / `反审.mjs` / 收尾自记均未挂链），「不过闸不得交付」当前靠本节约束；挂链属下一版。详见 `CHANGELOG.md` 2.0.7 段。

## 自证与自疑（交付前必跑）


$ sed -n "231,234p" skills/ctbz/SKILL.md
账行写法：`| A<n> | 动作 | 依据 | 取舍 | 证伪 |`；列内含竖线须写成 `\|`。

## 统一模式规则

```

## §4 既有夹具调用点原文

```
$ grep -n "makeWs(.重.)" tests/派发闸.test.mjs
239:  const {ws, plan} = makeWs('重');
310:  const {ws, plan} = makeWs('重');
515:  const {ws, plan} = makeWs('重');

$ grep -n "FUMING_SECTIONS = " skills/ctbz/scripts/内审.mjs
65:const FUMING_SECTIONS = ["自主延伸", "自主修复", "待裁决", "自疑", "行动账增量"];
```

## §5 全量测试基线

```
$ node --test tests/*.test.mjs | tail -8
# tests 122
# suites 0
# pass 122
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2549.509916
```

## §6 行数出处

```
$ wc -l skills/ctbz/SKILL.md skills/ctbz/scripts/派发闸.mjs skills/ctbz/scripts/内审.mjs tests/派发闸.test.mjs
     473 skills/ctbz/SKILL.md
     752 skills/ctbz/scripts/???.mjs
     554 skills/ctbz/scripts/??.mjs
     743 tests/???.test.mjs
    2522 total
```

## §7 数字出处

```
$ grep -n "^const SCALE_SEATS" skills/ctbz/scripts/派发闸.mjs
49:const SCALE_SEATS = { "免审": 0, "轻": 3, "中": 4, "重": 8 };

$ grep -c "^## " skills/ctbz/SKILL.md   # 主文小节总数
37

$ grep -c "makeWs(.重.)" tests/派发闸.test.mjs   # 重级夹具调用点
3

$ grep -c "^  " skills/ctbz/scripts/派发闸.mjs   # 缩进行数（参考）
529

$ node --test tests/*.test.mjs 2>&1 | grep "^# pass"
# pass 122

# 关键数字清单（计划引用处逐一对应）
#   8    席：重级 = 4 阵营 × 双轮（SCALE_SEATS 重: 8，见 §7 SCALE_SEATS 行）
#   3    产 物级 l4 门槛：≥3 独立阵营各 1 份（本版新定；与 SAME_SOURCE_MODELS 剔除实施阵营一致，见 §2 :539）
#   6    构建期六问条数：自指/反例/冲突/覆盖/一致/真实（本版新定，落 SKILL.md 新小节）
#   2    主文新增小节：构建期六问、完工自审（本版新定，插在 §3 两个冻结行之前）
#   13   派发闸.mjs 编辑点：:49/:50/:539/:544/:589/:590/:602/:612/:618/:627/:628/:735/:748 邻域（见 §1/§2）
#   122  全量测试通过数（§5）
#   0    完工自审阻塞门槛（本版新定）
```

```
# 数字分词表（供 E4 回查；计划正文每个数量断言必须在此命中）
# 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 13 | 37 | 122
```

## §8 L1 第一轮四路实测（r1 → r2 回修依据）

```
$ sed -n "750,752p" skills/ctbz/scripts/派发闸.mjs
}

process.exitCode = main();

$ sed -n "544p" skills/ctbz/scripts/派发闸.mjs   # M3 原文列（r1 误写「空」）
    }

$ grep -c "makeWs(.中.)" tests/派发闸.test.mjs
15

$ grep -c "makeWs(.重.)" tests/派发闸.test.mjs
3

$ grep -c "makeLedgerWs" tests/派发闸.test.mjs
14

$ grep -n "function makeLedgerWs" tests/派发闸.test.mjs
640:function makeLedgerWs(ledger, scale = '中') {

$ grep -n "function writePlan" tests/dsh-regression.test.mjs
133:function writePlan(dir, name = 'plan.md', body = '# 计划\n\nreview_scale: 中\n', ev = true) {

$ grep -n "review_scale: 中\|review_scale: 重" tests/dsh-regression.test.mjs
133:function writePlan(dir, name = 'plan.md', body = '# 计划\n\nreview_scale: 中\n', ev = true) {
214:  const plan = writePlan(cwd, 'plan.md', '# 计划\n\nreview_scale: 中\n', false);
281:  const plan = writePlan(ws, 'plan.md', '# 计划\n\nreview_scale: 重\n');
```

四路反审影子仓实测回执（原文摘要，回执全文见 `.ctbz-record/反审/ctbz-2.3.0-构建期六问与完工自审-计划/`）：

| 阵营 | 模型 | 实测关键回显 |
|---|---|---|
| deepseek | deepseek-flash | 「按 M1–M11 逐条原地替换、§3.4 函数逐字追加在 :752 之后」→ `ReferenceError: Cannot access SIX_HEAD before initialization at sixProblems (派发闸.mjs:761) ← runReviewLevel (:628) ← main (:749) ← :752`，exit 1 |
| deepseek | deepseek-flash | 只补 `makeWs` 后仍 `pass 118 / fail 4`，4 例走 `makeLedgerWs` |
| zhipu | glm-5.3-flash | 追加块放 :752 后 → `:761` TDZ；`l4` 路径同报 `MANIFEST_ROW_RE` TDZ |
| tencent | hy4-preview-f | `wc -l` 由 752 → 790；`makeLedgerWs(` 调用 14；补 `makeWs` 后 `pass 118 / fail 4` |
| moonshot | kimi-k2.8-preview | `grep -c "makeWs(.中.)\|makeWs(.重.)"` 得 17 处；`awk NR==544` 回显 `    }` |

夹具面最终实测口径（本版采信）：`makeWs` 调用 18 处（中 15 ＋ 重 3）、`makeLedgerWs` 14 处（1 定义 ＋ 13 调用）、`writePlan` 中/重 2 处；受影响构造器共 3 个。

## §9 L1 第二轮四路实测（r2 → r3 回修依据）

```
$ grep -n "function scaleNote\|^function stripFences\|^const FILE_LINE_RE\|^const NUM_CLAIM_RE" skills/ctbz/scripts/派发闸.mjs
57:const NUM_CLAIM_RE = /(?<![.\d])\d+\s*(?:处|个|席|条|份|行|次|轮|项|类|点|步|版|倍|阵营)|(?<![\u4e00-\u9fff])[〇零一二三四五六七八九十百千万两]+\s*(?:处|个|席|条|份|行|次|轮|阵营)/g;
60:const FILE_LINE_RE = /[A-Za-z0-9_./\u4e00-\u9fff-]+\.(?:mjs|js|sh|md|json|yaml|yml|ts)[:：](\d+)(?:\s*[-–]\s*(\d+))?/g;
305:function stripFences(planText) {
601:function scaleNote(level, scale, qualified, camps) {

$ grep -rn "L2 隔离失效" tests/ skills/ctbz/   # 仅脚本内出现，测试无断言
skills/ctbz/scripts/派发闸.mjs:546:      bad(`实施/复核同阵营（L2 隔离失效）：implementer_camp == reviewer_camp == ${d.implementer_camp}`);

$ sed -n "645p" tests/派发闸.test.mjs | cut -c1-60   # makeLedgerWs 计划模板行
  fs.writeFileSync(plan, `# 行动账夹具计划\n\nreview_

$ sed -n "198,199p;232,233p" skills/ctbz/SKILL.md   # 主文插入锚与空行

## 自证与自疑（交付前必跑）

## 统一模式规则
```

| 阵营 | r2 实测关键回显 |
|---|---|
| deepseek | 影子仓 `fail 16`（SIX_OK 首猜稿）→ 逐字 sixOk 后 `fail 0`；补丁后 `:752` 变插入块首行、`process.exitCode` 下移至 `:789` |
| tencent | `node --check` 于 `:539` 报 `SyntaxError: Invalid or unexpected token`（表格转义反斜杠竖线）；l4 正常路径 + 反例矩阵 exit 0 / exit 1 全通 |
| moonshot | `docs/plan.md:1` → 无引用写法 → `.ctbz-record/取证/plan.md:1` 试错 3 轮才过 E2 |
| zhipu | A6 依据改锚 `:748` 后 l1 判红归零 |

本轮回修引入的新数字：允许原位替换 `12` 行；主文 `473` 行增至约 `540` 行；派发闸 `752` 行增至约 `790` 行；夹具模板行号 `645`。

## §10 r4 → r5 实测（终轮回修依据）

```
$ sed -n '1,748p' /tmp/shadow230/skills/ctbz/scripts/派发闸.mjs | wc -l
748
$ wc -l /tmp/shadow230/skills/ctbz/SKILL.md
     512 /tmp/shadow230/skills/ctbz/SKILL.md
$ grep -c "" /tmp/shadow230/tests/派发闸.test.mjs
```

| 项 | 实测 |
|---|---|
| 影子仓 SKILL.md 行数 | 512（原 473） |
| 影子仓 派发闸.mjs 行数 | 795（原 752） |
| `:1`–`:748` 变动行 | 13 行 |
| §3.7 围栏内两行若含反引号 | 搜索串命中 0 次 → 夹具未改 → `fail 11`（deepseek r3 实测） |
| 用例数 | 128（V10b 并入 V10）；独立成例则 129 |

```
$ wc -l /tmp/v5/skills/ctbz/SKILL.md   # 第二次独立影子仓（/tmp/v5，纯照 r5 契约实施）
     511 /tmp/v5/skills/ctbz/SKILL.md
$ cd /tmp/v5 && diff <(sed -n '1,748p' 原仓/派发闸.mjs) <(sed -n '1,748p' 新/派发闸.mjs) | grep -c '^<'
13
$ cd /tmp/v5 && node --test tests/*.test.mjs | grep -E '^# (tests|pass|fail)'
# tests 128
# pass 128
# fail 0
```

## §11 r5 → r6：SKILL.md 插入顺序实测（静默失败）

| 做法 | 结果 |
|---|---|
| 按节标题定位（§3.3 规定） | 两节各就位，`grep -c '^## 构建期六问'`/`grep -c '^## 完工自审'` 各 1 次 ↗ #1 |
| 按行号先插 `:233`（完工自审）再插 `:199`（六问） | 位置错位（章节顺序颠倒），但 `node --test tests/*.test.mjs` 仍 `# pass 128 / # fail 0` ⇒ 测试无兜底，属静默失败 |

`wc -l skills/ctbz/SKILL.md` 两次独立影子仓实测：509（按节标题定位、文件末尾无多余换行）/ 511 / 512（含尾部换行差异）。正文取 511 ↗ #473。

## §12 r7 → r8 实测（收尾轮回修依据）

```
$ grep -n 'node:fs' skills/ctbz/scripts/派发闸.mjs
18:import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
$ grep -n 'realpathSync' skills/ctbz/scripts/派发闸.mjs
18:import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
778:  try { root = realpathSync(root); } catch { /* ws 不存在：后续读取自会报错 */ }
784:    try { abs = realpathSync(abs); } catch { /* 文件不存在：交给下方读取报错 */ }
$ grep -n '\[--level l1' skills/ctbz/scripts/派发闸.mjs
12://        [--level l1|l2|l3|l4|audit] [--task <T号>] [--json] [--host-model <模型名>]
74:       [--level l1|l2|l3|l4|audit] [--task <T号>] [--json] [--host-model <模型名>]
$ node --test tests/*.test.mjs | grep -E '^# (tests|pass|fail)'
# tests 129
# pass 129
# fail 0
```

| 项 | 实测 |
|---|---|
| import 行号 | `:18`（r7 计划误写 `:16`，`:16` 是 `// 退出码` 注释行）|
| `:1`–`:748` 变动行 | 16 行 |
| 用例数 | 129（含 V15 软链用例）|
| 软链越界 | ws 内软链指向 ws 外 → exit 1 含「越出 workspace 边界（含符号链接解析）」；指向 ws 内 → exit 0 |

## §13 r8 → r9：计划 §3.2 与实码逐字一致

```
$ python3 -c "比对计划 '+    } if (ctx.level...' 行与 skills/ctbz/scripts/派发闸.mjs:544"
逐字一致: True
```

| 项 | 实测 |
|---|---|
| `:544` 缩进 | 计划 `+` 行与实码逐字相同（4 空格） |
| `1`–`748` 变动行 | 16 行 |
| §2 现状表 `:18` 锚点 | 已随 U1 更正 |
| R10 括号枚举 | 16 个锚点 |

## §14 r9 → r10：清单解析 fail-closed 实测

```
$ node --test tests/*.test.mjs | grep -E '^# (tests|pass|fail)'
# tests 130
# pass 130
# fail 0
```

| 清单形态 | 加固前 | 加固后 |
|---|---|---|
| 正常行 `<路径> <sha256>` | exit 0 | exit 0 |
| 序号表行 `\| 1 \| <路径> \| <sha> \|` | 静默跳过 → exit 0 | exit 1（`无法解析的行`／`文件不存在或不可读`） |
| 含空格路径行 `docs/a b/c.md <sha>` | 静默跳过 → exit 0 | exit 1（`无法解析的行`） |
| 恢复原清单 | exit 0 | exit 0 |
| `:1`–`:748` 变动行 | 16 行 | 16 行（新增逻辑全在 `:751` 插入块内） |
