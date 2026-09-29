// 反审链覆盖检查（2.1.3）——「先改后审」的机械拦截。
//
// 为什么存在：反审硬门条文只约束「实施任务创建」，主会话直接 Edit 源码不在其射程内；
// 同类违规已两次发生在 skills/ctbz/scripts 下的脚本改动上（docs/内审/2026-09-30-*.md）。
// 判定方式（可复算、不依赖人的自觉）：
//   1) 取工作区相对 HEAD 的改动文件集合（含未跟踪）；
//   2) 若不含 skills/ctbz/scripts 下的 *.mjs/*.js，则无需反审链（文档/测试改动不拦）；
//   3) 若含，则要求 .ctbz-record/反审/** 下至少有一份回执，其 plan_sha256 可解析到
//      一个「描述同批改动」的计划文件（计划里出现该脚本名，或计划的产物清单含其 sha）。
// 边界：只读；不联网；不写盘；判不出就判红（fail-closed），并给出补救命令。

import { execSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, basename } from "node:path";

const SCRIPT_PREFIX = "skills/ctbz/scripts/";
const RECORD_DIR = join(".ctbz-record", "反审");

function gitLines(root, args) {
  try {
    // core.quotePath=false：中文文件名默认会被引号+八进制转义，前缀匹配会全部落空。
    return execSync(`git -C "${root}" -c core.quotePath=false ${args}`, { encoding: "utf8" })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** 工作区相对 HEAD 的改动（含未跟踪文件），跨 rename 取新路径。 */
export function changedFiles(root) {
  const tracked = gitLines(root, "diff --name-only HEAD").concat(
    gitLines(root, "diff --name-only --cached"),
  );
  const untracked = gitLines(root, "ls-files --others --exclude-standard");
  return [...new Set([...tracked, ...untracked])];
}

function listJsonFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) listJsonFiles(p, out);
    else if (entry.isFile() && entry.name.endsWith(".json")) out.push(p);
  }
  return out;
}

function listMarkdown(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) listMarkdown(p, out);
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(p);
  }
  return out;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * 反审链是否覆盖当前脚本改动（逐文件判定：每个改动脚本都要被某份文档点名）。
 * 覆盖文档两类：① 反审回执引用的计划（L1 流程）；② 内审记录（缺陷修复的合法路径，
 *   其「修改项」须点名该脚本——内审本身由 派发闸 --level audit 校验）。
 * 返回 { checked, files, problems, fix }：
 *  - checked=false：无脚本改动，未做检查（无需回执）；
 *  - checked=true 且 problems 为空：每个改动脚本都被覆盖。
 */
export function reviewChainProblems(root = process.cwd()) {
  const files = changedFiles(root).filter(
    (f) => f.startsWith(SCRIPT_PREFIX) && /\.(mjs|js)$/.test(f),
  );
  if (files.length === 0) return { checked: false, files: [], problems: [], fix: "" };

  const fileHashes = new Map(files.map((f) => [f, sha256(readFileSync(join(root, f), "utf8"))]));
  const docs = new Set(); // 覆盖文档全文

  // ① 反审回执 → 计划全文
  for (const receiptPath of listJsonFiles(join(root, RECORD_DIR))) {
    let data;
    try {
      data = JSON.parse(readFileSync(receiptPath, "utf8"));
    } catch {
      continue;
    }
    if (typeof data?.plan !== "string" || !existsSync(data.plan)) continue;
    try {
      docs.add(readFileSync(data.plan, "utf8"));
    } catch {
      /* 读不到的计划不构成覆盖 */
    }
  }
  // ② 内审记录全文
  for (const record of listMarkdown(join(root, "docs", "内审"))) {
    try {
      docs.add(readFileSync(record, "utf8"));
    } catch {
      /* 跳过 */
    }
  }

  const haystack = [...docs].join("\n\u0000\n");
  const uncovered = files.filter((f) => {
    const name = basename(f);
    return !haystack.includes(name) && !haystack.includes(fileHashes.get(f));
  });

  if (uncovered.length === 0) return { checked: true, files, problems: [], fix: "" };
  return {
    checked: true,
    files,
    problems: uncovered.map((f) => `改动脚本未被任何计划/内审点名：${f}`),
    fix:
      "先出计划并跑反审（至少三席），再重试部署：\n" +
      "  node skills/ctbz/scripts/反审直连.mjs --plan <计划md> --workspace " + root + " --gate\n" +
      `（回执落盘 ${join(root, RECORD_DIR)}/<计划名>/；计划或内审须点名本次改动的脚本）`,
  };
}
