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
