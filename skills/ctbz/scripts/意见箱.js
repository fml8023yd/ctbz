#!/usr/bin/env node
// 意见箱 —— 草台班子 v1.7.0（node 版，取代 意见箱.py）
// 用法: 意见箱.js "<用户意见原文>"
// 行为: 原封记录至 ~/Documents/.ctbz/{当前版本}/意见箱/意见-YYYY-MM.md
// 版本号: 自解析本 skill 的 SKILL.md frontmatter（调用方不传，防分叉）
// 输出: 一行 JSON {ok, file, line, entry}（供父会话按反馈模板复述）

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const VERSION = (readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8").match(/^version:\s*(\S+)/m) || [])[1] || "unknown";

const msg = (process.argv[2] || "").trim();
if (!msg) { console.error("✗ 用法: 意见箱.js \"<意见原文>\""); process.exit(1); }

const boxDir = join(homedir(), "Documents", ".ctbz", VERSION, "意见箱");
mkdirSync(boxDir, { recursive: true });
const file = join(boxDir, `意见-${new Date().toISOString().slice(0, 7)}.md`);

const entry = `【${new Date().toLocaleString("zh-CN", { hour12: false })}】【草台班子 ${VERSION}】【记录性质：仅记录未采纳】【${msg.replace(/\n/g, "\\n")}】\n`;
const existed = existsSync(file);
if (!existed) writeFileSync(file, "# 意见箱\n\n");
appendFileSync(file, entry);

const lineNo = readFileSync(file, "utf8").split("\n").filter(Boolean).length;
console.log(JSON.stringify({ ok: true, file, line: lineNo, entry: entry.trim(), version: VERSION }, null, 2));
