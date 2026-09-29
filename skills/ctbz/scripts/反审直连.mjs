#!/usr/bin/env node
// 反审直连 —— cc-haha 线的四路反审执行器（不走宿主 workflow.agent）
//
// 为什么存在：宿主 Claude Code Haha 的 provider 是进程级全局（providers.json.activeId），
//   单次调用无法指定 provider —— `agent(prompt,{provider,model})` 的 provider 被完全忽略，
//   请求一律打到活跃 provider 端点。实测 6 种写法（provider 名/id/baseUrl、model 斜杠与 @ 拼接）全失败。
//   故四路反审改由本进程直连各厂商端点，与宿主派发通道解耦：
//     主进程 → DeepSeek 官方渠道（宿主 env 决定，本脚本不碰）
//     反审席 → DeepSeek 官方 + workbuddy 自建网关（本脚本按 camp 各自 baseUrl + key 直连）
//
// 取舍：直连无工具能力（reviewer 读不到文件），故计划全文内联进 prompt；
//   代价是 risk `evidence: 文件:行号` 无法被 reviewer 独立核验，降级为「待人工核验」。
//   凭据读取代码与 preflight.mjs 有意重复，不抽公共库：抽取需改 preflight.mjs，
//   而 preflight.mjs 末尾 main() 会在 import 时立即发起真实计费调用，抽库风险大于收益。
//
// 用法：
//   node 反审直连.mjs --plan <计划md> --workspace <ws> [--camps c1,c2] [--round N] [--prev <dir>] [--gate] [--json] [--no-stream]
//   node 反审直连.mjs --plan <计划md> --dry-run          # 只打印将发的 prompt，零调用零写盘
//
// 传输（2026-09-29）：默认流式。网关对「非流式且上游响应超 120 秒」返回 502 upstream_unavailable，
//   同一任务流式跨 150 秒无损（实测）；流式无数据块时自动降级一次非流式，--no-stream 可强制非流式。
//
// 退出码：0 全路成功（--gate 时以闸门退出码为准） / 1 有路失败或回执不合规 / 2 用法或环境错误

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEEPSEEK_BASE = "https://api.deepseek.com";
const WORKBUDDY_BASE = "http://101.133.151.121:18890/v1"; // 自建通道（已知 http 明文风险）

// 席位表：与 references/派发.md §3 一致；反审席 DeepSeek 取 deepseek-flash（同源，不计独立性）
// reasoningEffort："off" 关推理——glm 在反审这类长结构化任务上会无限推理（实测 15 分钟 / 31255 块 / 正文 0 字，
//   而简单问题 225 字即止），关推理后立即出正文；反审是结构化判断，不依赖长思维链，故对智谱席关闭。
const CAMPS = {
  deepseek: { key: "deepseek", label: "DeepSeek", provider: "deepseek-official", model: "deepseek-flash", base: DEEPSEEK_BASE },
  zhipu:    { key: "zhipu",    label: "智谱",     provider: "workbuddy",         model: "glm-5.3-flash",   base: WORKBUDDY_BASE, reasoningEffort: "off" },
  tencent:  { key: "tencent",  label: "腾讯",     provider: "workbuddy",         model: "hy4-preview-f",   base: WORKBUDDY_BASE },
  moonshot: { key: "moonshot", label: "月之暗面", provider: "workbuddy",         model: "kimi-k2.8-preview", base: WORKBUDDY_BASE },
};

const SIX_VIEWS = ["需求一致性", "架构合理性", "测试完整性", "边界条件", "性能安全", "用户体验"];
const CATEGORIES = ["阻塞", "非阻塞", "可接受"];
const CONCLUSIONS = ["接受", "有条件接受", "不接受"];

// 凭据路径可经环境变量改写，供测试注入夹具（生产不设即走真实路径）
const DEFAULT_TIMEOUT_MS = 420_000;
// 推理型模型先耗 reasoning_content；max_tokens 被推理吃光时 content 为空，被截断时报 finish_reason=length。
const DEFAULT_MAX_TOKENS = 32_000;
const MAX_PLAN_CHARS = 120_000;

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

function sanitizeText(t) {
  return String(t ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/sk-[A-Za-z0-9]{8,}/g, "sk-<redacted>")
    .replace(/(api[_-]?key|authorization)"?\s*[:=]\s*"?[^",}\s]+/gi, '$1":"<redacted>')
    .slice(0, 300);
}

// ---------- 骨架 ----------

function roundSuffix(round) { return round === "1" ? "" : "-r" + round; }
function planSlug(plan) { return basename(plan).replace(/\.md$/i, ""); }

function buildPrompt({ camp, planPath, planText, planSha, round, prev }) {
  const roundRule = round === "2"
    ? `第二轮：只针对第一轮未解决项（类别=阻塞 或 结论≠接受，记录目录 ${prev}）。重提已否决意见须带新证据，否则视为无效。`
    : "第一轮：六视角全量核查。";
  return [
    `你是 ctbz 反审员（阵营：${camp.label}）。对下面这份计划做反审。`,
    "",
    "【重要约束】你没有文件读取工具。所有判断必须基于本 prompt 内联的文本，不得声称读过未提供的文件。",
    "因此「证据」字段请填写你能在下方文本中定位到的位置（如「计划 §3 第 2 段」），或标明「无法核验」。",
    "不得编造文件名与行号。",
    "",
    `六视角逐一核查：${SIX_VIEWS.join("、")}。`,
    "每视角给出：类别(阻塞/非阻塞/可接受) | 证据 | 结论(接受/有条件接受/不接受) | 处置。",
    roundRule,
    "",
    "【新鲜 Agent 测试】回答：把这份计划单独交给你，不读任何上下文，你能不能直接开工？卡在哪？卡住点即计划欠具体处。",
    "",
    "只输出一个 JSON 对象，不要任何其他文字、不要 markdown 围栏。结构：",
    "{",
    '  "verdict": null 或 "<一句话总裁决>",',
    '  "fresh_agent_test": { "conclusion": "<结论>", "blockers": ["<卡点>", ...] },',
    '  "verdicts": [ { "view": "<六视角之一>", "category": "阻塞|非阻塞|可接受", "evidence": "<证据>", "conclusion": "接受|有条件接受|不接受", "disposition": "<处置>" } ],',
    '  "summary": "<一句话摘要>"',
    "}",
    "硬性要求：verdicts 必须覆盖全部 6 个视角，每视角至少 1 条，view 取值逐字取自上面六个词。",
    "四个字段 evidence / disposition / conclusion / category 均不得为空。",
    "",
    `计划路径（仅供参考，你读不到它）：${planPath}`,
    `计划 sha256：${planSha}`,
    "",
    "========== 计划全文开始 ==========",
    planText,
    "========== 计划全文结束 ==========",
  ].join("\n");
}

function extractJson(text) {
  let t = String(text ?? "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch { /* 继续 */ }
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s !== -1 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch { /* 继续 */ } }
  return null;
}

// 回执合规自查：与 派发闸.mjs::validate 的字段约束对齐（闸门是权威，本函数只做早失败）
function receiptProblems(r) {
  const bad = [];
  if (!Array.isArray(r.verdicts) || r.verdicts.length < 6) bad.push(`verdicts 长度 ${r.verdicts?.length ?? 0} < 6`);
  else {
    for (const v of r.verdicts) {
      if (!SIX_VIEWS.includes(v?.view)) bad.push(`view 非法：${JSON.stringify(v?.view)}`);
      if (!CATEGORIES.includes(v?.category)) bad.push(`category 非法：${JSON.stringify(v?.category)}`);
      if (!CONCLUSIONS.includes(v?.conclusion)) bad.push(`conclusion 非法：${JSON.stringify(v?.conclusion)}`);
      if (!v?.evidence) bad.push(`evidence 为空（view=${v?.view}）`);
      if (!v?.disposition) bad.push(`disposition 为空（view=${v?.view}）`);
    }
    const miss = SIX_VIEWS.filter((s) => !r.verdicts.some((v) => v?.view === s));
    if (miss.length) bad.push("缺视角：" + miss.join("、"));
  }
  if (!r.fresh_agent_test?.conclusion) bad.push("fresh_agent_test.conclusion 为空");
  if (!Array.isArray(r.fresh_agent_test?.blockers)) bad.push("fresh_agent_test.blockers 非数组");
  if (!r.summary) bad.push("summary 为空");
  return bad;
}

async function callCampJson({ camp, prompt, apiKey, timeoutMs, maxTokens }) {
  const url = `${camp.base.replace(/\/+$/, "")}/chat/completions`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model: camp.model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }], ...(camp.reasoningEffort ? { reasoning_effort: camp.reasoningEffort } : {}) }),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const timedOut = e.name === "AbortError";
    return { ok: false, kind: timedOut ? "timeout" : "network", detail: timedOut ? `超时 ${timeoutMs}ms` : sanitizeText(e?.message) };
  }
  clearTimeout(timer);
  const latencyMs = Date.now() - started;
  const text = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, kind: "http", http: res.status, latencyMs, detail: sanitizeText(text) };
  let content = "", modelEcho = null, finish = null, reasoningLen = 0;
  try {
    const j = JSON.parse(text);
    const choice = j?.choices?.[0];
    const msg = choice?.message ?? {};
    content = msg.content ?? "";
    // 推理型模型（如 hy4-preview-f）先吐 reasoning_content；max_tokens 被推理吃光时 content 为空
    reasoningLen = String(msg.reasoning_content ?? "").length;
    finish = choice?.finish_reason ?? null;
    modelEcho = j?.model ?? null;
  } catch { return { ok: false, kind: "badjson", http: res.status, latencyMs, detail: "2xx 但响应非 JSON" }; }
  if (!content) {
    return {
      ok: false, kind: "empty-content", http: res.status, latencyMs, modelEcho,
      detail: `content 为空（finish_reason=${finish}，reasoning_content ${reasoningLen} 字符）` +
        (finish === "length" ? `；判为推理占满 max_tokens=${maxTokens}，请调高 --max-tokens` : ""),
    };
  }
  const parsed = extractJson(content);
  if (!parsed) return { ok: false, kind: "unparsable", http: res.status, latencyMs, modelEcho, detail: `finish_reason=${finish}；正文 ${content.length} 字符，取不到 JSON：` + sanitizeText(content) };
  return { ok: true, http: res.status, latencyMs, modelEcho, parsed };
}

// 流式接收（默认路径）：网关对「非流式 + 上游响应超 120 秒」返回 502 upstream_unavailable，
// 同一任务改流式则跨 150 秒无损（2026-09-29 实测）。逐块累积 content / reasoning_content。
async function callCampStream({ camp, prompt, apiKey, timeoutMs, maxTokens }) {
  const url = `${camp.base.replace(/\/+$/, "")}/chat/completions`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model: camp.model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }], stream: true, ...(camp.reasoningEffort ? { reasoning_effort: camp.reasoningEffort } : {}) }),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const timedOut = e.name === "AbortError";
    return { ok: false, kind: timedOut ? "timeout" : "network", detail: timedOut ? `超时 ${timeoutMs}ms` : sanitizeText(e?.message) };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    clearTimeout(timer);
    return { ok: false, kind: "http", http: res.status, latencyMs: Date.now() - started, detail: sanitizeText(text) };
  }
  const decoder = new TextDecoder();
  let buffer = "", content = "", reasoning = "", modelEcho = null, finish = null, chunks = 0;
  try {
    for await (const part of res.body) {
      buffer += decoder.decode(part, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();                                  // 末段可能半行，留给下一块
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;          // 跳过空行与 keep-alive 注释
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let piece;
        try { piece = JSON.parse(payload); } catch { continue; }
        chunks++;
        modelEcho ??= piece.model ?? null;
        const choice = piece.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        if (typeof delta.content === "string") content += delta.content;
        if (typeof delta.reasoning_content === "string") reasoning += delta.reasoning_content;
        if (choice.finish_reason) finish = choice.finish_reason;
      }
    }
  } catch (e) {
    clearTimeout(timer);
    const timedOut = e.name === "AbortError";
    return {
      ok: false, kind: timedOut ? "timeout" : "stream-broken", latencyMs: Date.now() - started, modelEcho,
      detail: (timedOut ? `超时 ${timeoutMs}ms` : sanitizeText(e?.message)) + `（已收 ${chunks} 块、正文 ${content.length} 字符）`,
    };
  }
  clearTimeout(timer);
  const latencyMs = Date.now() - started;
  if (!chunks) return { ok: false, kind: "no-stream-data", http: res.status, latencyMs, modelEcho, detail: "流式响应未含任何 data 块" };
  if (!content) {
    return {
      ok: false, kind: "empty-content", http: res.status, latencyMs, modelEcho,
      detail: `content 为空（finish_reason=${finish}，reasoning_content ${reasoning.length} 字符，收块 ${chunks}）` +
        (finish === "length" ? `；判为推理占满 max_tokens=${maxTokens}，请调高 --max-tokens` : ""),
    };
  }
  const parsed = extractJson(content);
  if (!parsed) return { ok: false, kind: "unparsable", http: res.status, latencyMs, modelEcho, detail: `finish_reason=${finish}；正文 ${content.length} 字符，取不到 JSON：` + sanitizeText(content) };
  return { ok: true, http: res.status, latencyMs, modelEcho, parsed, streamed: true };
}

// 默认流式；若网关根本不支持流式（无数据块），自动降级一次非流式，避免误伤。
async function callCamp({ camp, prompt, apiKey, timeoutMs, maxTokens, stream = true }) {
  if (!stream) return callCampJson({ camp, prompt, apiKey, timeoutMs, maxTokens });
  const attempt = await callCampStream({ camp, prompt, apiKey, timeoutMs, maxTokens });
  if (attempt.ok || attempt.kind !== "no-stream-data") return attempt;
  const fallback = await callCampJson({ camp, prompt, apiKey, timeoutMs, maxTokens });
  fallback.fallbackReason = "流式无数据块，已自动降级非流式";
  return fallback;
}

function parseArgs(argv) {
  const a = { camps: Object.keys(CAMPS).join(","), round: "1", gate: false, dryRun: false, json: false, noStream: false, timeoutMs: DEFAULT_TIMEOUT_MS, maxTokens: DEFAULT_MAX_TOKENS, overrides: {} };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--plan") a.plan = argv[++i];
    else if (t === "--workspace") a.workspace = argv[++i];
    else if (t === "--camps") a.camps = argv[++i];
    else if (t === "--round") a.round = argv[++i];
    else if (t === "--prev") a.prev = argv[++i];
    else if (t === "--timeout-ms") a.timeoutMs = Number(argv[++i]);
    else if (t === "--max-tokens") a.maxTokens = Number(argv[++i]);
    else if (t === "--endpoint-override") {
      const m = String(argv[++i]).match(/^([a-z]+)=(.+)$/);
      if (!m) { console.error("--endpoint-override 需 <camp>=<URL> 形式"); a.badArg = true; return a; }
      a.overrides[m[1]] = m[2];
    }
    else if (t === "--no-stream") a.noStream = true;
    else if (t === "--gate") a.gate = true;
    else if (t === "--dry-run") a.dryRun = true;
    else if (t === "--json") a.json = true;
    else if (t === "-h" || t === "--help") a.help = true;
    else { console.error(`未知参数: ${t}`); a.badArg = true; return a; }
  }
  return a;
}

const USAGE = `反审直连（cc-haha 线）

用法：
  node 反审直连.mjs --plan <计划md> --workspace <ws> [选项]

选项：
  --plan <路径>        计划文件（必填）
  --workspace <项目根>  回执落盘根：<ws>/.ctbz-record/反审/<slug>/；非 --dry-run 必填
  --camps <c1,c2,..>   参与阵营，默认全 4 路：${Object.keys(CAMPS).join(",")}
  --round <1|2>        轮次，默认 1；≥2 时回执文件名 <camp>-r<N>.json
  --prev <目录>        第一轮记录目录（round=2 时注入「只针对未解决项」限定）
  --timeout-ms <ms>    单路超时，默认 ${DEFAULT_TIMEOUT_MS}
  --max-tokens <n>     单路输出上限，默认 ${DEFAULT_MAX_TOKENS}（推理型席位需给足，否则 reasoning 吃满、正文为空）
  --no-stream          强制非流式（默认流式：绕开网关对「非流式且上游超 120 秒」的 502；流式无数据块时自动降级一次非流式）
  --endpoint-override <camp>=<URL>   覆盖某阵营端点（诊断/测试用）
  --dry-run            只打印将发的 prompt 与落盘路径，零调用零写盘
  --gate               出完回执后调 派发闸.mjs --level l1，退出码取闸门退出码
  --json               汇总以 JSON 输出
  -h, --help           本帮助

退出码：0 全路成功 / 1 有路失败或回执不合规 / 2 用法或环境错误`;

function runGate({ plan, workspace }) {
  const gate = join(__dirname, "派发闸.mjs");
  if (!existsSync(gate)) { console.error("[反审直连] 闸门脚本不存在：" + gate); return 2; }
  const r = spawnSync(process.execPath, [gate, "--plan", plan, "--workspace", workspace, "--level", "l1"],
    { stdio: ["ignore", "inherit", "inherit"], timeout: 60000, killSignal: "SIGTERM" });
  if (r.error) { console.error("[反审直连] 闸门执行失败：" + r.error.message); return 2; }
  console.error("[反审直连] 闸门退出码=" + r.status);
  return typeof r.status === "number" ? r.status : 2;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help) { console.log(USAGE); return 0; }
  if (a.badArg) { console.error(USAGE); return 2; }
  if (!a.plan) { console.error("缺少 --plan\n" + USAGE); return 2; }
  if (!existsSync(a.plan)) { console.error("计划文件不存在：" + a.plan); return 2; }
  if (!/^[1-9]\d*$/.test(a.round)) { console.error("--round 须为正整数，实际 " + JSON.stringify(a.round)); return 2; }
  if (!a.dryRun && !a.workspace) { console.error("非 --dry-run 必须显式给出 --workspace <项目根>"); return 2; }

  const keys = a.camps.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = keys.filter((k) => !CAMPS[k]);
  if (!keys.length || unknown.length) {
    console.error("阵营非法：" + (unknown.join(",") || "空") + "；可选 " + Object.keys(CAMPS).join(","));
    return 2;
  }
  const camps = keys.map((k) => CAMPS[k]).map((c) => a.overrides[c.key] ? { ...c, base: a.overrides[c.key] } : c);

  const planPath = resolve(a.plan);
  const planBuf = readFileSync(planPath);
  const planText = planBuf.toString("utf8");
  const planSha = createHash("sha256").update(planBuf).digest("hex");
  const workspace = a.workspace ? resolve(a.workspace) : null;
  const recordDir = workspace ? join(workspace, ".ctbz-record", "反审", planSlug(planPath)) : null;
  const suffix = roundSuffix(a.round);

  if (planText.length > MAX_PLAN_CHARS) {
    console.error(`计划过大：${planText.length} 字符 > 上限 ${MAX_PLAN_CHARS}。内联模式无法完整投喂，请先拆分计划。`);
    return 2;
  }

  if (a.dryRun) {
    const p = buildPrompt({ camp: camps[0], planPath, planText, planSha, round: a.round, prev: a.prev });
    console.log(`# dry-run：将向 ${camps.length} 路发请求，零调用零写盘`);
    for (const c of camps) console.log(`#   ${c.key} → ${c.base}/chat/completions  model=${c.model}`);
    if (recordDir) console.log(`# 回执落盘：${recordDir}/<camp>${suffix}.json`);
    else console.log("# 未给 --workspace：不写盘");
    console.log(`# prompt 字符数：${p.length}`);
    console.log("// ===== prompt 预览（camp=" + camps[0].key + "）=====");
    console.log(p.slice(0, 2000));
    console.log("// ===== 预览结束 =====");
    return 0;
  }

  mkdirSync(recordDir, { recursive: true });

  // 四路互不依赖，并行派发：推理型席位单路可达数分钟，串行会成倍拉长墙钟
  const runOne = async (camp) => {
    const outFile = join(recordDir, camp.key + suffix + ".json");
    const { key, source } = resolveApiKey(camp.provider);
    if (!key) {
      return { camp: camp.key, label: camp.label, status: "fail", detail: `凭据缺失（来源 ${source}）` };
    }
    const prompt = buildPrompt({ camp, planPath, planText, planSha, round: a.round, prev: a.prev });
    const r = await callCamp({ camp, prompt, apiKey: key, timeoutMs: a.timeoutMs, maxTokens: a.maxTokens, stream: !a.noStream });
    if (!r.ok) {
      return { camp: camp.key, label: camp.label, status: "fail", http: r.http, latencyMs: r.latencyMs, detail: `${r.kind}: ${r.detail}` };
    }
    const receipt = {
      camp: camp.key,
      camp_label: camp.label,
      provider: camp.provider,
      model: camp.model,
      round: a.round,
      plan: planPath,
      plan_sha256: planSha,
      generated_at: new Date().toISOString(),
      verdict: r.parsed.verdict ?? null,
      fresh_agent_test: {
        conclusion: r.parsed.fresh_agent_test?.conclusion ?? "",
        blockers: Array.isArray(r.parsed.fresh_agent_test?.blockers) ? r.parsed.fresh_agent_test.blockers : [],
      },
      verdicts: Array.isArray(r.parsed.verdicts) ? r.parsed.verdicts : [],
      summary: r.parsed.summary ?? "",
      dispatch: {
        mode: "direct-http",
        transport: r.fallbackReason ? "json(fallback)" : a.noStream ? "json" : "stream",
        endpoint: camp.base + "/chat/completions",
        http_status: r.http,
        latency_ms: r.latencyMs,
        model_echo: r.modelEcho,
        ...(r.fallbackReason ? { fallback_reason: r.fallbackReason } : {}),
      },
    };
    const problems = receiptProblems(receipt);
    if (problems.length) {
      return { camp: camp.key, label: camp.label, status: "fail", http: r.http, latencyMs: r.latencyMs, detail: "回执不合规：" + problems.join("；"), outFile };
    }
    writeFileSync(outFile, JSON.stringify(receipt, null, 2) + "\n", "utf8");
    return { camp: camp.key, label: camp.label, status: "ok", http: r.http, latencyMs: r.latencyMs, outFile };
  };

  const rows = await Promise.all(camps.map(runOne));

  const failed = rows.filter((r) => r.status !== "ok");
  const summary = {
    plan: planPath, plan_sha256: planSha, round: a.round, mode: "direct-http",
    ok: rows.length - failed.length, fail: failed.length, rows,
  };
  if (a.json) console.log(JSON.stringify(summary, null, 2));
  else {
    for (const r of rows) {
      console.log(`${r.status === "ok" ? "✓" : "✗"} ${r.label.padEnd(6)} ${String(r.http ?? "-").padEnd(4)} ${String(r.latencyMs ?? "-").padStart(7)}ms  ${r.outFile ?? r.detail ?? ""}`);
    }
    console.log(`\n汇总: ${summary.ok}/${rows.length} 路成功；回执目录 ${recordDir}`);
  }
  if (failed.length) return 1;
  return a.gate ? runGate({ plan: planPath, workspace }) : 0;
}

process.exit(await main());
