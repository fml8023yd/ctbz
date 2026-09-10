#!/usr/bin/env node
// settings —— 草台班子 v1.8.0 用户偏好体系
// 子命令:
//   init        初始化访谈（继承旧版 settings 与环境变量，只问变化项/新增项）
//   show        显示当前 settings（脱敏：不含 key 值）
//   get <路径>   读某字段（如 触点.推送开关）
// 存储根: ~/Documents/.ctbz/setting.yaml（用户级跨版本）

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = join(homedir(), "Documents", ".ctbz");
const FILE = join(ROOT, "setting.yaml");

const VERSION = (readFileSync(join(dirname2(), "SKILL.md"), "utf8").match(/^version:\s*(\S+)/m) || [])[1] || "unknown";
function dirname2() { return dirnameOf(import.meta.url); }
function dirnameOf(u) { return join(u.replace(/^file:\/\//, "").split("/").slice(0, -2).join("/")); }

const DEFAULTS = {
  版本: VERSION,
  权限边界: { 执行档位: "标准", 计划超时自动执行: 0, 可写目录: [] },
  触点: { serverchan_key_env: "", 推送开关: false },
  知识库: { 自动沉淀: true, 待批提醒: true },
  继承来源: "",
};

// 极简 YAML 读写（扁平+一层嵌套，够 settings 用；不引依赖）
function parseYaml(text) {
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  for (const raw of text.split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = raw.match(/^(\s*)/)[1].length;
    const kv = raw.trim().match(/^([^:]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    let val = kv[2].trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (val === "") {
      parent[key] = {};
      stack.push({ indent, obj: parent[key] });
      continue;
    }
    if (val.startsWith("[")) { try { val = JSON.parse(val.replace(/'/g, '"')); } catch {} }
    else if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);
    else if (val === "true") val = true;
    else if (val === "false") val = false;
    else val = val.replace(/^["']|["']$/g, "");
    parent[key] = val;
  }
  return root;
}
function toYaml(obj, indent = "") {
  return Object.entries(obj).map(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v)) return `${indent}${k}:\n` + toYaml(v, indent + "  ");
    if (Array.isArray(v)) return `${indent}${k}: ${JSON.stringify(v)}`;
    return `${indent}${k}: ${v}`;
  }).join("\n");
}

function oldSettingsCandidates() {
  const found = [];
  try {
    for (const e of readdirSync(ROOT, { withFileTypes: true })) {
      if (e.isDirectory() && /^\d/.test(e.name)) {
        const fp = join(ROOT, e.name, "setting.yaml");
        if (existsSync(fp)) found.push({ from: `版本目录 ${e.name}`, data: parseYaml(readFileSync(fp, "utf8")) });
      }
    }
    const root = join(ROOT, "setting.yaml");
    if (existsSync(root)) found.push({ from: "根目录", data: parseYaml(readFileSync(root, "utf8")) });
  } catch {}
  return found;
}

function envInherit() {
  const env = { 触点: {} };
  if (process.env.SERVERCHAN_SENDKEY) {
    env.触点.serverchan_key_env = "SERVERCHAN_SENDKEY";
    env.触点.推送开关 = true;
  }
  return env;
}

function mergeInherit(base, candidates) {
  const merged = structuredClone(base);
  const notes = [];
  for (const c of candidates) {
    for (const [k, v] of Object.entries(c.data)) {
      if (DEFAULTS[k] && typeof DEFAULTS[k] === "object" && !Array.isArray(DEFAULTS[k])) {
        merged[k] = { ...merged[k], ...v };
      } else if (!(k in merged) || merged[k] === DEFAULTS[k] || merged[k] === "") merged[k] = v;
      notes.push(`${c.from}:${k}`);
    }
  }
  return { merged, notes };
}

function cmdInit() {
  const candidates = oldSettingsCandidates();
  const env = envInherit();
  let base = structuredClone(DEFAULTS);
  base.版本 = VERSION;
  const { merged, notes } = mergeInherit(base, candidates);
  if (env.触点 && Object.keys(env.触点).length) {
    merged.触点 = { ...merged.触点, ...env.触点 };
    notes.push("环境变量:SERVERCHAN_SENDKEY");
  }
  merged.继承来源 = notes.join("; ") || "无（全新安装）";
  if (merged.权限边界.计划超时自动执行 > 0 && !merged.触点.推送开关) {
    console.error("⚠ 计划超时自动执行需要推送触点（ServerChan）配合，当前推送开关为 false");
  }
  writeFileSync(FILE, toYaml(merged) + "\n");
  console.log(JSON.stringify({ ok: true, file: FILE, 继承: notes, 提示: "已写入；请核对权限边界与触点配置" }, null, 2));
}

function cmdShow() {
  if (!existsSync(FILE)) { console.log(JSON.stringify({ ok: false, 提示: "尚未初始化，运行 settings.js init" })); return; }
  const d = parseYaml(readFileSync(FILE, "utf8"));
  if (d.触点?.serverchan_key_env) d.触点.serverchan_key_env = d.触点.serverchan_key_env + "（值不展示）";
  console.log(JSON.stringify(d, null, 2));
}

function cmdGet(path) {
  if (!existsSync(FILE)) { console.error("✗ 尚未初始化"); process.exit(1); }
  const d = parseYaml(readFileSync(FILE, "utf8"));
  let cur = d;
  for (const k of path.split(".")) { cur = cur?.[k]; if (cur === undefined) break; }
  console.log(JSON.stringify({ key: path, value: cur ?? null }));
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "init") cmdInit();
  else if (cmd === "show") cmdShow();
  else if (cmd === "get") cmdGet(rest[0] || "");
  else { console.log("用法: settings.js init|show|get <路径>"); process.exit(2); }
} catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
