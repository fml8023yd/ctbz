#!/usr/bin/env node
// 知识库 —— 草台班子 v1.7.0
// 子命令:
//   add     <分区> <文件名|->  <内容stdin>   写条目（自记/待批，头部带触发词）
//   search  "<任务原文>"                      触发词交集检索（归一化匹配）
//   index                                    扫描条目头重建 目录.md
//   approve <待批文件名>                      待批 → 正式库（需用户命令）
//   conflict <条目> "<现场事实>"              冲突登记 → 自记库待确认段
// 存储根: ~/Documents/.ctbz/{当前版本}/知识库/  （版本自解析 SKILL.md frontmatter）

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync, statSync, lstatSync, accessSync, constants, rmSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, isAbsolute, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const VERSION = (readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8").match(/^\s*version:\s*(\S+)/m) || [])[1] || "unknown";
const legacyRoot = join(homedir(), "Documents", ".ctbz", "知识库");
const configured = process.env.CTBZ_KNOWLEDGE_DIRS;
let roots;
try {
 roots = configured === undefined ? [legacyRoot] : configured.trim().startsWith('[') ? JSON.parse(configured) : [configured];
 if(!Array.isArray(roots)||!roots.length||roots.some(p=>typeof p!=='string'||!isAbsolute(p)))throw Error('CTBZ_KNOWLEDGE_DIRS 必须为绝对路径或非空 JSON 路径数组');
 roots=[...new Set(roots.map(p=>configured!==undefined?realpathSync(p):resolve(p)))];
 if(configured!==undefined)for(const p of roots){if(!statSync(p).isDirectory()||!(statSync(p).mode&0o444)||!(statSync(p).mode&0o111))throw Error('知识库必须是可读目录');accessSync(p,constants.R_OK|constants.X_OK);}
} catch(e){console.error(e.message);process.exit(1);}
const KB_ROOT=roots[0];
function safeWritePath(p){
 let current=resolve(p);while(true){try{if(lstatSync(current).isSymbolicLink())throw Error('拒绝知识库符号链接写入');}catch(e){if(e.code!=='ENOENT')throw e;}const parent=dirname(current);if(parent===current)break;current=parent;}
 if(existsSync(KB_ROOT)){const m=statSync(KB_ROOT).mode;if(!(m&0o222))throw Error('主知识库不可写');accessSync(KB_ROOT,constants.W_OK|constants.X_OK);}
 return p;
}
function validName(name){if(!name||name!==basename(name)||name==='.'||name==='..')throw Error('文件名必须为单个 basename');return name;}
const learning=()=>safeWritePath(join(KB_ROOT,'自学习知识','自记库-'+today().slice(0,7)+'.md'));
const PARTS = ["建模", "业务", "数据", "案例"];

const norm = (s) => s.toLowerCase().replace(/[_\s]/g, "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
const today = () => new Date().toISOString().slice(0, 10);

function ensureSkeleton() {
  safeWritePath(KB_ROOT);
  mkdirSync(KB_ROOT, { recursive: true });
  mkdirSync(safeWritePath(join(KB_ROOT,"自学习知识")), {recursive:true});
  mkdirSync(safeWritePath(join(KB_ROOT, "待批区")), { recursive: true });
  for (const f of ["常用.md", "目录.md", ...PARTS.map((p) => `${p}.md`)]) {
    const fp = safeWritePath(join(KB_ROOT, f));
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

function scanEntries(root=KB_ROOT) {
  // 递归扫描 KB_ROOT 全部 .md（排除目录.md/README），兼容两种条目格式：
  // A) ## 标题（触发：a|b）  B) # 标题 + 独立行 - 触发词：`a|b`（迁移条目）
  const out = [];
  const files = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (e.name.endsWith(".md") && e.name !== "目录.md") files.push(join(dir, e.name));
    }
  })(root);
  const today = new Date().toISOString().slice(0, 10);
  for (const fp of files) {
    const rel = fp.slice(root.length + 1);
    const lines = readFileSync(fp, "utf8").split("\n");
    let cur = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const h = line.match(/^(#{1,2})\s+(.+)$/);
      if (h) {
        if (cur) out.push(cur);
        const full = h[2].trim();
        const trig = full.match(/（触发：([^）]*)）/);
        const title = full.replace(/（触发：[^）]*）/g, "").trim();
        cur = { root, file: rel, title, triggers: trig ? trig[1].split(/[|｜]/).map(norm) : [norm(title)], line: i + 1 };
      } else if (cur) {
        const t = line.match(/^[-•]\s*触发词[：:]\s*`?([^`\n]+)`?/);
        if (t) cur.triggers = t[1].split(/[|｜]/).map(norm).filter(Boolean);
        const d = line.match(/【有效期】至?(\d{4}-\d{2}-\d{2})/);
        if (d) cur.过期 = d[1] < today;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

function cmdSearch(query) {
  const q = norm(query);
  const entries = roots.flatMap(root=>existsSync(root)?scanEntries(root):[]);
  const hits = entries.filter((e) => e.triggers.some((t) => t && (q.includes(t) || t.includes(q))));
  // 过期降权：命中条目查【有效期】，过期标"疑似过期"排后
  const now = new Date().toISOString().slice(0, 10);
  hits.sort((a, b) => (a.过期 ? 1 : 0) - (b.过期 ? 1 : 0));
  const result = {
    version: VERSION, query, root: KB_ROOT, roots,
    hits: hits.map((h) => ({ 标题: h.title, 位置: `${join(h.root,h.file)}#L${h.line}`, ...(h.过期 ? { 疑似过期: true } : {}) })),
    零命中分支: hits.length ? undefined : "缺口阻塞任务定义→问用户限一次；不阻塞→通用能力开工+缺口进待确认项；反审确认库缺→写自记库+检索缺口台账",
  };
  console.log(JSON.stringify(result, null, 2));
}

function cmdIndex() {
  ensureSkeleton();
  const entries = scanEntries();
  const lines = ["# 知识库目录", "", "每条一行：标题（触发：词1|词2）→ 分区文件#锚点。由 `知识库.js index` 从条目头重建。", ""];
  for (const e of entries) lines.push(`- ${e.title}（触发：${e.triggers.join("|")}）→ ${e.file}#L${e.line}`);
  writeFileSync(safeWritePath(join(KB_ROOT, "目录.md")), lines.join("\n") + "\n");
  try { writeFileSync(safeWritePath(join(KB_ROOT, "库指标.json")), JSON.stringify({ entries: entries.length, indexedAt: new Date().toISOString() }, null, 2)); } catch {}
  console.log(JSON.stringify({ ok: true, indexed: entries.length }));
}

function cmdAdd(args) {
  const [area, name] = args;
  if(![...PARTS,"自记","待批","experience"].includes(area))throw Error("未知知识分区");
  if(name&&name!=="-")validName(name);
  const body = readFileSync(0, "utf8");
  if(["自记","experience"].includes(area)){
    const fp=learning();mkdirSync(safeWritePath(dirname(fp)),{recursive:true});
    appendFileSync(fp,body.endsWith("\n")?body:body+"\n");
    console.log(JSON.stringify({ok:true,file:fp}));return;
  }
  ensureSkeleton();
  const fp = ["自记","experience"].includes(area) ? learning()
    : area === "待批" ? join(KB_ROOT, "待批区", name || `条目-${today()}.md`)
    : join(KB_ROOT, `${area}.md`);
  safeWritePath(fp);
  if (["自记","experience"].includes(area)) {
    appendFileSync(fp, body.endsWith("\n") ? body : body + "\n");
  } else {
    writeFileSync(fp, body);
  }
  cmdIndex();
  console.log(JSON.stringify({ ok: true, file: fp }));
}

function cmdApprove(args) {
  ensureSkeleton();
  const name = validName(args[0]);
  const src = safeWritePath(join(KB_ROOT, "待批区", name));
  if (!existsSync(src)) { console.error(`✗ 待批条目不存在: ${name}`); process.exit(1); }
  const body = readFileSync(src, "utf8");
  // 默认进建模.md 末尾（审批时可指定分区，1.7.0 简化）
  appendFileSync(safeWritePath(join(KB_ROOT, "建模.md")), "\n" + body);
  const arch = safeWritePath(join(KB_ROOT, "待批区", "已批-" + name));
  writeFileSync(arch, body); // 保留原文，删除待批原件
  rmSync(src);
  cmdIndex();
  console.log(JSON.stringify({ ok: true, approved: name }));
}
function cmdConflict(args) {
  const fp=learning();mkdirSync(safeWritePath(dirname(fp)),{recursive:true});
  const [entry, fact] = args;
  const line = `【冲突待确认】${today()} 条目:${entry} 现场:${fact} → 状态:待用户裁定（高风险跳过该点，低风险现场优先）\n`;
  appendFileSync(fp, line);
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
