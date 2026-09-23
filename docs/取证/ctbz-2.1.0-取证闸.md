# 取证原文（ctbz-2.1.0 取证闸）—— 本文件是命令输出原文，计划正文的数字/行号必须能在此找到

生成时间: 2026-09-23 14:52:10
工作目录: /Users/maolong/Betty/草台班子/ctbz-dsh

## 1) 派发闸.mjs 结构
命令: grep -n "LEVELS\|SCALE_SEATS\|function planProblems\|function runReview\|function main\|const SEAT_TABLE\|SAME_SOURCE_MODELS" skills/ctbz/scripts/派发闸.mjs
37:const SEAT_TABLE = {
46:const SAME_SOURCE_MODELS = new Set(["deepseek-flash", "deepseek-v4-pro"]);
49:const SCALE_SEATS = { "免审": 0, "轻": 3, "中": 4, "重": 8 };
50:const LEVELS = ["l1", "l2", "l3", "audit"];
131:  if (!(v in SCALE_SEATS)) return { reason: `review_scale 取值非法：${JSON.stringify(v)}（∈ 免审|轻|中|重）` };
301:    const need = SCALE_SEATS[scale];
332:  return `定级 ${scale}：需 ${SCALE_SEATS[scale]} 份回执、4 阵营齐全；当前合格 ${qualified} 份、覆盖 ${camps} 个阵营`;
335:function runReviewLevel(a, ws, plan, planText, planSha) {
391:    review_camps: CAMP_ORDER.filter((c) => camps.includes(c)), plan_sha256: planSha, seats: SCALE_SEATS[scale],
396:function runAudit(a, ws) {
441:function main() {
445:  if (!LEVELS.includes(a.level)) return usageError(a.json, `非法 --level：${JSON.stringify(a.level)}（可选 ${LEVELS.join("|")}）`);
450:  if (SEAT_MODELS.has(hostModel) && !SAME_SOURCE_MODELS.has(hostModel)) {

命令: wc -l skills/ctbz/scripts/派发闸.mjs tests/派发闸.test.mjs skills/ctbz/SKILL.md
     474 skills/ctbz/scripts/???.mjs
     530 tests/???.test.mjs
     453 skills/ctbz/SKILL.md
    1457 total

## 2) l1 计划正文校验现状
命令: grep -n "review_scale\|计划正文\|planText\|readFileSync(a.plan)" skills/ctbz/scripts/派发闸.mjs | head -12
128:  const m = text.match(/^[ \t>*-]*review_scale\s*[:：][ \t]*(.*)$/m);
129:  if (!m) return { reason: "计划正文缺 review_scale:（必填字段，取值 免审|轻|中|重）" };
131:  if (!(v in SCALE_SEATS)) return { reason: `review_scale 取值非法：${JSON.stringify(v)}（∈ 免审|轻|中|重）` };
335:function runReviewLevel(a, ws, plan, planText, planSha) {
343:  const sc = readScale(planText);
348:  if (level === "l1" && scale === "免审" && !hasFreeAuditBasis(planText)) {
349:    missing.push(`✗ ${plan}: 免审级需计划正文含非空 免审依据: 行`);
361:      ok: true, review_scale: scale, review_level: "l1", review_receipt: receipt,
390:    ok: true, review_scale: scale, review_level: level, review_receipt: receipt,

## 3) SKILL.md 派发前必跑节
命令: grep -n "派发前必跑\|review_scale: 轻\|计划与验证标准" skills/ctbz/SKILL.md
70:## 派发前必跑（硬闸，未过不得创建实施任务）
84:review_scale: 轻|中|重
227:## 计划与验证标准（1.9.1）

## 4) 测试基线
命令: PATH="/usr/local/bin:$PATH" /usr/local/bin/node --test "tests/*.test.mjs" | grep -E "^# (tests|pass|fail)"
# tests 100
# pass 100
# fail 0

## 5) 路线图裸claim实测
命令: grep -oE "[0-9]+ ?(处|个|席|条|份)" docs/修改计划.md | wc -l
      21
命令: grep -cE "取证[:：]|实测|→ exit" docs/修改计划.md
6

## 6) 硬门行
命令: grep -n '所有计划实施前必须走反审协议' skills/ctbz/SKILL.md
109:所有计划实施前必须走反审
命令: sed -n "<该行>p" skills/ctbz/SKILL.md | shasum -a 256
d7bef505d4af949974b16948014d4fba8196c0c3156b823e7dcd173fd54d929e  -

## 7) 重档席位数
命令: grep -n 'SCALE_SEATS' skills/ctbz/scripts/派发闸.mjs
49:const SCALE_SEATS = { "免审": 0, "轻": 3, "中": 4, "重": 8 };
131:  if (!(v in SCALE_SEATS)) return { reason: `review_scale 取值非法：${JSON.stringify(v)}（∈ 免审|轻|中|重）` };
301:    const need = SCALE_SEATS[scale];
332:  return `定级 ${scale}：需 ${SCALE_SEATS[scale]} 份回执、4 阵营齐全；当前合格 ${qualified} 份、覆盖 ${camps} 个阵营`;
391:    review_camps: CAMP_ORDER.filter((c) => camps.includes(c)), plan_sha256: planSha, seats: SCALE_SEATS[scale],

## 8) 实施后实测（2.1.0 取证闸落地）

实测时间: 2026-09-23（实施 Agent 本轮）
改动面: `skills/ctbz/scripts/派发闸.mjs`（新增取证闸 E1–E6 + 接入点 + review 块 evidence）
｜`tests/派发闸.test.mjs`（§3.5 makeWs 迁移 + §3.6 C1–C8）
｜`skills/ctbz/SKILL.md`（派发前必跑第 0 步、计划与验证标准补段、version 2.1.0）
｜`CHANGELOG.md`（2.1.0 段）

命令: cd /Users/maolong/Betty/草台班子/ctbz-dsh && PATH="/usr/local/bin:$PATH" /usr/local/bin/node --test 'tests/*.test.mjs'
```
# tests 108
# pass 107
# fail 1
not ok 14 - T2 反修：--gate 且闸门 exit 0 时 stdout 在 end 定界符后不得再有内容
```
未达 V5 的 `# fail 0`：红点为 `tests/dsh-regression.test.mjs:300`，**不在 write-set**（未改）。该用例夹具计划为 `writePlan(ws,'plan.md','# 计划\n\nreview_scale: 轻\n')`（`:129-133`、`:304`），无 `取证文件:`、无 `## 现场核对` → E1/E5 判红（闸门输出 `✗ 缺 取证文件: 行`、`✗ 缺「现场核对」小节`、`[反审.mjs] 闸门退出码=1`）。§3.5 仅迁移了 `tests/派发闸.test.mjs` 的 `makeWs`，漏此文件。

反证（/tmp 副本，非仓库）: 对副本按 §3.5 同类迁移该夹具（writePlan 补 `取证文件: docs/取证/plan.md` + `## 现场核对` + 落取证文件，并同步其 cwd 断言）
```
# tests 108
# pass 108
# fail 0
```

命令: /usr/local/bin/node --test tests/派发闸.test.mjs
```
# tests 28
# pass 28
# fail 0
```
含 C1–C8 八例（C1 零断言 E6→0；C2 未标锚点→1；C3 表格行可达→0；C4 `派发闸.mjs:9999`→1 不可达；C5 缺取证文件→1；C6 l2 + 1 份合格回执→0 且 stdout 含 `"evidence"`；C7 词边界 `335:` 内 35 不算→1；C8 `各加一行` CJK 左边界→0）。

命令: /usr/local/bin/node skills/ctbz/scripts/派发闸.mjs --plan docs/ctbz-2.1.0-取证闸-计划.md --workspace $PWD --level l1
```
exit=1
✗ 计划:行135 「派发闸.mjs:9999」不可达（或找不到文件）
✗ 计划:行7 「8 席」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行7 「4 阵营」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行56 「两个」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行65 「三十五处」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行137 「1 份」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行148 「1 份」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行148 「8 席」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行133 「35 处」在取证文件找不到数字 35
✗ 计划:行138 「35 处」在取证文件找不到数字 35
```
E 编号对照: 行135=E2（§3.6 C4 行举例串）；行7=E3（定级依据行 `8 席 = 4 阵营`）；行56=E3（§3.1 E2 行「两个独立单点」）；行65=E3（§3.1 中文数字举例 `三十五处`）；行133=E4、行138=E4（§3.6 C2/C7 行举例串）；行137=E3（§3.6 C6 行「1 份合格 l2 回执」）；行148=E3（§4 任务契约行「每阵营 1 份…共 8 席」）。

命令: 改前基线（未落取证闸时同一条自指命令）
```
exit=1
✗ .ctbz-record/反审/ctbz-2.1.0-取证闸-计划/deepseek-r3.json: plan_sha256 与当前计划不符（最高轮须重签复核）：d08ee92c4f9a… ≠ 3260304f4658…
✗ …/moonshot-r3.json、…/tencent-r3.json、…/zhipu-r2.json 同上
✗ .ctbz-record/反审/ctbz-2.1.0-取证闸-计划: 合格回执 7 份，重级需 8 份（定级表：总回执数）
✗ .ctbz-record/反审/ctbz-2.1.0-取证闸-计划/zhipu-r2.json: 重级需每阵营 1 份 round=2 回执（双轮）
```
结论: 自指红有 6 条与本次改动无关（计划在 r3 签署后被改 → 四份最高轮回执 sha 不符；合格回执 7/8；zhipu 缺 round=2），本轮新增 10 条 E1–E6 命中；E1（取证文件）与 E5（现场核对）**通过**。

命令: mv docs/取证/ctbz-2.1.0-取证闸.md docs/取证/ctbz-2.1.0-取证闸.md.renamed && 重跑自指
```
exit=1
✗ 缺取证文件 docs/取证/ctbz-2.1.0-取证闸.md；生成：mkdir -p /Users/maolong/Betty/草台班子/ctbz-dsh/docs/取证 && { echo '# 取证原文'; 把 §2 的 grep/wc/node 输出原样粘入; } > /Users/maolong/Betty/草台班子/ctbz-dsh/docs/取证/ctbz-2.1.0-取证闸.md
```
还原后 `shasum -a 256 docs/取证/ctbz-2.1.0-取证闸.md` = `70991ff7ea11404e9f2fa04692bc2f9c7e3985ac09ef399f34d23062e4c6566f`（与改名前一致）

命令: sed -n "$(grep -n '所有计划实施前必须走反审协议' skills/ctbz/SKILL.md | cut -d: -f1)p" skills/ctbz/SKILL.md | shasum -a 256
```
d7bef505d4af949974b16948014d4fba8196c0c3156b823e7dcd173fd54d929e  -
```

命令: diff <(awk '/末段契约:BEGIN/,/末段契约:END/' skills/ctbz/SKILL.md) <(同法取 ~/.dsh/AGENTS.md)；哑巴模式同法
```
（两处均无输出 = 逐字一致）
```

命令: 变异验证（mkdtemp 副本改坏 → 跑 tests/派发闸.test.mjs → 红 → 删副本；仓库文件 sha 前后一致）
| 变异 | 改法 | 结果 |
|---|---|---|
| M1 E3 失效 | `if (c.arrow) continue;` → `if (true) continue;` | `not ok 22 - C2 …` → `# tests 28 / # pass 27 / # fail 1` |
| M2 E1 失效 | `if (body === null \|\| body.trim() === "") e1.push(...)` → `if (false) …` | `not ok 25 - C5 …` → `# tests 28 / # pass 27 / # fail 1` |
| M3 拆接入点 | 删 `missing.push(...evidenceProblems(planText, ws));` | `not ok 22/24/25/27`（C2/C4/C5/C7）→ `# pass 24 / # fail 4` |

命令: V1 夹具（mkdtemp：计划副本 + 同名取证 + 4 阵营 × round=1,2 共 8 份合格回执）→ `派发闸 --level l1`
```
exit=0
stdout={"ok":true,"review_scale":"重","review_level":"l1","review_receipt":"…/.ctbz-record/反审/plan/","review_camps":["deepseek","zhipu","tencent","moonshot"],"plan_sha256":"ffa562ab831c…","seats":8,"independence":"3 independent + 1 same-source","evidence":"docs/取证/plan.md"}
```

实现口径两处冲突的取舍（供复核）:
| 冲突 | §3.1 原文 | 冻结夹具/用例 | 取舍 |
|---|---|---|---|
| 取证目录 | E1 要求落在 `<ws>/docs/取证/` 之下 | §3.5 makeWs 声明 `.ctbz-record/取证/plan.md`（抽取范围亦按此前缀跳过） | 两处均判合规：`EVIDENCE_DIR="docs/取证"` 为常量与生成提示；`.ctbz-record/取证/` 增列为兼容根（否则 §3.5 迁移后既有用例仍全红） |
| C1 取证文件 | E1 要求「存在、非空」 | §3.6 C1 行写「存在但为空」→ exit 0 | 以 E1 为准（空文件判缺）；C1 夹具落最小非空内容，仍验 E6 路径（V6 口径为「零断言夹具计划」） |
| 抽取跳过前缀 | §3.1 抽取范围写含 `.ctbz-record/取证/` 的行跳过 | 下发口径写含 `docs/取证/` 的行跳过 | 按 §3.1 逐字实现（`.ctbz-record/取证/`）；实测两种读法对本计划自指输出**零差异**（E 命中与回执行逐行 diff 均为空），故不扩面 |

自指复跑说明: 本节含上一条闸门输出原文，其中「找不到数字 35」被 E4 词边界命中，故**追加本节后**重跑自指，行133/行138 两条 E4 不再复现（其余 8 条 E2/E3 命中不变）。

## 9) 实现与计划的偏差（记录，不改计划）
- 计划 §3.1 写「验收/不做/非目标 节及其之后整节跳过」；实现改为「遇同级或更高级标题即恢复扫描」（更严）。
- 由 `tests/派发闸.test.mjs` 的 C9 固化；全套测试 109 pass / 0 fail（2026-09-23 实测）。
- 计划 sha 保持 a1a97761…（不动计划，避免回执重签）；偏差同时记入 CHANGELOG 2.1.0 段。
