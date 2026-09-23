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
110:所有计划实施前必须走反审协议（按规模分级）；快速模式验证性产出为例外（转正需反审）；倒计时/自动模式授权不得替代反审执行。反审必含硬问题【新鲜 Agent 测试】："把计划单独给一个没读过任何上下文的 Agent，能不能不问问题就开工？"卡住点=计划欠的具体性，补齐才过。反审通过的计划下一步只能派发，主会话不得自己执行（"写完计划自己开工"违规）；普通与自动模式的小修复也保留独立反审。

## 7) 实施后实测（2.2.0 实施 Agent，2026-09-23）

原文件末尾半行（`110:所有计划实施前必` + 截断字节 \xe9\xa1，UTF-8 不完整）已删除；第 6 节该行按重跑的 grep 输出补全（命令与输出见上）。

### 7.1 全量回归
命令: PATH="/usr/local/bin:$PATH" /usr/local/bin/node --test 'tests/*.test.mjs' | grep -E "^# (tests|pass|fail)"
# tests 122
# pass 122
# fail 0

### 7.2 V1–V5 / V8–V11（派发闸，mkdtemp 夹具）
命令: node --test --test-name-pattern "^V1 " tests/派发闸.test.mjs
ok 1 - V1 账齐备通过：合法账行 + 4 份合格回执 → exit 0 且 payload 带 ledger
# tests 1
# pass 1
# fail 0

命令: node --test --test-name-pattern "^V2 " tests/派发闸.test.mjs
ok 1 - V2 无回执 → exit 1 且输出含可直接执行的补齐命令；补 4 份合格 → exit 0
ok 2 - V2 缺账被拦：删 \#\# 行动账 小节 → exit 1 含「缺「行动账」小节」
# tests 2
# pass 2
# fail 0

命令: node --test --test-name-pattern "^V3 " tests/派发闸.test.mjs
ok 1 - V3 同源豁免：deepseek 席放行、其余三席同源仍拒、--host-model 取非豁免席位模型 exit 2
ok 2 - V3 空话取舍被拦；反例「否掉了『无缓存』方案」放行
# tests 2
# pass 2
# fail 0

命令: node --test --test-name-pattern "^V4 " tests/派发闸.test.mjs
ok 1 - V4 旧计划不可复用：改计划后仅最高轮回执被判 sha 不符
ok 2 - V4 依据不可达被拦：派发闸.mjs:9999 → exit 1 含「依据不可达」
# tests 2
# pass 2
# fail 0

命令: node --test --test-name-pattern "^V5 " tests/派发闸.test.mjs
ok 1 - V5 L2 隔离可判：implementer_camp == reviewer_camp 拒；不同阵营过
ok 2 - V5 免审短路前接入：免审级缺行动账 → exit 1 含「缺「行动账」小节」
# tests 2
# pass 2
# fail 0

命令: node --test --test-name-pattern "^V8 " tests/派发闸.test.mjs
ok 1 - V8 取舍未含被否候选被拦：「方案A 更好」→ exit 1 含「取舍未含被否候选」
# tests 1
# pass 1
# fail 0

命令: node --test --test-name-pattern "^V9 " tests/派发闸.test.mjs
ok 1 - V9 证伪不可执行被拦：「若不行则失效」→ exit 1 含「证伪不可执行」
# tests 1
# pass 1
# fail 0

命令: node --test --test-name-pattern "^V10 " tests/派发闸.test.mjs
ok 1 - V10 围栏内账行不计入（A0）
# tests 1
# pass 1
# fail 0

命令: node --test --test-name-pattern "^V11 " tests/派发闸.test.mjs
ok 1 - V11 行号真内容假被拦：派发闸.mjs:520（NUM_CLAIM_RE）→ exit 1 含「依据原文不符」
# tests 1
# pass 1
# fail 0

补充用例（A2 转义竖线 / A3 正例 / A2 未转义竖线）:
命令: node --test --test-name-pattern "^(A2|A3) " tests/派发闸.test.mjs
ok 1 - A3 正例：依据 文件:行号 + 紧跟括号原文且该行命中 → exit 0（不误杀真内容）
ok 2 - A2 未转义竖线：列内含裸 | 致段数 6 → exit 1 含「列含未转义竖线」
ok 3 - A2 转义竖线：列内 \\| 按占位符法还原、不切错列 → exit 0
# tests 3
# pass 3
# fail 0

### 7.3 V6（内审.mjs 复命 五段 + G10）
命令: node skills/ctbz/scripts/内审.mjs 复命 --file <夹具>/五段.md
✓ 复命闸通过
exit=0
命令: node skills/ctbz/scripts/内审.mjs 复命 --file <夹具>/缺五段.md
✗ 0: 缺段标题「行动账增量:」
exit=1
命令: node skills/ctbz/scripts/内审.mjs 复命 --file <夹具>/缺证伪.md
✗ 18: 行动账增量缺 证伪: 或取值为空
exit=1
命令: node skills/ctbz/scripts/内审.mjs 复命 --file <夹具>/空话取舍.md
✗ 18: 行动账增量 取舍为空话（整值等于词表任一项）
exit=1
命令: node skills/ctbz/scripts/内审.mjs 复命 --file <夹具>/全齐.md
✓ 复命闸通过
exit=0
命令: node --test --test-name-pattern '^V6 ' tests/内审.test.mjs
ok 1 - V6 复命五段：全齐 exit 0；缺第 5 段报缺段标题；非 无 缺字段/取舍空话 exit 1
# tests 1
# pass 1
# fail 0

### 7.4 V7 既有回归拆开跑 + 硬门行 + 镜像块
命令: node --test tests/派发闸.test.mjs
# tests 41
# pass 41
# fail 0
命令: node --test tests/内审.test.mjs
# tests 34
# pass 34
# fail 0
命令: node --test tests/主文锚点.test.mjs
# tests 13
# pass 13
# fail 0
命令: node --test tests/dsh-regression.test.mjs
# tests 17
# pass 17
# fail 0
命令: sed -n "110p" skills/ctbz/SKILL.md | shasum -a 256
d7bef505d4af949974b16948014d4fba8196c0c3156b823e7dcd173fd54d929e  -
期望: d7bef505d4af949974b16948014d4fba8196c0c3156b823e7dcd173fd54d929e
命令: diff <(末段契约块) <(哑巴模式块) 两文件对照
末段契约: 两处逐字一致
哑巴模式: 两处逐字一致

### 7.5 自指：闸门跑本计划（计划 sha 0c088c47c59efc460269453e8a7fbb14b09087ad795daca67046905f9b48a42f）
命令: node skills/ctbz/scripts/派发闸.mjs --plan docs/ctbz-2.2.0-行动账-计划.md --workspace $PWD --level l1
✗ 计划:行11 「2 处」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行13 「3 席」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行13 「六行」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行14 「3 席」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行14 「8 席」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行20 「3 席」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行23 「3 个」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行29 「8 席」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行34 「18 行」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行34 「23 行」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行129 「一行」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行130 「一行」未标取证锚点（同行加 ↗ #<锚点>）
✗ 计划:行29 「A1」证伪不可执行
✗ 计划:行30 「A2」依据原文不符：派发闸.mjs:233 括号原文未在该行命中
✗ 计划:行31 「A3」依据原文不符：派发闸.mjs:520 括号原文未在该行命中
✗ 计划:行32 「A4」证伪不可执行
✗ 计划:行33 「A5」证伪不可执行
✗ /Users/maolong/Betty/草台班子/ctbz-dsh/.ctbz-record/反审/ctbz-2.2.0-行动账-计划/deepseek-r2.json: plan_sha256 与当前计划不符（最高轮须重签复核）：67226b3a77a1… ≠ 0c088c47c59e…
✗ /Users/maolong/Betty/草台班子/ctbz-dsh/.ctbz-record/反审/ctbz-2.2.0-行动账-计划/moonshot-r2.json: plan_sha256 与当前计划不符（最高轮须重签复核）：67226b3a77a1… ≠ 0c088c47c59e…
✗ /Users/maolong/Betty/草台班子/ctbz-dsh/.ctbz-record/反审/ctbz-2.2.0-行动账-计划/tencent-r2.json: plan_sha256 与当前计划不符（最高轮须重签复核）：67226b3a77a1… ≠ 0c088c47c59e…
✗ /Users/maolong/Betty/草台班子/ctbz-dsh/.ctbz-record/反审/ctbz-2.2.0-行动账-计划/zhipu-r2.json: plan_sha256 与当前计划不符（最高轮须重签复核）：67226b3a77a1… ≠ 0c088c47c59e…
✗ /Users/maolong/Betty/草台班子/ctbz-dsh/.ctbz-record/反审/ctbz-2.2.0-行动账-计划: 合格回执 4 份，重级需 8 份（定级表：总回执数）
✗ /Users/maolong/Betty/草台班子/ctbz-dsh/.ctbz-record/反审/ctbz-2.2.0-行动账-计划/deepseek-r2.json: 重级需每阵营 1 份 round=2 回执（双轮）
✗ /Users/maolong/Betty/草台班子/ctbz-dsh/.ctbz-record/反审/ctbz-2.2.0-行动账-计划/zhipu-r2.json: 重级需每阵营 1 份 round=2 回执（双轮）
✗ /Users/maolong/Betty/草台班子/ctbz-dsh/.ctbz-record/反审/ctbz-2.2.0-行动账-计划/tencent-r2.json: 重级需每阵营 1 份 round=2 回执（双轮）
✗ /Users/maolong/Betty/草台班子/ctbz-dsh/.ctbz-record/反审/ctbz-2.2.0-行动账-计划/moonshot-r2.json: 重级需每阵营 1 份 round=2 回执（双轮）
exit=1
A 类错（本版新增，5 条）:
✗ 计划:行29 「A1」证伪不可执行
✗ 计划:行30 「A2」依据原文不符：派发闸.mjs:233 括号原文未在该行命中
✗ 计划:行31 「A3」依据原文不符：派发闸.mjs:520 括号原文未在该行命中
✗ 计划:行32 「A4」证伪不可执行
✗ 计划:行33 「A5」证伪不可执行
对照（安装副本 2.1.0 旧闸，无 A 类校验）:
命令: node ~/.agents/skills/ctbz/scripts/派发闸.mjs --plan docs/ctbz-2.2.0-行动账-计划.md --workspace $PWD --level l1 | grep -c "✗"
21
含 A 类校验的新闸 ✗ 计数:
命令: node skills/ctbz/scripts/派发闸.mjs ... | grep -c "✗"
26

### 7.6 缺账被拦（临时改计划标题 → 同命令 → 改回）
命令: node -e "把 ^## 行动账$ 改名"; node skills/ctbz/scripts/派发闸.mjs --plan docs/ctbz-2.2.0-行动账-计划.md --workspace $PWD --level l1
改前 sha: 0c088c47c59efc460269453e8a7fbb14b09087ad795daca67046905f9b48a42f
25:## 行动账（临时改名验证）
✗ 缺「行动账」小节
exit=1
还原后 sha: 0c088c47c59efc460269453e8a7fbb14b09087ad795daca67046905f9b48a42f
25:## 行动账

### 7.7 变异验证（mkdtemp 备份 → 改坏 → 用例须红 → 还原按 sha 校验）
原始 sha: 派发闸.mjs=26abeaa49dfc355690415e52363f5485505f732897ab9c610e3ca631b91ba5fb 内审.mjs=36b7b8e7b22e6934660089d953822d079482397f3df79bd96f524e6d79afc303

M1 变异: 派发闸.mjs A1 判据改 `if (head < 0) return [];`
命令: node --test --test-name-pattern '^V2 缺账被拦' tests/派发闸.test.mjs
# tests 1
# pass 0
# fail 1
还原 sha 一致: YES

M2 变异: 内审.mjs G10 空话词表清空（LEDGER_EMPTY_WORDS = []）
命令: node --test --test-name-pattern '^V6 ' tests/内审.test.mjs
# tests 1
# pass 0
# fail 1
还原 sha 一致: YES

M3 变异: 派发闸.mjs A3 括号原文命中判据断开（if (!chunks.some(...)) → if (false)）
命令: node --test --test-name-pattern '^V11 ' tests/派发闸.test.mjs
# tests 1
# pass 0
# fail 1
还原 sha 一致: YES
还原后复跑全量:
# tests 122
# pass 122
# fail 0

## 8) 实施后文件行数
命令: wc -l skills/ctbz/scripts/派发闸.mjs skills/ctbz/scripts/内审.mjs skills/ctbz/SKILL.md tests/派发闸.test.mjs tests/内审.test.mjs
     752 skills/ctbz/scripts/???.mjs
     554 skills/ctbz/scripts/??.mjs
     473 skills/ctbz/SKILL.md
     743 tests/???.test.mjs
     578 tests/??.test.mjs
    3100 total
