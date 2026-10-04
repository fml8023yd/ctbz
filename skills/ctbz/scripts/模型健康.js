#!/usr/bin/env node
// 模型健康 —— 草台班子 v2.1.4（A3：账本接线，实现收敛到 lib/健康账本.mjs，不再各脚本重复解析）
// 子命令:
//   report <模型> "<报错原文>"   解析冷却截止写账本（显式时间→retry-after→退避档 30分/1时/4时/1天）
//   ok <模型>                    记一次成功（fail_count-1、连击+1；连续成功 3 次清零）
//   check <模型...>              查询冷却状态（归一化互认；exit 1=有冷却中）
//   list                         列账本（含过期自愈状态）
//   migrate                      只读校验账本可读并输出旧键映射（不做破坏性转换）
// 存储根: ~/Documents/.ctbz/模型健康.json（环境变量 CTBZ_HEALTH_FILE 可覆盖）

import { readFileSync, existsSync } from "node:fs";
import { noteFailure, noteSuccess, isCooling, listLedger, ledgerFile, normalizeKey } from "./lib/健康账本.mjs";

function cmdReport(model, msg) {
  const e = noteFailure(model, msg);
  console.log(JSON.stringify({ ok: true, model, cooldown_until: e.cooldown_until }));
}

function cmdOk(model) {
  const e = noteSuccess(model);
  console.log(JSON.stringify({ ok: true, model, fail_count: e.fail_count, success_streak: e.success_streak }));
}

function cmdCheck(models) {
  const now = Date.now();
  const ledger = listLedger(now);
  const active = {};
  for (const m of models) {
    if (!isCooling(m, now)) continue;
    const name = normalizeKey(m).model;
    const hit = ledger.filter((e) => e.model === name && e.cooling).sort((a, b) => b.untilMs - a.untilMs)[0];
    active[m] = { cooldown_until: hit ? new Date(hit.untilMs).toISOString() : null };
  }
  console.log(JSON.stringify({ ok: true, 冷却中: active, 可派发: models.filter((m) => !active[m]) }, null, 2));
  if (Object.keys(active).length) process.exit(1); // select 前过滤用
}

function cmdList() {
  const now = Date.now();
  const out = {};
  for (const e of listLedger(now)) out[e.key] = { ...e.entry, 状态: e.cooling ? "冷却中" : "已自愈（可清理）" };
  console.log(JSON.stringify(out, null, 2));
}

function cmdMigrate() {
  const file = ledgerFile();
  let mapping = {};
  let error = null;
  if (existsSync(file)) {
    try {
      const d = JSON.parse(readFileSync(file, "utf8"));
      mapping = Object.fromEntries(Object.keys(d ?? {}).map((k) => [k, normalizeKey(k).model]));
    } catch (e) { error = e.message; }
  }
  const keys = Object.keys(mapping).length;
  console.log(JSON.stringify({ ok: !error, file, keys, 旧键可读: !error, 键映射: mapping, ...(error ? { error } : {}), note: "读路径按归一化双读旧键；本命令只读，不做破坏性转换" }, null, 2));
  if (error) process.exit(1);
}

const [cmd, ...rest] = process.argv.slice(2);
const USAGE = '用法: 模型健康.js report <模型> "<报错>" | ok <模型> | check <模型...> | list | migrate';
try {
  if (cmd === "report" && rest[0]) cmdReport(rest[0], rest.slice(1).join(" "));
  else if (cmd === "ok" && rest[0]) cmdOk(rest[0]);
  else if (cmd === "check" && rest.length) cmdCheck(rest);
  else if (cmd === "list") cmdList();
  else if (cmd === "migrate") cmdMigrate();
  else { console.log(USAGE); process.exit(2); }
} catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
