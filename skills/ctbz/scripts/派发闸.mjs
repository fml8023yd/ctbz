#!/usr/bin/env node
// ctbz 派发闸（dsh 版 2.0.6 / M1 + M11）——派发前硬闸。
//   --level l1    计划反审回执（<ws>/.ctbz-record/反审/<slug>/）
//   --level l2    任务级反审回执（<ws>/.ctbz-record/反审/任务级/<task>/）
//   --level l3    项目级复查回执（<ws>/.ctbz-record/反审/项目级/<slug>/）
//   --level audit 内审待办（<ws>/.ctbz-record/内审/pending.json）
// 约束：只读——不写任何文件；audit 仅 spawnSync 同目录 内审.mjs check（数组参数、无 shell、10s 超时）。
// 中文路径一律 fileURLToPath / path API，输出不做 percent-encode。
//
// 用法：
//   node 派发闸.mjs --plan <计划md绝对路径> --workspace <项目绝对路径>
//        [--level l1|l2|l3|audit] [--task <T号>] [--json] [--host-model <模型名>]
//
//   -h / --help 优先于 --json 与其余全部校验：打印人读用法到 stdout、exit 0、不输出 JSON。
//
// 退出码：0 通过 / 1 校验不通过（逐条列缺项 + 补齐命令） / 2 用法或环境错误

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const SELF = join(SELF_DIR, "派发闸.mjs");
const SKELETON = join(SELF_DIR, "反审.mjs");
const INNER = join(SELF_DIR, "内审.mjs");

const DEFAULT_HOST_MODEL = "deepseek-flash";
const SIX_VIEWS = ["需求一致性", "架构合理性", "测试完整性", "边界条件", "性能安全", "用户体验"];
const CATEGORIES = ["阻塞", "非阻塞", "可接受"];
const CONCLUSIONS = ["接受", "有条件接受", "不接受"];
const CHECK_IDS = ["集成一致性", "调用名统一", "main未污染", "安装副本分支标识"];

// §4.3 席位表：camp → 唯一 provider / 允许 model
const SEAT_TABLE = {
  deepseek: { provider: "deepseek-official", models: ["deepseek-v4-pro"] },
  zhipu:    { provider: "workbuddy",         models: ["glm-5.3-flash"] },
  tencent:  { provider: "workbuddy",         models: ["hy4-preview-f", "hy3"] },
  moonshot: { provider: "workbuddy",         models: ["kimi-k2.8-preview"] },
};
const CAMP_ORDER = Object.keys(SEAT_TABLE);
const SEAT_MODELS = new Set(CAMP_ORDER.flatMap((c) => SEAT_TABLE[c].models));

// §4.1 定级表：席位数 = 总回执数下限
const SCALE_SEATS = { "免审": 0, "轻": 3, "中": 4, "重": 8 };
const LEVELS = ["l1", "l2", "l3", "audit"];
const MAX_PENDING = 100;
const INNER_TIMEOUT_MS = 10_000;

const USAGE = `ctbz 派发闸（dsh 版，只读闸门）

用法：
  node 派发闸.mjs --plan <计划md绝对路径> --workspace <项目绝对路径>
       [--level l1|l2|l3|audit] [--task <T号>] [--json] [--host-model <模型名>]

选项：
  --plan <路径>        计划文件绝对路径（l1/l2/l3 必填）
  --workspace <路径>   项目绝对路径（必填）
  --level <级别>       l1 计划反审 / l2 任务级反审 / l3 项目级复查 / audit 内审待办；默认 l1
  --task <T号>         l2 必填，取值等于任务号字面量（T0–T5，如 T1）
  --json               开则 stdout 恒为单行 JSON
  --host-model <名>    主进程模型，默认 ${DEFAULT_HOST_MODEL}；不得取席位模型
  -h, --help           显示本帮助；优先于 --json 与其余全部校验（用法打到 stdout、exit 0、不输出 JSON）

退出码：0 通过 / 1 校验不通过 / 2 用法或环境错误`;

const writeOut = (s) => process.stdout.write(s + "\n");
const writeErr = (s) => process.stderr.write(s + "\n");

function parseArgs(argv) {
  const a = { level: "l1", json: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--plan") a.plan = argv[++i];
    else if (t === "--workspace") a.workspace = argv[++i];
    else if (t === "--level") a.level = argv[++i];
    else if (t === "--task") a.task = argv[++i];
    else if (t === "--host-model") a.hostModel = argv[++i];
    else if (t === "--json") a.json = true;
    else if (t === "-h" || t === "--help") a.help = true;
    else (a.unknown = a.unknown || []).push(t);
  }
  return a;
}

// exit 2：用法错误（附用法）
function usageError(json, msg) {
  if (json) writeOut(JSON.stringify({ ok: false, error: msg }));
  else { writeErr("[说明] " + msg); writeErr(USAGE); }
  return 2;
}

// exit 2：环境错误（不附用法）
function envError(json, msg) {
  if (json) writeOut(JSON.stringify({ ok: false, error: msg }));
  else writeErr("[说明] " + msg);
  return 2;
}

// exit 1：逐条缺项 + 补齐命令；说明行只进人读文本（--json 的 fix 只放可执行命令）
function checkFailed(json, { missing, fix, notes }) {
  if (json) { writeOut(JSON.stringify({ ok: false, missing, fix })); return 1; }
  const lines = missing.slice();
  for (const n of notes || []) lines.push("[说明] " + n);
  lines.push("[说明] 补齐命令：");
  lines.push(...fix);
  writeErr(lines.join("\n"));
  return 1;
}

function pass(json, payload) {
  writeOut(JSON.stringify(payload));
  return 0;
}

// 命令里的路径含空白/引号时才加引号（保持「命令行以 node 开头」）
const q = (p) => (/[\s"'\\]/.test(p) ? JSON.stringify(p) : p);

function gateCmd(level, plan, ws, task) {
  return `node ${q(SELF)} --plan ${q(plan)} --workspace ${q(ws)} --level ${level}` + (task ? ` --task ${task}` : "");
}

function readScale(text) {
  const m = text.match(/^[ \t>*-]*review_scale\s*[:：][ \t]*(.*)$/m);
  if (!m) return { reason: "计划正文缺 review_scale:（必填字段，取值 免审|轻|中|重）" };
  const v = m[1].trim().replace(/[`*]/g, "").split(/[\s（(,，、|]+/)[0];
  if (!(v in SCALE_SEATS)) return { reason: `review_scale 取值非法：${JSON.stringify(v)}（∈ 免审|轻|中|重）` };
  return { scale: v };
}

function hasFreeAuditBasis(text) {
  return /^[ \t>*-]*免审依据\s*[:：][ \t]*\S/m.test(text);
}

// §4.4 文件名 → 期望 camp 与 round；l2 目录允许任意 *.json（此时不强制后缀一致）
function expectFromName(name, level) {
  const m = name.match(/^(.+?)(?:-r(\d+))?\.json$/i);
  const base = m ? m[1] : name.replace(/\.json$/i, "");
  const camp = Object.prototype.hasOwnProperty.call(SEAT_TABLE, base) ? base : null;
  if (!camp) {
    return level === "l2"
      ? { kind: "loose" }
      : { kind: "bad", reason: "文件名不符合 §4.4 命名（<camp>.json 或 <camp>-r<N>.json）" };
  }
  const n = m && m[2];
  if (n === undefined) return { kind: "ok", camp, round: "1" };
  if (!/^[1-9]\d*$/.test(n) || Number(n) < 2) {
    return { kind: "bad", camp, reason: `文件名后缀 -r${n} 非法（重签轮 N ≥ 2）` };
  }
  return { kind: "ok", camp, round: n };
}

const isPosRound = (v) => typeof v === "string" && /^[1-9]\d*$/.test(v);
const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;

function scanReceipts(dir, level) {
  let names = [];
  try {
    names = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json")).sort();
  } catch {
    return [];
  }
  const items = [];
  for (const name of names) {
    const file = join(dir, name);
    const it = { name, file, reasons: [], data: null, empty: false };
    const exp = expectFromName(name, level);
    it.expectRound = exp.kind === "ok" ? exp.round : null;
    if (exp.kind === "bad") it.reasons.push(exp.reason);
    let data;
    try {
      data = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      it.reasons.push("JSON 解析失败：" + e.message);
      items.push(it);
      continue;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      it.reasons.push("回执不是 JSON 对象");
      items.push(it);
      continue;
    }
    it.data = data;
    items.push(it);
  }
  return items;
}

// 每阵营最高 round（只看能合法取到 camp + round 的回执）：仅该轮校验 plan_sha256
function topRounds(items) {
  const top = new Map();
  for (const it of items) {
    const d = it.data;
    if (!d) continue;
    if (!Object.prototype.hasOwnProperty.call(SEAT_TABLE, d.camp)) continue;
    if (!isPosRound(d.round)) continue;
    const n = Number(d.round);
    const cur = top.get(d.camp);
    if (!cur || n > cur.n) top.set(d.camp, { n, files: new Set([it.name]) });
    else if (n === cur.n) cur.files.add(it.name);
  }
  return top;
}

function validate(it, ctx) {
  const d = it.data;
  const bad = (m) => { if (!it.reasons.includes(m)) it.reasons.push(m); };
  const seat = SEAT_TABLE[d.camp];

  if (!seat) bad(`camp 非法：${JSON.stringify(d.camp)}（∈ ${CAMP_ORDER.join(",")}）`);
  if (!nonEmpty(d.camp_label)) bad("camp_label 缺失或为空");
  // 同模型自审优先报（V3 语义），再报席位表
  if (d.model === ctx.hostModel) bad(`同模型自审：model 与 --host-model 逐字相等（${ctx.hostModel}）`);
  if (seat) {
    if (d.provider !== seat.provider) bad(`provider 未落席位表：${JSON.stringify(d.provider)}（${d.camp} 允许 ${seat.provider}）`);
    if (!seat.models.includes(d.model)) bad(`model 未落席位表：${JSON.stringify(d.model)}（${d.camp} 允许 ${seat.models.join("/")}）`);
  } else {
    if (!nonEmpty(d.provider)) bad("provider 缺失或为空");
    if (!nonEmpty(d.model)) bad("model 缺失或为空");
  }

  if (!isPosRound(d.round)) bad(`round 非十进制正整数字符串：${JSON.stringify(d.round)}`);
  else if (it.expectRound && d.round !== it.expectRound) {
    bad(`round 与文件名后缀不一致：文件名要求 "${it.expectRound}"，字段为 "${d.round}"`);
  }

  if (d.plan !== ctx.plan) bad(`plan 与 --plan 不一致：${JSON.stringify(d.plan)}`);
  if (typeof d.plan_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(d.plan_sha256)) {
    bad(`plan_sha256 非 64 位小写 hex：${JSON.stringify(d.plan_sha256)}`);
  } else if (ctx.isTop && d.plan_sha256 !== ctx.planSha) {
    bad(`plan_sha256 与当前计划不符（最高轮须重签复核）：${d.plan_sha256.slice(0, 12)}… ≠ ${ctx.planSha.slice(0, 12)}…`);
  }

  if (!nonEmpty(d.generated_at)) bad("generated_at 缺失或为空");
  if (!(d.verdict === null || typeof d.verdict === "string")) bad("verdict 须为 null 或字符串");

  const fat = d.fresh_agent_test;
  if (!fat || typeof fat !== "object" || Array.isArray(fat)) bad("fresh_agent_test 缺失或非对象");
  else {
    if (!nonEmpty(fat.conclusion)) bad("fresh_agent_test.conclusion 缺失或为空");
    if (!Array.isArray(fat.blockers)) bad("fresh_agent_test.blockers 须为数组");
  }

  const vs = d.verdicts;
  if (!Array.isArray(vs)) bad("verdicts 须为数组");
  else {
    if (vs.length < 6) bad(`verdicts 长度 ${vs.length} < 6`);
    for (const v of vs) {
      if (!v || typeof v !== "object") { bad("verdicts 元素非对象"); continue; }
      if (!SIX_VIEWS.includes(v.view)) bad(`verdicts[].view 非法：${JSON.stringify(v.view)}`);
      if (!CATEGORIES.includes(v.category)) bad(`verdicts[].category 非法：${JSON.stringify(v.category)}`);
      if (!CONCLUSIONS.includes(v.conclusion)) bad(`verdicts[].conclusion 非法：${JSON.stringify(v.conclusion)}`);
      if (!nonEmpty(v.evidence)) bad(`verdicts[${JSON.stringify(v.view)}].evidence 缺失或为空`);
      if (!nonEmpty(v.disposition)) bad(`verdicts[${JSON.stringify(v.view)}].disposition 缺失或为空`);
    }
    const missViews = SIX_VIEWS.filter((view) => !vs.some((v) => v && v.view === view));
    if (missViews.length) bad("verdicts 缺视角：" + missViews.join("、"));
  }

  if (!nonEmpty(d.summary)) bad("summary 缺失或为空");

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

  if (ctx.level === "l3") {
    if (!Array.isArray(d.checks)) bad("checks 缺失或非数组");
    else {
      if (d.checks.length !== 4) bad(`checks 条数 ${d.checks.length} ≠ 4`);
      for (const c of d.checks) {
        if (!c || typeof c !== "object") { bad("checks 元素非对象"); continue; }
        if (!CHECK_IDS.includes(c.id)) bad(`checks[].id 非法：${JSON.stringify(c.id)}`);
        if (!nonEmpty(c.conclusion)) bad(`checks[${JSON.stringify(c.id)}].conclusion 缺失或为空`);
        if (!nonEmpty(c.evidence)) bad(`checks[${JSON.stringify(c.id)}].evidence 缺失或为空`);
      }
      const missChecks = CHECK_IDS.filter((id) => !d.checks.some((c) => c && c.id === id));
      if (missChecks.length) bad("checks 缺项：" + missChecks.join("、"));
    }
  }

  it.empty = d.verdict === null && Array.isArray(vs) && vs.length === 0;
  if (it.empty) bad("空模板（verdict:null 且 verdicts:[]）＝没审，与没写同判");
}

// 定级覆盖要求（§4.1 定级表）
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
      if (scale === "重") {
        for (const c of CAMP_ORDER) {
          if (!qualified.some((it) => it.data.camp === c && it.data.round === "2")) {
            out.push(`✗ ${join(dir, c + "-r2.json")}: 重级需每阵营 1 份 round=2 回执（双轮）`);
          }
        }
      }
    }
  } else if (level === "l2") {
    if (qualified.length < 1) out.push(`✗ ${dir}: 任务级合格回执 ${qualified.length} 份，l2 需 ≥1 份`);
  } else if (level === "l3") {
    for (const c of CAMP_ORDER) {
      if (!qualified.some((it) => it.data.camp === c && it.name === c + ".json")) {
        out.push(`✗ ${join(dir, c + ".json")}: 项目级缺 ${c} 阵营回执`);
      }
    }
  }
  return { problems: out, camps };
}

function scaleNote(level, scale, qualified, camps) {
  if (level === "l2") return `l2 定级 ${scale}：任务级回执需 ≥1 份；当前合格 ${qualified} 份`;
  if (level === "l3") return `l3 定级 ${scale}：项目级需 4 阵营齐全；当前合格 ${qualified} 份、覆盖 ${camps} 个阵营`;
  if (scale === "轻") return `定级 轻：需 ≥3 份回执、≥3 个不同阵营；当前合格 ${qualified} 份、覆盖 ${camps} 个阵营`;
  return `定级 ${scale}：需 ${SCALE_SEATS[scale]} 份回执、4 阵营齐全；当前合格 ${qualified} 份、覆盖 ${camps} 个阵营`;
}

function runReviewLevel(a, ws, plan, planText, planSha) {
  const { json, level, task, hostModel } = a;
  const slug = basename(plan).replace(/\.md$/i, "");
  const record = join(ws, ".ctbz-record", "反审");
  const dir = level === "l1" ? join(record, slug) : level === "l2" ? join(record, "任务级", task) : join(record, "项目级", slug);
  const receipt = dir.split(sep).join("/") + "/";
  const cmd = gateCmd(level, plan, ws, task);

  const sc = readScale(planText);
  const missing = [];
  if (sc.reason) missing.push(`✗ ${plan}: ${sc.reason}`);

  let scale = sc.scale || null;
  if (level === "l1" && scale === "免审" && !hasFreeAuditBasis(planText)) {
    missing.push(`✗ ${plan}: 免审级需计划正文含非空 免审依据: 行`);
  }

  const items = scanReceipts(dir, level);
  const top = topRounds(items);
  const fix = [];
  if (level === "l1") fix.push(`node ${q(SKELETON)} --plan ${q(plan)} --workspace ${q(ws)} --gate`);
  fix.push(cmd);

  if (level === "l1" && scale === "免审") {
    if (missing.length) return checkFailed(json, { missing, fix, notes: null });
    return pass(json, {
      ok: true, review_scale: scale, review_level: "l1", review_receipt: receipt,
      review_camps: [], plan_sha256: planSha, seats: 0,
    });
  }

  for (const it of items) {
    if (!it.data) continue;
    const t = top.get(it.data.camp);
    validate(it, {
      level, plan, planSha, hostModel,
      isTop: Boolean(t && t.files.has(it.name)),
    });
  }

  for (const it of items) {
    if (it.reasons.length) missing.push(`✗ ${it.file}: ${it.reasons.join("；")}`);
  }
  if (items.length === 0) missing.push(`✗ ${dir}: 目录不存在或为空，0 份回执`);

  const qualified = items.filter((it) => it.data && it.reasons.length === 0);
  const { problems, camps } = coverageProblems(level, scale, qualified, dir);
  missing.push(...problems);

  const emptyCount = items.filter((it) => it.empty).length;
  const notes = [scaleNote(level, scale, qualified.length, camps.length)];
  if (emptyCount) notes.push(`空模板 ${emptyCount} 份（= 没审，与没写同判）`);

  if (missing.length) return checkFailed(json, { missing, fix, notes });
  return pass(json, {
    ok: true, review_scale: scale, review_level: level, review_receipt: receipt,
    review_camps: CAMP_ORDER.filter((c) => camps.includes(c)), plan_sha256: planSha, seats: SCALE_SEATS[scale],
  });
}

function runAudit(a, ws) {
  const { json } = a;
  const pendingFile = join(ws, ".ctbz-record", "内审", "pending.json");
  if (!existsSync(pendingFile)) return pass(json, { ok: true, review_level: "audit", pending: 0 });

  let data;
  try {
    data = JSON.parse(readFileSync(pendingFile, "utf8"));
  } catch (e) {
    return envError(json, `pending.json 解析失败：${pendingFile}（${e.message}）`);
  }
  const list = data && Array.isArray(data.pending) ? data.pending : [];
  if (list.length === 0) return pass(json, { ok: true, review_level: "audit", pending: 0 });
  if (list.length > MAX_PENDING) return envError(json, `pending 过载：${list.length} 条 > ${MAX_PENDING}（${pendingFile}）`);

  const base = resolve(ws, "docs", "内审");
  const items = [];
  for (const it of list) {
    const id = it && it.id !== undefined ? String(it.id) : "?";
    if (!it || !nonEmpty(it.file)) return envError(json, `pending[].file 缺失（id=${id}）`);
    const abs = resolve(ws, it.file);
    if (abs !== base && !abs.startsWith(base + sep)) {
      return envError(json, `路径越界：${abs} 不在 ${base} 之下（id=${id}）`);
    }
    items.push({ id, file: abs });
  }

  if (!existsSync(INNER)) return envError(json, `内审.mjs 缺失：${INNER}`);
  const fix = items.map((it) => `node ${q(INNER)} check ${q(it.file)} --json`);
  const missing = [];
  for (const it of items) {
    const r = spawnSync(process.execPath, [INNER, "check", it.file, "--json"], {
      timeout: INNER_TIMEOUT_MS, killSignal: "SIGTERM", encoding: "utf8",
    });
    if (r.status !== 0) {
      const why = r.error
        ? (r.error.code === "ETIMEDOUT" ? `内审 check 超时（>${INNER_TIMEOUT_MS / 1000}s）` : `内审 check 未能执行：${r.error.message}`)
        : `内审 check 未通过（exit ${r.status}）`;
      missing.push(`✗ ${it.file}: ${why}`);
    }
  }
  if (missing.length) return checkFailed(json, { missing, fix, notes: [`待办内审 ${items.length} 条，未通过 ${missing.length} 条`] });
  return pass(json, { ok: true, review_level: "audit", pending: list.length });
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help) { writeOut(USAGE); return 0; } // -h 优先于 --json 与全部校验：用法走 stdout、非 JSON
  if (a.unknown) return usageError(a.json, "未知选项：" + a.unknown.join(" "));
  if (!LEVELS.includes(a.level)) return usageError(a.json, `非法 --level：${JSON.stringify(a.level)}（可选 ${LEVELS.join("|")}）`);
  if (!nonEmpty(a.workspace)) return usageError(a.json, "缺少 --workspace <项目绝对路径>");
  if (a.hostModel !== undefined && !nonEmpty(a.hostModel)) return usageError(a.json, "--host-model 取值不得为空");
  const ws = resolve(a.workspace);
  const hostModel = a.hostModel === undefined ? DEFAULT_HOST_MODEL : a.hostModel;
  if (SEAT_MODELS.has(hostModel)) {
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
    return envError(a.json, `计划文件不可读：${plan}（${e.message}）`);
  }
  const planSha = createHash("sha256").update(buf).digest("hex");
  return runReviewLevel({ ...a, hostModel }, ws, plan, buf.toString("utf8"), planSha);
}

process.exitCode = main();
