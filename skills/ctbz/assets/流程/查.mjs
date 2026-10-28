#!/usr/bin/env node
// 查.mjs — CTBZ 受管模板：在流程/index.json 里按关键词检索流程资产
// 用法: node 查.mjs <关键词>
// 匹配范围: id / title / notes / preconditions（不区分大小写）
// 退出码: 0=有匹配, 1=无匹配/关键词缺失/索引缺失或异常
//
// 目录缺失或 index.json 缺失时给出「未初始化」提示（不静默）：
//   首次安装执行 CTBZ 部署（核心包 scripts/部署.js）会自动把模板落到本目录；
//   也可以手动从核心包 skills/ctbz/assets/流程/ 复制骨架文件到本目录。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(DIR, 'index.json');

function fail(msg) {
  console.error(`查.mjs ERROR: ${msg}`);
  process.exit(1);
}

function failNotInitialized() {
  console.error(`查.mjs ERROR: 索引文件不存在（流程资产未初始化）: ${INDEX_PATH}`);
  console.error('提示: 运行 CTBZ 核心包 scripts/部署.js 会自动安装 assets/流程 模板到本目录；');
  console.error('     或手动从 skills/ctbz/assets/流程/ 复制 index.json 骨架。');
  console.error('     索引缺失期间，流程资产规则降级为「只提示不拦截」。');
  process.exit(1);
}

const keyword = process.argv[2];
if (!keyword || !keyword.trim()) {
  fail('用法: node 查.mjs <关键词>');
}

if (!fs.existsSync(INDEX_PATH)) failNotInitialized();

let raw;
try {
  raw = fs.readFileSync(INDEX_PATH, 'utf8');
} catch (e) {
  fail(`无法读取索引文件 ${INDEX_PATH}: ${e.message}`);
}

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  fail(`索引文件 JSON 解析失败（文件可能损坏）: ${e.message}`);
}

if (!data || !Array.isArray(data.entries)) {
  fail('索引结构非法: 顶层缺少 entries 数组');
}

const kw = keyword.trim().toLowerCase();

function haystack(entry) {
  const parts = [
    String(entry.id ?? ''),
    String(entry.title ?? ''),
    String(entry.notes ?? ''),
    ...((entry.preconditions ?? []).map((p) => String(p))),
  ];
  return parts.join(' ').toLowerCase();
}

const matches = data.entries.filter((e) => e && haystack(e).includes(kw));

if (matches.length === 0) {
  console.log('NO_MATCH');
  process.exit(1);
}

for (const m of matches) {
  console.log(`id: ${m.id}`);
  console.log(`title: ${m.title}`);
  console.log(`docPath: ${m.docPath}`);
  console.log(`acceptance.command: ${m.acceptance?.command ?? '(none)'}`);
  console.log(`lastVerified: ${m.lastVerified ?? '(未校验)'}`);
  console.log('---');
}

process.exit(0);
