#!/usr/bin/env node
// 模型健康 —— 草台班子 v1.8.0（1.7.1 条款落地）
// 子命令:
//   report <模型短名> "<报错原文>"   从限额类报错解析重置时间戳写账本
//   check <模型短名...>              查询冷却状态（exit 1=有冷却中）
//   list                             列账本（含过期自愈）
// 存储根: ~/Documents/.ctbz/模型健康.json（版本目录外，跨版本有效）

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const FILE = join(homedir(), "Documents", ".ctbz", "模型健康.json");

function load() {
  if (!existsSync(FILE)) return {};
  return JSON.parse(readFileSync(FILE, "utf8"));
}
function save(d) {
  mkdirSync(join(homedir(), "Documents", ".ctbz"), { recursive: true });
  writeFileSync(FILE, JSON.stringify(d, null, 2));
}
// 从报错原文解析冷却截止（如 "限额将在 2026-09-10 23:55:37 重置"）
function parseCooldown(msg) {
  const m = msg.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(:\d{2})?)/);
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}${m[2].length === 5 ? ":00" : ""}`; // 北京时间
  const t = Date.parse(`${iso}+08:00`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function cmdReport(model, msg) {
  const d = load();
  const until = parseCooldown(msg);
  if (!until) { console.error("✗ 未从报错解析出重置时间戳（需含 YYYY-MM-DD HH:mm）"); process.exit(1); }
  d[model] = { cooldown_until: until, source: msg.slice(0, 120), recorded_at: new Date().toISOString() };
  save(d);
  console.log(JSON.stringify({ ok: true, model, cooldown_until: until }));
}

function cmdCheck(models) {
  const d = load();
  const now = Date.now();
  const active = {};
  for (const m of models) {
    const e = d[m];
    if (e && Date.parse(e.cooldown_until) > now) active[m] = { cooldown_until: e.cooldown_until };
  }
  console.log(JSON.stringify({ ok: true, 冷却中: active, 可派发: models.filter((m) => !active[m]) }, null, 2));
  if (Object.keys(active).length) process.exit(1); // select 前过滤用
}

function cmdList() {
  const d = load();
  const now = Date.now();
  const out = {};
  for (const [m, e] of Object.entries(d)) {
    out[m] = { ...e, 状态: Date.parse(e.cooldown_until) > now ? "冷却中" : "已自愈（可清理）" };
  }
  console.log(JSON.stringify(out, null, 2));
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "report") cmdReport(rest[0], rest.slice(1).join(" "));
  else if (cmd === "check") cmdCheck(rest);
  else if (cmd === "list") cmdList();
  else { console.log("用法: 模型健康.js report <模型> \"<报错>\" | check <模型...> | list"); process.exit(2); }
} catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
