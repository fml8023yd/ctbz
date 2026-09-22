#!/usr/local/bin/node
// ctbz 内审 CLI（dsh 版）——init / check / link
//
// 用法：
//   node 内审.mjs init  --subject <主题> [--prev <编号>] [--workspace <ws>] [--dir <目录>] [--date YYYY-MM-DD]
//   node 内审.mjs check <文件> [--json]
//   node 内审.mjs link  --prev <编号> --file <当前内审文件> [--workspace <ws>] [--dir <目录>]
//
// 契约（冻结，改需回主会话；出处 docs/ctbz-2.0.6-派发闸与内审-计划.md §4.7）：
//   - 编号 = <YYYY-MM-DD>-<主题>；文件名 = <编号>.md；pending[].id == 编号；
//     pending[].file == path.resolve(<dir>/<编号>.md)；文件首行 == "# 内审 <编号>" —— 四者逐字相等；
//     check 由被检文件 basename 反查 pending 的 id。
//   - 同类 = <dir>/*.md 文件名去掉 ^\d{4}-\d{2}-\d{2}- 前缀后的主题段，去空白归一化后与 --subject 全等。
//   - 判定优先级：含 L3 > 含 L2 > 纯 L1；禁词 / 文件落点 / 验收标准三行是独立硬门，L3 不豁免。
//   - 待办固定 <ws>/.ctbz-record/内审/pending.json；--dir 只管内审 md 落点（默认 <ws>/docs/内审）。
//   - check 按被检文件向上找 pending.json：派发闸 audit 的 spawnSync 不保证 cwd，缺了会漏登记。
//   - 只用 node 标准库；零网络；中文路径原样输出，不做 percent-encode。

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";

const USAGE = `ctbz 内审 CLI（dsh 版）

用法：
  node 内审.mjs init  --subject <主题> [--prev <编号>] [--workspace <ws>] [--dir <目录>] [--date YYYY-MM-DD]
  node 内审.mjs check <文件> [--json]
  node 内审.mjs link  --prev <编号> --file <当前内审文件> [--workspace <ws>] [--dir <目录>]

选项：
  --subject <主题>      内审主题（必填，init）；编号 = <日期>-<主题>
  --prev <编号>         init：同类主题已存在时必须显式挂链；link：前一条内审编号
  --file <文件>         当前内审文件（link）
  --workspace <ws>      工作区根，默认 git rev-parse --show-toplevel，失败回退 cwd
  --dir <目录>          内审 md 落点，默认 <ws>/docs/内审
  --date <YYYY-MM-DD>   编号日期，默认当日
  --json                check 输出单行 JSON
  -h, --help            显示本帮助

退出码：
  0 通过 / 1 判定不通过 / 2 用法或环境错误`;

const USAGE_ONELINE =
  "用法：node 内审.mjs init --subject <主题> [--prev <编号>] [--workspace <ws>] [--dir <目录>] [--date YYYY-MM-DD]" +
  " | check <文件> [--json]" +
  " | link --prev <编号> --file <当前内审文件> [--workspace <ws>] [--dir <目录>]";

const FIELDS = ["现象", "证据", "根因", "修改项", "同类史", "可执行性声明"];
const STATUS_FIELD = "实现状态";
const STATUS = ["已实现", "未实现"];
const LINK_FIELD = "同类史";

const DEFAULT_PATH_RE = /默认路径|更省力|不做比做省力|默认分支/;
const NEGLECT_RE = /忘了|没注意|太赶|疏忽/;
const BAN_RE = /加强意识|下次注意|更仔细|提高警惕|引起重视/;
const FILE_PATH_RE = /\.(mjs|js|md|json|yaml|yml|sh)(?![0-9A-Za-z_])/;
const ACCEPT_RE = /判据|退出码|预期/;
const FIELD_LINE_RE = /^([^\s:：]+)[:：](.*)$/;

function usage(msg) {
  console.error("[内审.mjs] " + msg);
  console.error(USAGE_ONELINE);
  return 2;
}

function parseArgv(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--subject") a.subject = argv[++i];
    else if (t === "--prev") a.prev = argv[++i];
    else if (t === "--workspace") a.workspace = argv[++i];
    else if (t === "--dir") a.dir = argv[++i];
    else if (t === "--date") a.date = argv[++i];
    else if (t === "--file") a.file = argv[++i];
    else if (t === "--json") a.json = true;
    else if (t === "-h" || t === "--help") a.help = true;
    else if (t.startsWith("-")) a.unknown = t;
    else a._.push(t);
  }
  return a;
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function resolveWorkspace(explicit) {
  if (explicit) return resolve(explicit);
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (top) return top;
  } catch {
    // 非 git 环境按 §4.7 回退 cwd
  }
  return process.cwd();
}

function resolveDir(a, ws) {
  return a.dir ? resolve(a.dir) : join(ws, "docs", "内审");
}

function pendingPathOf(ws) {
  return join(ws, ".ctbz-record", "内审", "pending.json");
}

function readPending(file) {
  if (existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, "utf8"));
      if (Array.isArray(data.pending)) return data;
    } catch {
      // 落到空账：内审环节不因账本损坏抛栈
    }
    console.error("[警告] pending.json 不可解析或结构不符，按空账处理：" + file);
  }
  return { pending: [] };
}

function writePending(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function normalize(s) {
  return s.replace(/\s+/g, "");
}

function findSameClass(dir, subject) {
  if (!existsSync(dir)) return null;
  const want = normalize(subject);
  for (const name of readdirSync(dir).sort()) {
    if (!/\.md$/i.test(name)) continue;
    const id = name.replace(/\.md$/i, "");
    if (normalize(id.replace(/^\d{4}-\d{2}-\d{2}-/, "")) === want) return id;
  }
  return null;
}

function template(id) {
  return [
    "# 内审 " + id,
    "",
    "现象: ",
    "证据: ",
    "根因: ",
    "修改项: ",
    "同类史: 首次",
    "可执行性声明: ",
    "实现状态: 未实现",
    "",
  ].join("\n");
}

// 字段行首解析、单行为准；字段名后冒号全半角均可；值 trim 后为空即视为缺字段。
function parseFields(text) {
  const fields = {};
  for (const line of text.split(/\r?\n/)) {
    const m = FIELD_LINE_RE.exec(line);
    if (m && fields[m[1]] === undefined) fields[m[1]] = m[2].trim();
  }
  return fields;
}

function judge(text) {
  const f = parseFields(text);
  const reason = [];

  const missing = FIELDS.filter((k) => !f[k]);
  if (missing.length) reason.push("字段为空或缺失：" + missing.join("、"));

  const status = f[STATUS_FIELD];
  if (!STATUS.includes(status)) {
    reason.push(
      STATUS_FIELD + " 必须是 " + STATUS.join(" 或 ") + "（实际：" + (status === undefined ? "缺失" : status || "空") + "）"
    );
  }

  const cause = f["根因"] || "";
  const l3 = /L3/.test(cause) || DEFAULT_PATH_RE.test(cause);
  const l2 = /L2/.test(cause);
  const l1 = /L1/.test(cause) || NEGLECT_RE.test(cause);
  const level = l3 ? "L3" : l2 ? "L2" : l1 ? "L1" : null;
  if (!level) {
    reason.push("归因未标明层级：根因须含 L1/L2/L3，或写明默认路径（默认路径|更省力|不做比做省力|默认分支）");
  } else if (!l3 && !l2) {
    reason.push("L1 疏忽不合格，继续下探到机制层（把「人的自觉」删掉，机制还拦得住吗？）");
  }

  const item = f["修改项"] || "";
  if (BAN_RE.test(item)) reason.push("修改项含禁词（加强意识|下次注意|更仔细|提高警惕|引起重视）——L3 也不豁免");
  if (!FILE_PATH_RE.test(item)) reason.push("修改项无文件落点：须含 *.mjs|*.js|*.md|*.json|*.yaml|*.yml|*.sh 形式的路径");
  if (!item.includes("验收") && !ACCEPT_RE.test(item)) reason.push("修改项无验收标准：须含「验收」或 判据|退出码|预期");

  const ok = reason.length === 0;
  return { ok, level, excellent: ok && l3, reason };
}

// 派发闸 audit 以 spawnSync 调 check，cwd 不受控：按被检文件向上找 pending.json，再退回默认 ws。
// 命中候选后仍须校验 entry.file（resolve 后）与被检文件全等：子目录里的同名文件不得改写父目录 pending 条目。
// 不符只跳过该条目并警告，继续向上；最终找不到即按未登记处理（只警告，不判不合格）。
function isRegisteredFor(entry, target) {
  // entry.file 可能被手改坏（缺字段/非字符串）：一律视为不匹配，不抛栈。
  return !!entry && typeof entry.file === "string" && resolve(entry.file) === target;
}

function locatePending(file, id) {
  const target = resolve(file);
  const candidates = [];
  let d = dirname(target);
  for (;;) {
    candidates.push(join(d, ".ctbz-record", "内审", "pending.json"));
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  candidates.push(pendingPathOf(resolveWorkspace(null)));
  for (const path of new Set(candidates)) {
    if (!existsSync(path)) continue;
    const data = readPending(path);
    const entry = data.pending.find((e) => e && e.id === id);
    if (!entry) continue;
    if (isRegisteredFor(entry, target)) return { path, data };
    console.error(
      "[警告] " + path + " 中 " + id + " 登记的 file 与被检文件不符（登记：" + entry.file + "，被检：" + target + "），跳过该条目继续向上查找"
    );
  }
  return null;
}

function markChecked(file, id) {
  const found = locatePending(file, id);
  if (!found) {
    console.error("[警告] 未找到登记 " + id + " 的 pending.json，跳过登记");
    return null;
  }
  const target = resolve(file);
  found.data.pending = found.data.pending.map((e) =>
    e && e.id === id && isRegisteredFor(e, target) ? { ...e, checked: true } : e
  );
  writePending(found.path, found.data);
  return found.path;
}

function cmdInit(a) {
  if (!a.subject) return usage("init 缺少 --subject <主题>");
  if (/[/\\]/.test(a.subject)) return usage("--subject 不得含路径分隔符：/ \\");
  const date = a.date || today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return usage("--date 必须是 YYYY-MM-DD：" + date);

  const ws = resolveWorkspace(a.workspace);
  const dir = resolveDir(a, ws);
  const id = date + "-" + a.subject;
  const file = resolve(join(dir, id + ".md"));
  const pendingPath = pendingPathOf(ws);
  const data = readPending(pendingPath);
  const entry = data.pending.find((e) => e && e.id === id);

  if (existsSync(file)) {
    if (entry && entry.checked === true) {
      console.log("已审结，不得覆盖：" + file);
      return 1;
    }
    console.log("已存在，不得覆盖：" + file);
    return 1;
  }

  const same = findSameClass(dir, a.subject);
  if (same && !a.prev) {
    console.log("同类主题已存在（" + same + "）：必须 --prev " + same);
    return 1;
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(file, template(id), "utf8");
  const record = { id, file, subject: a.subject, checked: false };
  if (entry) data.pending[data.pending.indexOf(entry)] = record;
  else data.pending.push(record);
  writePending(pendingPath, data);

  console.log("已创建 " + file);
  console.log("编号 " + id);
  console.log("待办 " + pendingPath);
  return 0;
}

function cmdCheck(a) {
  const arg = a.file || a._[0];
  if (!arg) return usage("check 缺少 <文件>");
  const file = resolve(arg);
  if (!existsSync(file)) return usage("文件不存在：" + file);

  const id = basename(file).replace(/\.md$/i, "");
  const r = judge(readFileSync(file, "utf8"));
  const pending = r.ok ? markChecked(file, id) : null;

  if (a.json) {
    console.log(
      JSON.stringify({ ok: r.ok, id, file, level: r.level, excellent: r.excellent, pending, reasons: r.reason })
    );
  } else if (r.ok) {
    console.log("合格" + (r.excellent ? "（优秀）" : "") + "：" + file);
  } else {
    console.log("不合格：" + file);
    for (const line of r.reason) console.log("  - " + line);
  }
  return r.ok ? 0 : 1;
}

function cmdLink(a) {
  if (!a.prev) return usage("link 缺少 --prev <编号>");
  if (!a.file) return usage("link 缺少 --file <当前内审文件>");

  const ws = resolveWorkspace(a.workspace);
  const dir = resolveDir(a, ws);
  const prevFile = resolve(join(dir, a.prev + ".md"));
  if (!existsSync(prevFile)) return usage("前条文件不存在：" + prevFile);

  const status = parseFields(readFileSync(prevFile, "utf8"))[STATUS_FIELD];
  if (status === "已实现") {
    console.log("缺陷失效，按 §5.3 约束2 强制升级 L3：" + prevFile);
    return 1;
  }
  if (!STATUS.includes(status)) {
    console.log("前条不可判定：" + prevFile + " 的 " + STATUS_FIELD + " 缺失或非枚举（实际：" + (status === undefined ? "缺失" : status || "空") + "）");
    return 1;
  }

  const file = resolve(a.file);
  if (!existsSync(file)) return usage("当前内审文件不存在：" + file);
  const lines = readFileSync(file, "utf8").split("\n");
  const at = lines.findIndex((l) => new RegExp("^" + LINK_FIELD + "\\s*[:：]").test(l));
  if (at < 0) {
    console.log("当前文件缺少 " + LINK_FIELD + " 字段：" + file);
    return 1;
  }
  lines[at] = LINK_FIELD + ": " + a.prev;
  writeFileSync(file, lines.join("\n"), "utf8");

  console.log("已挂链 " + file + " 的 " + LINK_FIELD + " → " + a.prev);
  return 0;
}

function main() {
  const a = parseArgv(process.argv.slice(2));
  if (a.help) {
    console.log(USAGE);
    return 0;
  }
  if (a.unknown) return usage("未知选项：" + a.unknown);
  // 命令取首个位置参数：-h / --json 等选项可出现在命令之前
  const cmd = a._.shift();
  if (cmd === "init") return cmdInit(a);
  if (cmd === "check") return cmdCheck(a);
  if (cmd === "link") return cmdLink(a);
  return usage(cmd ? "未知命令：" + cmd : "缺少命令");
}

process.exit(main());
