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

const DEEPSEEK_BASE = "https://api.deepseek.com";            // 官方通道（欠费期移出调用链，仅保留常量）
const WORKBUDDY_BASE = "http://101.133.151.121:18890/v1";    // 自建通道（已知 http 明文风险，见 cost-rules.json known_risks）
const WORKBUDDY_REMOTE_BASE = "https://wb.2btocken.xyz/v1";  // 备用 WB 网关（独立账号池，DeepSeek 席备路）

// 2026-10-05 改判：DeepSeek 官方欠费（402）+ 本地网关 deepseek 账号池限流期间，
// 本表 M1 改为「本地 WB 网关（主）→ wb.2btocken 远程网关（备路）」探测，反映实际调用链。
const MODELS = [
  { code: "M1", provider: "workbuddy", model: "deepseek-v4.1-flash", vendor: "DeepSeek", cost: "0（WB 网关）", base: WORKBUDDY_BASE,
    fallback: { provider: "workbuddy-remote", model: "deepseek-v4.1-flash", base: WORKBUDDY_REMOTE_BASE } },
  { code: "M2", provider: "workbuddy", model: "glm-5.3-flash", vendor: "智谱", cost: "credit 0.01", base: WORKBUDDY_BASE },
  { code: "M3", provider: "workbuddy", model: "hy4-preview-f", vendor: "腾讯", cost: "0", base: WORKBUDDY_BASE },
  { code: "M4", provider: "workbuddy", model: "hy3", vendor: "腾讯", cost: "0", base: WORKBUDDY_BASE },
  { code: "M5", provider: "workbuddy", model: "kimi-k2.8-preview", vendor: "月之暗面", cost: "credit 0.1", base: WORKBUDDY_BASE },
];

// ---------- 凭据（ZCode 线） ----------
// 凭据落点两代格式，**新格式优先**（2026-10-06 升级）：
//   ① ~/.zcode/v2/provider_config.json  宿主当前权威（config.providerConfigRules.providerRules[]:
//      {providerId, providerName, config:{access:{apiKey}, api:{baseUrl}, personalModelIds}}）
//   ② ~/.zcode/v2/config.json           旧格式（provider.<id>.options.{apiKey,baseURL}），回退用
// 为什么必须双读：宿主迁移到新格式后，旧 config.json 里的端点会过期（实测 WB 旧端点 127.0.0.1:7864
// 的 deepseek 因账号池限流 503，而新格式端点 work.htibinak.com 的 deepseek 200）——只读旧格式会把
// 可用链路判成故障。按 baseURL 前缀定位渠道，不硬编码 provider id（id 随接入变化）。

const ZC_CONFIG = process.env.CTBZ_ZC_CONFIG || join(homedir(), ".zcode", "v2", "config.json");
const ZC_PROVIDER_CONFIG = process.env.CTBZ_PROVIDER_CONFIG || join(homedir(), ".zcode", "v2", "provider_config.json");

// 席位表 provider 语义名 → 候选 baseURL 前缀（用于在 ZCode 配置中定位渠道）。
// 每个语义名可给多个前缀：渠道换接入点时旧前缀仍列出，避免「凭据没变却报凭据缺失」。
const PROVIDER_BASE_HINTS = {
  "deepseek-official": ["https://api.deepseek.com"],
  workbuddy: ["https://work.htibinak.com/v1", "http://101.133.151.121:18890/v1", "http://127.0.0.1:7864/v1"],
  "workbuddy-remote": ["https://wb.2btocken.xyz/v1"],
};

function readZcodeProviders() {
  try { return JSON.parse(readFileSync(ZC_CONFIG, "utf8"))?.provider ?? {}; } catch { return {}; }
}

// 新格式宿主配置的渠道条目（无文件/坏 JSON → 空数组，回退旧格式）
function readProviderConfigRules() {
  try {
    const rules = JSON.parse(readFileSync(ZC_PROVIDER_CONFIG, "utf8"))?.config?.providerConfigRules?.providerRules;
    return Array.isArray(rules) ? rules : [];
  } catch { return []; }
}

// 前缀白名单封闭匹配：base 恰等于前缀，或前缀后紧跟 "/" 分段；
// 拒绝 "…/v1.evil" 这类后缀伪装，白名单即封闭集合（scheme 由前缀自身限定为 http/https）。
function baseMatches(base, hints) {
  return hints.some((h) => base === h || base.startsWith(h + "/"));
}

// 返回配置中命中的那个渠道条目：key 为凭据，base 为实际请求端点（脚本不写死端点地址）
// 查找顺序：新格式 provider_config.json 优先，未命中回退旧格式 config.json。
function resolveApiKey(provider) {
  const hints = (PROVIDER_BASE_HINTS[provider] ?? []).map((h) => h.replace(/\/+$/, ""));
  if (!hints.length) return { key: null, base: null, source: `未知 provider：${provider}` };
  for (const rule of readProviderConfigRules()) {
    const base = String(rule?.config?.api?.baseUrl ?? "").replace(/\/+$/, "");
    if (!base || !baseMatches(base, hints)) continue;
    const key = rule?.config?.access?.apiKey;
    if (typeof key === "string" && key.trim()) return { key: key.trim(), base, source: `provider-config:${rule.providerId}` };
  }
  for (const [id, cfg] of Object.entries(readZcodeProviders())) {
    const base = String(cfg?.options?.baseURL ?? "").replace(/\/+$/, "");
    if (!base || !baseMatches(base, hints)) continue;
    const key = cfg?.options?.apiKey;
    if (typeof key === "string" && key.trim()) return { key: key.trim(), base, source: `zcode-config:${id}` };
  }
  return { key: null, base: null, source: `zcode-config 未命中（${provider} @ ${hints.join(" | ")}）` };
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

// credit 估算（声明性口径，非计费权威）：M2 0.01/次、M5 0.1/次、M1/M3/M4 0（WB 网关额度）
function creditOf(code) {
  if (code === "M2") return 0.01;
  if (code === "M5") return 0.1;
  if (code === "M1" || code === "M3" || code === "M4") return 0;
  return null;
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

  // 凭据：按 provider 各解析一次（含降级备路的 provider）
  const providers = [...new Set(targets.flatMap((m) => [m.provider, ...(m.fallback ? [m.fallback.provider] : [])]))];
  const creds = {};
  for (const p of providers) {
    const { key, source, base } = resolveApiKey(p);
    creds[p] = { key, source, base, present: Boolean(key) };
  }
  const missing = providers.filter((p) => !creds[p].present);

  const rows = [];
  const ledgerUpdates = [];
  for (const m of targets) {
    const key = creds[m.provider].key ?? null;
    const r = { code: m.code, provider: m.provider, model: m.model, vendor: m.vendor, cost: m.cost };
    let row;
    if (!key) {
      row = { ...r, status: "fail", http: null, latencyMs: 0,
              detail: `凭据缺失（来源 ${creds[m.provider].source}）` };
    } else {
      const endpoint = args.overrides[m.code] ?? creds[m.provider].base ?? m.base;
      const pr = await probe(m, key, endpoint);
      row = { ...r, endpoint, ...pr };
    }
    // 降级备路（恰好一次）：主渠道失败且声明 fallback 时尝试备选 provider
    if (row.status !== "ok" && m.fallback) {
      const fkey = creds[m.fallback.provider]?.key ?? null;
      if (fkey) {
        const fbase = creds[m.fallback.provider].base ?? m.fallback.base;
        const fpr = await probe({ ...m, provider: m.fallback.provider, model: m.fallback.model }, fkey, fbase);
        if (fpr.status === "ok") {
          row = {
            ...row, status: "ok", http: fpr.http, latencyMs: fpr.latencyMs, usage: fpr.usage,
            detail: `${fpr.detail}（主渠道失败，已降级 ${m.provider}/${m.model} → ${m.fallback.provider}/${m.fallback.model}）`,
            degraded: true,
          };
        } else {
          row = { ...row, detail: `${row.detail}；备路 ${m.fallback.provider}/${m.fallback.model} 亦失败：${fpr.detail}`, degraded: true };
        }
      } else {
        row = { ...row, detail: `${row.detail}；备路凭据缺失（${m.fallback.provider}）` };
      }
    }
    row.credit = creditOf(m.code);
    row.creditCumulative = row.status === "ok" ? creditOf(m.code) : 0; // 计费口径按实际发起且 2xx 的请求
    rows.push(row);
    if (row.limitError) {
      const resetAt = parseCooldown(`${row.http} ${row.limitError.body}`);
      if (resetAt) {
        ledgerUpdates.push({ key: `${m.provider}/${m.model}`, source: `[${row.http}][${sanitizeText(row.limitError.body).slice(0, 110)}]`, cooldown_until: resetAt });
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
