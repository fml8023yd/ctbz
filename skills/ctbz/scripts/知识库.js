#!/usr/bin/env node
// 知识库 —— 草台班子 v1.7.0
// 子命令:
//   add     <分区> <文件名|->  <内容stdin>   写条目（自记/待批，头部带触发词）
//   search  "<任务原文>"                      触发词交集检索（归一化匹配）
//   index                                    扫描条目头重建 目录.md
//   approve <待批文件名>                      待批 → 正式库（需用户命令）
//   conflict <条目> "<现场事实>"              冲突登记 → 自记库待确认段
// 存储根: ~/Documents/.ctbz/{当前版本}/知识库/  （版本自解析 SKILL.md frontmatter）

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const VERSION = (readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8").match(/^version:\s*(\S+)/m) || [])[1] || "unknown";
const KB_ROOT = join(homedir(), "Documents", ".ctbz", VERSION, "知识库");
const PARTS = ["建模", "业务", "数据", "案例"];

const norm = (s) => s.toLowerCase().replace(/[_\s]/g, "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
const today = () => new Date().toISOString().slice(0, 10);

function ensureSkeleton() {
  mkdirSync(KB_ROOT, { recursive: true });
  mkdirSync(join(KB_ROOT, "待批区"), { recursive: true });
  for (const f of ["常用.md", "目录.md", ...PARTS.map((p) => `${p}.md`)]) {
    const fp = join(KB_ROOT, f);
    if (!existsSync(fp)) {
      const head = f === "常用.md"
        ? "# 常用速查（人工置顶，不自动晋升）\n\n每行一条高频知识速查；本文件是排序器不是闸门——候选在目录.md 全量上求并集。\n\n- 知识库使用法（触发：知识库|怎么加知识|怎么查知识）→ 本文件\n"
        : f === "目录.md"
          ? "# 知识库目录\n\n每条一行：标题（触发：词1|词2）→ 分区文件#锚点。由 `知识库.js index` 从条目头重建。\n"
          : `# ${f.replace(".md", "")}类知识\n\n收录标准：单类单一主题；条目头=触发词唯一事实源。\n`;
      writeFileSync(fp, head);
    }
  }
}

function scanEntries() {
  // 扫描各分区文件与自记库，产出 {标题, 触发词[], 锚点} 列表（按 ⚡条目 或 ## 标题 识别）
  const out = [];
  for (const f of [...PARTS.map((p) => `${p}.md`), "自记库-" + today().slice(0, 7) + ".md"]) {
    const fp = join(KB_ROOT, f);
    if (!existsSync(fp)) continue;
    const lines = readFileSync(fp, "utf8").split("\n");
    let cur = null;
    for (const line of lines) {
      const m = line.match(/^##+\s+(.+)$/);
      if (m) {
        if (cur) out.push(cur);
        const full = m[1].trim();
        const trig = full.match(/（触发：([^）]*)）/) || full.match(/\(触发：([^)]*)\)/);
        const title = full.replace(/（触发：[^）]*）/g, "").replace(/\(触发：[^)]*\)/g, "").trim();
        const triggers = trig ? trig[1].split(/[|｜]/).map(norm) : [norm(title)];
        cur = { file: f, title, triggers: triggers.filter(Boolean), line: lines.indexOf(line) + 1 };
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

function cmdSearch(query) {
  ensureSkeleton();
  const q = norm(query);
  const entries = scanEntries();
  const hits = entries.filter((e) => e.triggers.some((t) => t && (q.includes(t) || t.includes(q))));
  const result = {
    version: VERSION, query, root: KB_ROOT,
    hits: hits.map((h) => ({ 标题: h.title, 位置: `${h.file}#L${h.line}`, 触发词命中: true })),
    零命中分支: hits.length ? undefined : "缺口阻塞任务定义→问用户限一次；不阻塞→通用能力开工+缺口进待确认项；反审确认库缺→写自记库+检索缺口台账",
  };
  console.log(JSON.stringify(result, null, 2));
}

function cmdIndex() {
  ensureSkeleton();
  const entries = scanEntries();
  const lines = ["# 知识库目录", "", "每条一行：标题（触发：词1|词2）→ 分区文件#锚点。由 `知识库.js index` 从条目头重建。", ""];
  for (const e of entries) lines.push(`- ${e.title}（触发：${e.triggers.join("|")}）→ ${e.file}#L${e.line}`);
  writeFileSync(join(KB_ROOT, "目录.md"), lines.join("\n") + "\n");
  console.log(JSON.stringify({ ok: true, indexed: entries.length }));
}

function cmdAdd(args) {
  ensureSkeleton();
  const [area, name] = args;
  const body = readFileSync(0, "utf8");
  const fp = area === "自记" ? join(KB_ROOT, "自记库-" + today().slice(0, 7) + ".md")
    : area === "待批" ? join(KB_ROOT, "待批区", name || `条目-${today()}.md`)
    : join(KB_ROOT, `${area}.md`);
  if (area === "自记") {
    appendFileSync(fp, body.endsWith("\n") ? body : body + "\n");
  } else {
    writeFileSync(fp, body);
  }
  cmdIndex();
  console.log(JSON.stringify({ ok: true, file: fp }));
}

function cmdApprove(args) {
  ensureSkeleton();
  const name = args[0];
  const src = join(KB_ROOT, "待批区", name);
  if (!existsSync(src)) { console.error(`✗ 待批条目不存在: ${name}`); process.exit(1); }
  const body = readFileSync(src, "utf8");
  // 默认进建模.md 末尾（审批时可指定分区，1.7.0 简化）
  appendFileSync(join(KB_ROOT, "建模.md"), "\n" + body);
  const arch = join(KB_ROOT, "待批区", "已批-" + name);
  writeFileSync(arch, body); // 保留原文，删除待批原件
  const { rmSync } = await_import();
  rmSync(src);
  cmdIndex();
  console.log(JSON.stringify({ ok: true, approved: name }));
}
function await_import() { return { rmSync: require_node_fs() }; }
function require_node_fs() { return require0(); }
function require0() { // 简化：动态取 rmSync
  return (0, eval)("require")("node:fs").rmSync;
}

function cmdConflict(args) {
  ensureSkeleton();
  const [entry, fact] = args;
  const line = `【冲突待确认】${today()} 条目:${entry} 现场:${fact} → 状态:待用户裁定（高风险跳过该点，低风险现场优先）\n`;
  appendFileSync(join(KB_ROOT, "自记库-" + today().slice(0, 7) + ".md"), line);
  console.log(JSON.stringify({ ok: true, action: "已登记冲突待确认（自记库）" }));
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "search") cmdSearch(rest[0] || "");
  else if (cmd === "index") cmdIndex();
  else if (cmd === "add") cmdAdd(rest);
  else if (cmd === "approve") cmdApprove(rest);
  else if (cmd === "conflict") cmdConflict(rest);
  else { console.log("用法: 知识库.js add|search|index|approve|conflict ..."); process.exit(2); }
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
