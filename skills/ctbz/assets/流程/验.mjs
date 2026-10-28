#!/usr/bin/env node
// 验.mjs — CTBZ 受管模板：执行 流程/index.json 里某条流程的 acceptance.command 并回写校验状态
// 用法: node 验.mjs <id>
//        node 验.mjs --self     （自检：不依赖任何条目，只验证目录骨架与脚本可运行）
// 退出码: 0=PASS/自检通过, 1=FAIL/命令异常/超时, 2=UNKNOWN_ID/用法错误, 3=索引缺失或异常
// 命令超时: 60 秒
// PASS 时原子写回 index.json（先写临时文件再 rename），lastVerified=ISO 时间, verifiedBy=manual
//
// 目录缺失或 index.json 缺失时给出「未初始化」提示（不静默），退出码 3：
//   首次安装执行 CTBZ 部署（核心包 scripts/部署.js）会自动把模板落到本目录；
//   也可以手动从核心包 skills/ctbz/assets/流程/ 复制骨架文件到本目录。

import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(DIR, 'index.json');
const TIMEOUT_MS = 60_000;

function failIndex(msg) {
  console.error(`验.mjs ERROR: ${msg}`);
  process.exit(3);
}

function failNotInitialized() {
  console.error(`验.mjs ERROR: 索引文件不存在（流程资产未初始化）: ${INDEX_PATH}`);
  console.error('提示: 运行 CTBZ 核心包 scripts/部署.js 会自动安装 assets/流程 模板到本目录；');
  console.error('     或手动从 skills/ctbz/assets/流程/ 复制 index.json 骨架。');
  console.error('     索引缺失期间，流程资产规则降级为「只提示不拦截」。');
  process.exit(3);
}

const arg = process.argv[2];

// --self：目录级自检，不需要 index.json，也不需要任何条目。
if (arg === '--self') {
  const required = ['查.mjs', '验.mjs'];
  const missing = required.filter((name) => !fs.existsSync(path.join(DIR, name)));
  if (missing.length) {
    console.error(`验.mjs SELF_FAIL: 缺少骨架文件 ${missing.join(', ')}`);
    process.exit(1);
  }
  exec('node -e "process.exit(0)"', { timeout: TIMEOUT_MS, shell: '/bin/bash' }, (err) => {
    if (err) {
      console.error('验.mjs SELF_FAIL: node 运行时不可用');
      process.exit(1);
    }
    console.log('SELF_PASS dir=' + DIR);
    console.log('files: ' + required.join(', ') + (fs.existsSync(INDEX_PATH) ? ', index.json' : ' (index.json 缺失 → 未初始化)'));
    process.exit(0);
  });
} else {
  if (!arg || !arg.trim()) {
    console.error('用法: node 验.mjs <id> | node 验.mjs --self');
    process.exit(2);
  }

  if (!fs.existsSync(INDEX_PATH)) failNotInitialized();

  let raw;
  try {
    raw = fs.readFileSync(INDEX_PATH, 'utf8');
  } catch (e) {
    failIndex(`无法读取索引文件 ${INDEX_PATH}: ${e.message}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    failIndex(`索引文件 JSON 解析失败（文件可能损坏）: ${e.message}`);
  }

  if (!data || !Array.isArray(data.entries)) {
    failIndex('索引结构非法: 顶层缺少 entries 数组');
  }

  const id = arg.trim();
  const entry = data.entries.find((e) => e && e.id === id);
  if (!entry) {
    console.log(`UNKNOWN_ID: ${id}`);
    process.exit(2);
  }

  const command = entry.acceptance?.command;
  if (!command || typeof command !== 'string') {
    console.log(`FAIL id=${entry.id}`);
    console.log('reason: acceptance.command 缺失或非法');
    process.exit(1);
  }

  const started = Date.now();

  exec(command, { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, shell: '/bin/bash' }, (err, stdout, stderr) => {
    const elapsedMs = Date.now() - started;
    const elapsed = (elapsedMs / 1000).toFixed(2);
    const out = (stdout || '').trim();
    const errOut = (stderr || '').trim();

    if (err) {
      const reason = err.killed
        ? `命令超时（${TIMEOUT_MS / 1000}s）被终止`
        : err.code === 124
          ? `命令超时（${TIMEOUT_MS / 1000}s）被终止`
          : `exit=${err.code ?? err.signal ?? '?'} ${err.message}`;
      console.log(`FAIL id=${entry.id}`);
      console.log(`reason: ${reason}`);
      if (out) console.log(`stdout: ${out}`);
      if (errOut) console.log(`stderr: ${errOut}`);
      console.log(`elapsed: ${elapsed}s`);
      process.exit(1);
    }

    // PASS — 原子写回
    const nowIso = new Date().toISOString();
    const target = data.entries.find((e) => e && e.id === entry.id);
    target.lastVerified = nowIso;
    target.verifiedBy = 'manual';
    data.updatedAt = nowIso;

    const tmpPath = path.join(DIR, `.index.json.tmp-${process.pid}`);
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      fs.renameSync(tmpPath, INDEX_PATH);
    } catch (e) {
      try { fs.unlinkSync(tmpPath); } catch (_) { /* noop */ }
      console.log(`PASS id=${entry.id}`);
      console.log(`stdout: ${out}`);
      console.log(`elapsed: ${elapsed}s`);
      console.error(`验.mjs ERROR: PASS 但写回 index.json 失败: ${e.message}`);
      process.exit(1);
    }

    console.log(`PASS id=${entry.id}`);
    if (out) console.log(`stdout: ${out}`);
    if (errOut) console.log(`stderr: ${errOut}`);
    console.log(`elapsed: ${elapsed}s`);
    console.log(`lastVerified: ${nowIso}`);
    process.exit(0);
  });
}
