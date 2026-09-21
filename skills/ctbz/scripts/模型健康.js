#!/usr/bin/env node
// 模型健康 —— 草台班子 dsh 版（账本写入与查询）
// 子命令:
//   report <provider/model> "<报错原文>"   从限额类报错解析重置时间戳写账本（复合键，与选型器同形）
//   check <provider/model...>              查询冷却状态（exit 1=有冷却中）
//   list                                   列账本（含过期自愈标注）
// 存储根: ~/Documents/.ctbz/模型健康.json（仓库外，跨版本有效，权限 0600）
// schema 契约: references/派发.md 第 5 节（T3 锁定）；keys 为 "provider/model" 复合键。
// 旧版短名键（glm、glm-5.3-flash 等）不匹配任何 provider/model，保留原样不迁移（选型器跳过不报错）。
// 安全约定: 报错原文截断保存（120 字符），凭据不经由本脚本进入账本/日志。

import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), "Documents", ".ctbz");
const FILE = join(DIR, "模型健康.json");

function ensureFile() {
  if (!existsSync(FILE)) {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, "{}\n", { mode: 0o600 });
    chmodSync(FILE, 0o600);
  }
}
function load() {
  ensureFile();
  // 首次触碰即把历史文件权限收紧到 0600（含账本可能含模型/渠道名，不应对组/其他人可读）
  if ((statSync(FILE).mode & 0o777) !== 0o600) chmodSync(FILE, 0o600);
  try {
    const d = JSON.parse(readFileSync(FILE, "utf8"));
    if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("顶层不是对象");
    return d;
  } catch (e) {
    throw new Error(`账本 ${FILE} 读取失败（${e.message}）`);
  }
}
function save(d) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(d, null, 2) + "\n");
  chmodSync(FILE, 0o600); // 0600 强制约束，防 umask 放宽
}
// 从报错原文解析冷却截止（如 "限额将在 2026-09-25 18:00:00 重置" 或 "retry after 3600s"）。
// 两种口径: ①显式日期时间（按北京时间 +08:00 解释）②相对秒数 retry-after。
function parseCooldown(msg) {
  const m = msg.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(:\d{2})?)/);
  if (m) {
    const iso = `${m[1]}T${m[2]}${m[2].length === 5 ? ":00" : ""}`; // 北京时间
    const t = Date.parse(`${iso}+08:00`);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  const r = msg.match(/(?:retry|retried|after)\D{0,8}(\d{1,6})\s*s/i);
  if (r) {
    const t = Date.now() + Number(r[1]) * 1000;
    return new Date(t).toISOString();
  }
  return null;
}

function cmdReport(key, msg) {
  if (!key || !key.includes("/")) {
    console.error("✗ 键必须是 provider/model 复合键（如 workbuddy/hy3），旧短名不再受理（schema 见 references/派发.md 第 5 节）");
    process.exit(2);
  }
  if (!msg.trim()) { console.error("✗ 缺少报错原文"); process.exit(2); }
  const d = load();
  const until = parseCooldown(msg);
  if (!until) { console.error("✗ 未从报错解析出重置时间戳（需含 YYYY-MM-DD HH:mm 或 retry after <n>s）"); process.exit(1); }
  d[key] = { cooldown_until: until, source: msg.slice(0, 120), recorded_at: new Date().toISOString() };
  save(d);
  console.log(JSON.stringify({ ok: true, key, cooldown_until: until, ledger: FILE }, null, 2));
}

function cmdCheck(keys) {
  const d = load();
  const now = Date.now();
  const active = {};
  for (const k of keys) {
    const e = d[k];
    if (e && Date.parse(e.cooldown_until) > now) active[k] = { cooldown_until: e.cooldown_until, source: e.source };
  }
  console.log(JSON.stringify({ ok: true, 冷却中: active, 可派发: keys.filter((k) => !active[k]) }, null, 2));
  if (Object.keys(active).length) process.exit(1); // select 前过滤用
}

function cmdList() {
  const d = load();
  const now = Date.now();
  const out = {};
  for (const [k, e] of Object.entries(d)) {
    const until = Date.parse(e.cooldown_until);
    out[k] = Number.isNaN(until)
      ? { ...e, 状态: "字段异常（cooldown_until 不可解析）" }
      : { ...e, 状态: until > now ? "冷却中" : "已自愈（可清理）" };
  }
  console.log(JSON.stringify(out, null, 2));
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "report") cmdReport(rest[0], rest.slice(1).join(" "));
  else if (cmd === "check") cmdCheck(rest);
  else if (cmd === "list") cmdList();
  else { console.log("用法: 模型健康.js report <provider/model> \"<报错>\" | check <provider/model...> | list"); process.exit(2); }
} catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
