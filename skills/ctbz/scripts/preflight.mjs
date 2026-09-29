#!/usr/bin/env node
// preflight —— 草台班子预检与探活
// 对 5 模型 4 阵营各发 1 次最小请求（max_tokens=16，单次超时 60s，串行，总预算 5 次），
// 输出可用性 + credit 表（JSON 与人类可读两种），并可选把限额类错误解析出的重置时间写入健康账本。
// 失败/离线不得假报成功：每个模型区分 ok / fail / timeout，如实标注。
//
// 凭据获取（不打印、不落盘、不进日志）:
//   读 ~/.zcode/v2/config.json 的 provider.<id>.options.apiKey；按 baseURL 前缀定位渠道（不硬编码 provider id）。
//
// 用法: /usr/local/bin/node preflight.mjs [--json] [--ledger] [--only M1,M3] [--endpoint-override M2=http://...]
//   --json               只输出 JSON
//   --ledger             探活/解析到限额错误时写入健康账本（默认不写；写账本也可走 模型健康.js report）
//   --only <代号列表>     只探指定模型（预算按模型数减）
//   --endpoint-override <M2=http://host/v1>   覆盖某模型端点（诊断用，如自验 c 的坏端点）
// 注意: 真实计费——M2 单次 0.01 credit、M5 单次 0.1 credit，M1 官方计费；默认全量探活即 5 次调用。

import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const MODEL_BUDGET_TOTAL = 5;          // 总预算：5 次调用（每模型 1 次）
const REQUEST_TIMEOUT_MS = 60_000;     // 单次超时 60s
const MAX_TOKENS = 16;                 // 最小请求

const DEEPSEEK_BASE = "https://api.deepseek.com";            // 官方通道
const WORKBUDDY_BASE = "http://101.133.151.121:18890/v1";    // 自建通道（已知 http 明文风险，见 cost-rules.json known_risks）

const MODELS = [
  { code: "M1", provider: "deepseek-official", model: "deepseek-flash", vendor: "DeepSeek", cost: "官方计费", base: DEEPSEEK_BASE },
  { code: "M2", provider: "workbuddy", model: "glm-5.3-flash", vendor: "智谱", cost: "credit 0.01", base: WORKBUDDY_BASE },
  { code: "M3", provider: "workbuddy", model: "hy4-preview-f", vendor: "腾讯", cost: "0", base: WORKBUDDY_BASE },
  { code: "M4", provider: "workbuddy", model: "hy3", vendor: "腾讯", cost: "0", base: WORKBUDDY_BASE },
  { code: "M5", provider: "workbuddy", model: "kimi-k2.8-preview", vendor: "月之暗面", cost: "credit 0.1", base: WORKBUDDY_BASE },
];

// ---------- 凭据（ZCode 线：读 ~/.zcode/v2/config.json 的 provider.<id>.options） ----------
// 本机凭据落点即 ZCode 配置；按 baseURL 前缀定位渠道，不硬编码 provider id（id 随接入变化）。

const ZC_CONFIG = process.env.CTBZ_ZC_CONFIG || join(homedir(), ".zcode", "v2", "config.json");

// 席位表 provider 语义名 → baseURL 前缀（用于在 ZCode 配置中定位渠道）
const PROVIDER_BASE_HINTS = {
  "deepseek-official": "https://api.deepseek.com",
  workbuddy: "http://101.133.151.121:18890/v1",
};

function readZcodeProviders() {
  try { return JSON.parse(readFileSync(ZC_CONFIG, "utf8"))?.provider ?? {}; } catch { return {}; }
}

function resolveApiKey(provider) {
  const hint = (PROVIDER_BASE_HINTS[provider] ?? "").replace(/\/+$/, "");
  if (!hint) return { key: null, source: `未知 provider：${provider}` };
  for (const [id, cfg] of Object.entries(readZcodeProviders())) {
    const base = String(cfg?.options?.baseURL ?? "").replace(/\/+$/, "");
    if (base && base.startsWith(hint)) {
      const key = cfg?.options?.apiKey;
      if (typeof key === "string" && key.trim()) return { key: key.trim(), source: `zcode-config:${id}` };
    }
  }
  return { key: null, source: `zcode-config 未命中（${provider} @ ${hint}）` };
}

// ---------- 探活 ----------

// 探活请求体。deepseek 官方走 /chat/completions；workbuddy 声明 api=openai-completions，同路径。
function chatUrl(base, provider) {
  const path = provider === "deepseek-official" ? "/chat/completions" : "/chat/completions";
  return `${base.replace(/\/+$/, "")}${path}`;
}

// 限额/欠费类错误识别：HTTP 状态或错误体内含额度线索
function classifyHttp(status, bodyText) {
  const body = bodyText || "";
  const limitHit =
    status === 402 ||
    status === 429 ||
    /\b1310\b/.test(body) ||
    /限额|上限|余额不足|quota|insufficient|rate limit|exceeded|retry after/i.test(body);
  return limitHit ? "limit" : "error";
}

// 单模型探活：1 次请求，60s 超时。返回 {status: ok|fail|timeout, http, latencyMs, detail, limitResetAt}
async function probe(m, apiKey, endpointOverride) {
  const url = chatUrl(endpointOverride ?? m.base, m.provider);
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: m.model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: "回复 ok 两个字母即可" }],
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const timedOut = e.name === "AbortError" || /aborted|timeout/i.test(String(e.cause?.message ?? e.message));
    return { status: timedOut ? "timeout" : "fail", http: null, latencyMs: Date.now() - started,
             detail: timedOut ? `timeout after ${REQUEST_TIMEOUT_MS}ms` : sanitize(e) };
  }
  clearTimeout(timer);
  const latencyMs = Date.now() - started;
  const text = await res.text().catch(() => "");
  if (res.ok) {
    let okParsed = "HTTP 2xx";
    let usage = null;
    try {
      const j = JSON.parse(text);
      const content = j?.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.length) okParsed = `回复 ${content.slice(0, 24).replace(/\s+/g, " ")}…`;
      usage = j?.usage ?? null;
    } catch { /* 非 JSON 2xx 也算 ok（网关可能包壳） */ }
    return { status: "ok", http: res.status, latencyMs, detail: okParsed, usage };
  }
  const kind = classifyHttp(res.status, text);
  return {
    status: "fail",
    http: res.status,
    latencyMs,
    detail: `${kind === "limit" ? "限额/欠费类错误" : "错误"}: ${sanitizeText(text)}`,
    ...(kind === "limit" ? { limitError: { http: res.status, body: text.slice(0, 400) } } : {}),
  };
}

// 错误文本脱敏：任何 Bearer token / sk- 串 / key=value 一律抹掉，防凭据进日志
function sanitizeText(t) {
  return String(t ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/sk-[A-Za-z0-9]{8,}/g, "sk-<redacted>")
    .replace(/(api[_-]?key|authorization)"?\s*[:=]\s*"?[^",}\s]+/gi, '$1":"<redacted>')
    .slice(0, 200);
}
function sanitize(e) { return sanitizeText(e?.message ?? String(e)); }

// ---------- 限额错误 → 账本 ----------

// 解析逻辑沿用 模型健康.js parseCooldown 思路：显式日期时间（北京时间）优先，其次 retry-after 秒数
function parseCooldown(msg) {
  const m = msg.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(:\d{2})?)/);
  if (m) {
    const iso = `${m[1]}T${m[2]}${m[2].length === 5 ? ":00" : ""}`;
    const t = Date.parse(`${iso}+08:00`);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  const r = msg.match(/(?:retry|after)\D{0,8}(\d{1,6})\s*s/i);
  if (r) return new Date(Date.now() + Number(r[1]) * 1000).toISOString();
  return null;
}

function ledgerWrite(key, sourceMsg, resetAt) {
  mkdirSync(LEDGER_DIR, { recursive: true });
  let d = {};
  if (existsSync(LEDGER_FILE)) {
    try { d = JSON.parse(readFileSync(LEDGER_FILE, "utf8")) ?? {}; } catch { d = {}; }
  }
  d[key] = { cooldown_until: resetAt, source: sanitizeText(String(sourceMsg)).slice(0, 120), recorded_at: new Date().toISOString() };
  writeFileSync(LEDGER_FILE, JSON.stringify(d, null, 2) + "\n");
  chmodSync(LEDGER_FILE, 0o600);
  return LEDGER_FILE;
}

// ---------- 输出 ----------

function humanTable(rows) {
  const cols = [
    ["代号", (r) => r.code], ["provider/model", (r) => `${r.provider}/${r.model}`], ["阵营", (r) => r.vendor],
    ["计费", (r) => r.cost], ["状态", (r) => r.status.toUpperCase()],
    ["HTTP", (r) => (r.http == null ? "-" : String(r.http))], ["耗时ms", (r) => String(r.latencyMs ?? "-")],
    ["credit(累计)", (r) => (r.creditCumulative ?? "-")], ["备注", (r) => r.detail ?? ""],
  ];
  const table = [cols.map(([h]) => h), ...rows.map((r) => cols.map(([, f]) => f(r)))];
  const w = cols.map((_, i) => Math.max(...table.map((row) => displayWidth(row[i]))));
  return table.map((row) => row.map((c, i) => pad(c, w[i])).join("  ")).join("\n");
}
// 中英混排对齐：CJK 按宽 2 计
function displayWidth(s) {
  let w = 0;
  for (const ch of String(s)) w += /[\u2e80-\u9fff\uf900-\ufaff\uff01-\uff60\u3000-\u303f]/.test(ch) ? 2 : 1;
  return w;
}
function pad(s, n) {
  s = String(s);
  return s + " ".repeat(Math.max(0, n - displayWidth(s)));
}

// credit 估算（声明性口径，非计费权威）：M2 0.01/次、M5 0.1/次、M3/M4 0、M1 官方计费
function creditOf(code) {
  if (code === "M2") return 0.01;
  if (code === "M5") return 0.1;
  if (code === "M3" || code === "M4") return 0;
  return null; // M1 官方计费，无法用 credit 口径表达
}

// ---------- main ----------

function parseArgs(argv) {
  const args = { json: false, ledger: false, only: null, overrides: {} };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--json") args.json = true;
    else if (k === "--ledger") args.ledger = true;
    else if (k === "--only") args.only = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--endpoint-override") {
      const m = argv[++i].match(/^(M[1-5])=(.+)$/);
      if (!m) throw new Error(`--endpoint-override 需 <M1-M5>=<URL> 形式，收到: ${argv[i]}`);
      args.overrides[m[1]] = m[2];
    } else if (k === "-h" || k === "--help") args.help = true;
    else throw new Error(`未知参数: ${k}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("用法: preflight.mjs [--json] [--ledger] [--only M1,M3] [--endpoint-override M2=http://host/v1]");
    return;
  }
  const targets = MODELS.filter((m) => !args.only || args.only.includes(m.code));
  if (!targets.length) throw new Error("--only 未匹配任何模型代号（M1-M5）");
  if (targets.length > MODEL_BUDGET_TOTAL) throw new Error(`探活预算上限 ${MODEL_BUDGET_TOTAL} 次`);

  // 凭据：按 provider 各解析一次（deepseek-official / workbuddy）
  const providers = [...new Set(targets.map((m) => m.provider))];
  const creds = {};
  for (const p of providers) {
    const { key, source } = resolveApiKey(p);
    creds[p] = { key, source, present: Boolean(key) };
  }
  const missing = providers.filter((p) => !creds[p].present);

  const rows = [];
  const ledgerUpdates = [];
  for (const m of targets) {
    const key = creds[m.provider].key ?? null;
    const r = { code: m.code, provider: m.provider, model: m.model, vendor: m.vendor, cost: m.cost };
    if (!key) {
      rows.push({ ...r, status: "fail", http: null, latencyMs: 0,
                  detail: `凭据缺失（来源 ${creds[m.provider].source}）` });
      continue;
    }
    const pr = await probe(m, key, args.overrides[m.code]);
    const row = { ...r, ...pr };
    row.credit = creditOf(m.code);
    row.creditCumulative = row.status === "ok" ? creditOf(m.code) : 0; // 计费口径按实际发起且 2xx 的请求
    rows.push(row);
    if (pr.limitError) {
      const resetAt = parseCooldown(`${pr.http} ${pr.limitError.body}`);
      if (resetAt) {
        ledgerUpdates.push({ key: `${m.provider}/${m.model}`, source: `[${pr.http}][${sanitizeText(pr.limitError.body).slice(0, 110)}]`, cooldown_until: resetAt });
      }
    }
  }

  if (args.ledger && ledgerUpdates.length) {
    for (const u of ledgerUpdates) {
      const f = ledgerWrite(u.key, u.source, u.cooldown_until);
      u.written_to = f;
    }
  }

  const okCount = rows.filter((r) => r.status === "ok").length;
  const summary = {
    ran_at: new Date().toISOString(),
    calls_made: rows.length,
    budget_total: MODEL_BUDGET_TOTAL,
    ok: okCount,
    fail: rows.filter((r) => r.status === "fail").length,
    timeout: rows.filter((r) => r.status === "timeout").length,
    credentials: Object.fromEntries(providers.map((p) => [p, { source: creds[p].source, present: creds[p].present }])),
    ledger_updates: args.ledger ? ledgerUpdates : ledgerUpdates.map(({ cooldown_until, ...u }) => ({ ...u, cooldown_until, note: "未写账本（未加 --ledger）" })),
    rows: rows.map(({ limitError, usage, ...r }) => ({ ...r, ...(usage ? { usage } : {}) })),
    note: "status 区分 ok/fail/timeout；fail 含限额/欠费类错误（如实标注，不假报成功）。凭据不打印不落盘。",
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(humanTable(rows));
    const lu = ledgerUpdates.length
      ? ledgerUpdates.map((u) => `${u.key} → 冷却至 ${u.cooldown_until}${u.written_to ? `（已写 ${u.written_to}）` : ""}`).join("；")
      : "无";
    console.log(`\n汇总: 探活 ${rows.length}/${MODEL_BUDGET_TOTAL} 次预算 | ok=${okCount} fail=${summary.fail} timeout=${summary.timeout} | 限额记账: ${lu}`);
  }
  process.exit(okCount ? 0 : 1);
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(2); });
