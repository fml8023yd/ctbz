# 取证原文（ctbz-2.2.0 行动账）

生成时间: 2026-09-23 17:30:09

## 1) 派发闸 结构（取证闸接入点与常量）
命令: grep -n "evidenceProblems\|function evidenceScanLines\|const EVIDENCE_DIR\|const NUM_CLAIM_RE\|const FILE_LINE_RE\|function runReviewLevel\|missing.push" skills/ctbz/scripts/派发闸.mjs
53:// §3.1 取证闸（2.1.0）：常量块逐字照计划；E1–E6 判定见 evidenceProblems。
54:const EVIDENCE_DIR = "docs/取证";
57:const NUM_CLAIM_RE = /(?<![.\d])\d+\s*(?:处|个|席|条|份|行|次|轮|项|类|点|步|版|倍|阵营)|(?<![\u4e00-\u9fff])[〇零一二三四五六七八九十百千万两]+\s*(?:处|个|席|条|份|行|次|轮|阵营)/g;
60:const FILE_LINE_RE = /[A-Za-z0-9_./\u4e00-\u9fff-]+\.(?:mjs|js|sh|md|json|yaml|yml|ts)[:：](\d+)(?:\s*[-–]\s*(\d+))?/g;
176:function evidenceScanLines(planText) {
233:function evidenceProblems(planText, ws) {
494:function runReviewLevel(a, ws, plan, planText, planSha) {
505:  if (sc.reason) missing.push(`✗ ${plan}: ${sc.reason}`);
509:    missing.push(`✗ ${plan}: 免审级需计划正文含非空 免审依据: 行`);
512:  missing.push(...evidenceProblems(planText, ws));
538:    if (it.reasons.length) missing.push(`✗ ${it.file}: ${it.reasons.join("；")}`);
540:  if (items.length === 0) missing.push(`✗ ${dir}: 目录不存在或为空，0 份回执`);
544:  missing.push(...problems);
596:      missing.push(`✗ ${it.file}: ${why}`);

## 2) 内审.mjs 复命段结构
命令: grep -n "FUMING_SECTIONS\|SECTION_RE\|NO_NONE\|function judgeFuming\|G9\|G10" skills/ctbz/scripts/内审.mjs
19://   - 复命 = 复命闸（G1–G9）：段标题＝行首零缩进恰为 `自主延伸:` / `自主修复:` / `待裁决:` / `自疑:` 的行，
65:const FUMING_SECTIONS = ["自主延伸", "自主修复", "待裁决", "自疑"];
66:const SECTION_RE = /^(自主延伸|自主修复|待裁决|自疑)\s*[:：]\s*$/;
73:// G7–G9（2.0.8）：自疑段的箭头计数在**原始行**上做（normalizeFuming 只做全角转半角，不转 `->`）。
228:    const m = SECTION_RE.exec(line);
261:// G9 只扫「最可能错的地方」＝首个箭头之前的文本；证据 / 命令字段不参与扫描。
275:function judgeFuming(text) {
277:  const NO_NONE = new Set(["自疑"]);   // 自疑段禁止写「无」
280:  for (const k of FUMING_SECTIONS) {
284:  for (const k of FUMING_SECTIONS) {
287:      if (NO_NONE.has(k)) errors.push(items[0].no + ": " + k + " 段不得写 " + NONE);
297:  // 自疑段跳过 G6（产物路径）：其箭头归 G8 计数，判定交 G7 / G8 / G8b / G9。
320:  // G7–G9：自疑段只认 `- ` 条目；G8b/G9 只看首个箭头之前的「最可能错的地方」。

## 3) SKILL.md 相关节
命令: grep -n "派发前必跑\|自证与自疑\|边界延伸\|复命清单模板\|数字必须有出处" skills/ctbz/SKILL.md
70:## 派发前必跑（硬闸，未过不得创建实施任务）
112:## 边界延伸（做得多、说得少）
159:**复命清单模板**（落 `<ws>/.ctbz-record/<slug>/复命.md`，由 `内审.mjs 复命` 校验；`<slug>` = 本任务短名，逐字取 `.ctbz-record/反审/` 下同级目录名，与反审落点同源）：
195:## 自证与自疑（交付前必跑）
232:**数字必须有出处**：计划里的每个数量断言（`N 处/N 个/N 席`）与每个 `文件:行号` 都必须来自跑出来的原文，写在取证文件里并以 `↗` 锚点引用；凭印象写的数字视为缺陷，由 `派发闸 --level l1` 机械拦截。

## 4) 测试基线
命令: PATH="/usr/local/bin:$PATH" /usr/local/bin/node --test "tests/*.test.mjs" | grep -E "^# (tests|pass|fail)"
# tests 109
# pass 109
# fail 0

## 5) 文件行数
命令: wc -l skills/ctbz/scripts/派发闸.mjs skills/ctbz/scripts/内审.mjs skills/ctbz/SKILL.md tests/派发闸.test.mjs tests/内审.test.mjs
     636 skills/ctbz/scripts/???.mjs
     525 skills/ctbz/scripts/??.mjs
     456 skills/ctbz/SKILL.md
     624 tests/???.test.mjs
     551 tests/??.test.mjs
    2792 total

## 6) 硬门行
命令: grep -n "所有计划实施前必须走反审协议" skills/ctbz/SKILL.md
110:所有计划实施前必�
