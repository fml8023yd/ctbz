#!/usr/bin/env node
// 体检 —— 草台班子一站式体检（A5/A6/D2/D3）：版本四方对比 / 编制名单对账 / 探活 / 健康账本 / 待办。
// 只读脚本：不修改任何状态文件；取不到的项如实标「未知」，不编造。
// 用法: node 体检.mjs [--workspace <ws>] [--json] [--no-probe]
// 退出码: 0 正常（发现幽灵模型也算正常）/ 2 用法错误。
// 夹具注入: CTBZ_HOME（状态根）/ CTBZ_HEALTH_FILE（账本，lib 既有）/ CTBZ_PROVIDER_CONFIG（宿主模型表）。

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { listLedger, normalizeKey } from "./lib/健康账本.mjs";

const GIT_TIMEOUT_MS = 10_000;   // git 限时，体检耗时预算 ≤20s
const DIFF_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MS = 60_000; // preflight 串行 5 次探活的最坏预算
const KEY_ROLES = ["planner", "reviewer", "implementer", "tester"]; // A6 关键角色（答辩 §1.7）
const USAGE = "用法: node 体检.mjs [--workspace <ws>] [--json] [--no-probe]";

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const PREFLIGHT = process.env.CTBZ_PREFLIGHT || join(SCRIPTS, "preflight.mjs"); // 覆盖点=测试注入桩，避免真实计费

function parseArgs(argv) {
  const a = { workspace: null, json: false, noProbe: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--workspace") { const v = argv[++i]; if (!v) throw new Error("--workspace 缺参数"); a.workspace = v; }
    else if (k === "--json") a.json = true;
    else if (k === "--no-probe") a.noProbe = true;
    else if (k === "-h" || k === "--help") a.help = true;
    else throw new Error(`未知参数: ${k}`);
  }
  return a;
}

function readJson(file) {
  if (!file || !existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

function defaultWorkspace() {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: GIT_TIMEOUT_MS });
  return r.status === 0 && r.stdout.trim() ? resolve(r.stdout.trim()) : process.cwd();
}

function stateRoot() {
  if (process.env.CTBZ_HOME) return resolve(process.env.CTBZ_HOME);
  const loc = readJson(join(homedir(), ".ctbz-location.json"));
  if (typeof loc?.root === "string") return loc.root;
  return join(homedir(), "Documents", ".ctbz");
}

// 世代 team.json：先认 初始化状态.json 的 teamPath，找不到再扫 generations/*/team.json 取 mtime 最新
function teamFileOf(state, root) {
  if (typeof state?.teamPath === "string" && existsSync(state.teamPath)) return state.teamPath;
  const gens = join(root, "generations");
  if (!existsSync(gens)) return null;
  let best = null;
  let bestMs = -1;
  for (const name of readdirSync(gens)) {
    const f = join(gens, name, "team.json");
    if (!existsSync(f)) continue;
    const ms = statSync(f).mtimeMs;
    if (ms > bestMs) { bestMs = ms; best = f; }
  }
  return best;
}

// 世代侧名单：档=variants 总数；模型=modelRef 短名去重；渠道=modelRef 的 provider 段去重
function analyzeGeneration(team) {
  const roles = team && typeof team.roles === "object" && team.roles ? team.roles : null;
  if (!roles) return null;
  const variants = [];
  const roleChannels = {};
  for (const [role, cfg] of Object.entries(roles)) {
    for (const v of Array.isArray(cfg?.variants) ? cfg.variants : []) {
      const ref = typeof v?.modelRef === "string" ? v.modelRef : "";
      if (!ref) continue;
      const parts = ref.split(/[:/]/);
      const provider = parts.length > 1 ? parts.slice(0, -1).join("/") : ref;
      variants.push({ role, model: normalizeKey(ref).model, provider });
      (roleChannels[role] ??= new Set()).add(provider);
    }
  }
  return { slots: variants.length, models: new Set(variants.map((v) => v.model)), variants, roleChannels };
}

// 宿主认识的模型：providerRules[].config.personalModelIds 并集；结构读不到→null（未知）
function hostModels(file) {
  const d = readJson(file);
  const rules = d?.config?.providerConfigRules?.providerRules;
  if (!Array.isArray(rules)) return null;
  const set = new Set();
  for (const r of rules) {
    for (const m of r?.config?.personalModelIds ?? []) if (typeof m === "string") set.add(m);
  }
  return set;
}

function diskProfileCount(state) {
  const dir = state?.agents;
  if (typeof dir !== "string" || !existsSync(dir)) return null;
  return readdirSync(dir).filter((n) => /^team-ctbz-[^/]+\.md$/.test(n)).length;
}

function git(ws, args) {
  const r = spawnSync("git", ["-C", ws, ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: GIT_TIMEOUT_MS });
  return r.status === 0 && typeof r.stdout === "string" ? r.stdout : null;
}

function deployState(ws) {
  const src = join(ws, "skills", "ctbz");
  const dst = join(homedir(), ".agents", "skills", "ctbz");
  if (!existsSync(src) || !existsSync(dst)) return null;
  const r = spawnSync("diff", ["-rq", dst, src],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: DIFF_TIMEOUT_MS });
  if (r.status === 0) return "一致";
  if (r.status === 1) return "漂移";
  return null;
}

function versionSection(ws) {
  const counts = git(ws, ["rev-list", "--left-right", "--count", "origin/main...main"]);
  const remote = git(ws, ["log", "-1", "--format=%h", "origin/main"]);
  const tags = git(ws, ["tag", "--sort=-creatordate"]);
  // 输出「左 右」=「远端领先 本地领先」
  const right = counts ? Number(counts.trim().split(/\s+/)[1]) : NaN;
  return {
    本地领先: Number.isFinite(right) ? right : null,
    远端: remote ? remote.trim() || null : null,
    部署: deployState(ws),
    tag: tags ? tags.split("\n").map((s) => s.trim()).filter(Boolean)[0] ?? null : null,
  };
}

// 探活输出解析（preflight --json）；导出供测试脱网断言
export function parseProbeStdout(text) {
  try {
    const j = JSON.parse(String(text ?? ""));
    return j && Array.isArray(j.rows) ? j : null;
  } catch { return null; }
}

export function summarizeProbe(j) {
  const rows = j.rows;
  const total = rows.length || Number(j.calls_made) || 0;
  const ok = Number.isFinite(j.ok) ? j.ok : rows.filter((r) => r.status === "ok").length;
  const fails = rows.filter((r) => r.status !== "ok").map((r) => {
    const tag = /限额|欠费|quota|insufficient|rate limit/i.test(String(r.detail ?? ""))
      ? "欠费" : r.status === "timeout" ? "超时" : "失败";
    return `${r.code ?? r.model ?? "?"} ${tag}`;
  });
  return { 可用: ok, 总数: total, 失败: fails };
}

// 探活段：spawnSync 调 preflight --json（真实计费 5 次），--no-probe 时整段不执行
function probeSection() {
  const r = spawnSync(process.execPath, [PREFLIGHT, "--json"],
    { encoding: "utf8", timeout: PROBE_TIMEOUT_MS, maxBuffer: 8 << 20 });
  const parsed = parseProbeStdout(r.stdout);
  return parsed ? summarizeProbe(parsed) : null;
}

function ledgerSection() {
  const entries = listLedger();
  const cooling = entries.filter((e) => e.cooling).length;
  return { 冷却: cooling, 过期: entries.length - cooling };
}

function todoSection(ws) {
  const p = readJson(join(ws, ".ctbz-record", "内审", "pending.json"));
  const pendingCount = Array.isArray(p?.pending) ? p.pending.length : 0; // 无文件/坏文件=0，与内审同口径
  // D4 决策清单落点尚未定型：只探约定 JSON，缺失标未知不编数
  const d = readJson(join(ws, ".ctbz-record", "决策清单.json"));
  let decisions = null;
  if (Array.isArray(d)) decisions = d.length;
  else if (d) for (const k of ["pending", "items", "待裁决"]) if (Array.isArray(d[k])) { decisions = d[k].length; break; }
  return { 内审: pendingCount, 决策清单: decisions };
}

function rosterSection(state, gen, host) {
  const genModels = gen ? [...gen.models].sort() : null;
  const audit = gen ? (() => {
    const coverage = {};
    const single = [];
    for (const role of KEY_ROLES) {
      const n = gen.roleChannels[role]?.size ?? 0;
      coverage[role] = n;
      if (n < 2) single.push(role);
    }
    return { 关键角色渠道: coverage, 单渠道: single };
  })() : null;
  return {
    名单: {
      磁盘: diskProfileCount(state),
      世代: gen ? gen.slots : null,
      世代模型: genModels ? genModels.length : null,
      宿主认档: gen && host ? gen.variants.filter((v) => host.has(v.model)).length : null,
      宿主认模型: gen && host ? genModels.filter((m) => host.has(m)).length : null,
      幽灵: gen && host ? genModels.filter((m) => !host.has(m)) : null,
    },
    编制检查: audit,
  };
}

const fmt = (v) => (v === null || v === undefined ? "未知" : String(v));

function ghostText(g) {
  return g === null ? "未知" : `${g.length}${g.length ? `（${g.join(",")}）` : ""}`;
}

function rosterLine(n, audit) {
  let line = `名单  磁盘 ${fmt(n.磁盘)} / 世代 ${fmt(n.世代)} / 宿主认 ${fmt(n.宿主认档)} 档（`
    + `${fmt(n.宿主认模型)}/${fmt(n.世代模型)} 模型）/ 幽灵 ${ghostText(n.幽灵)}`;
  if (audit?.单渠道?.length) line += `｜编制告警 单渠道: ${audit.单渠道.join(",")}`;
  return line;
}

function probeText(p) {
  if (p === null) return "未知（preflight 无输出或不可解析）";
  return `${p.可用}/${p.总数} 可用${p.失败.length ? `（${p.失败.join(",")}）` : ""}`;
}

function humanLines(report, withProbe) {
  const v = report.版本;
  const lines = [
    `版本  本地领先 ${fmt(v.本地领先)} / 远端 ${fmt(v.远端)} / 部署 ${fmt(v.部署)} / tag ${fmt(v.tag)}`,
    rosterLine(report.名单, report.编制检查),
    ...(withProbe ? [`探活  ${probeText(report.探活)}`] : []),
    `账本  冷却 ${report.账本.冷却} / 过期 ${report.账本.过期}`,
    `待办  内审 ${report.待办.内审} / 决策清单 ${fmt(report.待办.决策清单)}`,
  ];
  return lines.join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  let args;
  try { args = parseArgs(argv); } catch (e) {
    console.error(`${USAGE}\n✗ ${e.message}`);
    return 2;
  }
  if (args.help) { console.log(USAGE); return 0; }

  const ws = args.workspace ? resolve(args.workspace) : defaultWorkspace();
  const root = stateRoot();
  const state = readJson(join(root, "初始化状态.json"));
  const teamPath = teamFileOf(state, root);
  const gen = analyzeGeneration(teamPath ? readJson(teamPath) : null);
  const host = hostModels(process.env.CTBZ_PROVIDER_CONFIG || join(homedir(), ".zcode", "v2", "provider_config.json"));
  const roster = rosterSection(state, gen, host);
  const withProbe = !args.noProbe;
  const probe = withProbe ? probeSection() : undefined;

  const report = {
    工作区: ws,
    状态根: root,
    team文件: teamPath,
    版本: versionSection(ws),
    名单: roster.名单,
    ...(withProbe ? { 探活: probe } : {}),
    账本: ledgerSection(),
    待办: todoSection(ws),
    编制检查: roster.编制检查,
  };

  console.log(args.json ? JSON.stringify(report, null, 2) : humanLines(report, withProbe));
  return 0;
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  main().then((code) => process.exit(code)).catch((e) => { console.error(`✗ ${e.message}`); process.exit(2); });
}
