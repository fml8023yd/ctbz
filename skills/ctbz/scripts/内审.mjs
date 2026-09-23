#!/usr/local/bin/node
// ctbz 内审 CLI（dsh 版）——init / check / link / 复命
//
// 用法：
//   node 内审.mjs init  --subject <主题> [--prev <编号>] [--workspace <ws>] [--dir <目录>] [--date YYYY-MM-DD]
//   node 内审.mjs check <文件> [--json]
//   node 内审.mjs link  --prev <编号> --file <当前内审文件> [--workspace <ws>] [--dir <目录>]
//   node 内审.mjs 复命 --file <复命.md> [--json]
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
//   - 复命 = 复命闸（G1–G10）：段标题＝行首零缩进恰为 `自主延伸:` / `自主修复:` / `待裁决:` / `自疑:` / `行动账增量:` 的行，
//     段内容＝标题之后至下一段标题或文件末尾的非空行；只读不写盘，与 check 互不调用。

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";

const USAGE = `ctbz 内审 CLI（dsh 版）

用法：
  node 内审.mjs init  --subject <主题> [--prev <编号>] [--workspace <ws>] [--dir <目录>] [--date YYYY-MM-DD]
  node 内审.mjs check <文件> [--json]
  node 内审.mjs link  --prev <编号> --file <当前内审文件> [--workspace <ws>] [--dir <目录>]
  node 内审.mjs 复命 --file <复命.md> [--json]

选项：
  --subject <主题>      内审主题（必填，init）；编号 = <日期>-<主题>
  --prev <编号>         init：同类主题已存在时必须显式挂链；link：前一条内审编号
  --file <文件>         当前内审文件（link）/ 复命清单（复命）
  --workspace <ws>      工作区根，默认 git rev-parse --show-toplevel，失败回退 cwd
  --dir <目录>          内审 md 落点，默认 <ws>/docs/内审
  --date <YYYY-MM-DD>   编号日期，默认当日
  --json                check / 复命 输出单行 JSON
  -h, --help            显示本帮助

退出码：
  0 通过 / 1 判定不通过 / 2 用法或环境错误`;

const USAGE_ONELINE =
  "用法：node 内审.mjs init --subject <主题> [--prev <编号>] [--workspace <ws>] [--dir <目录>] [--date YYYY-MM-DD]" +
  " | check <文件> [--json]" +
  " | link --prev <编号> --file <当前内审文件> [--workspace <ws>] [--dir <目录>]" +
  " | 复命 --file <复命.md> [--json]";

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

const FUMING_SECTIONS = ["自主延伸", "自主修复", "待裁决", "自疑", "行动账增量"];
const SECTION_RE = /^(自主延伸|自主修复|待裁决|自疑|行动账增量)\s*[:：]\s*$/;
const NONE = "无";
const ADMISSION = ["四扇门", "不可逆", "用户要求二选一"];
const ADMISSION_RE = /准入\s*[:：]\s*(.*)$/;
// G4/G5 只扫「待裁决」条目：自主延伸 / 自主修复 的产物路径必然含 skills/ctbz，扫全文件会把合规清单判死。
const SKILL_MARK_RE = /skill\.md|skills\/ctbz|references\/|本skill|发布链|命令集/;
const REPORT_ONLY_RE = /建议|待修|遗留|已知缺陷|未修|只报不改|下次再修/;
// G7–G9（2.0.8）：自疑段的箭头计数在**原始行**上做（normalizeFuming 只做全角转半角，不转 `->`）。
const ARROW_RE = /→|->/;
const FAKE_EXPERIMENT_RE = /想了一下|推理|推测|可能|应该|大概|估计|觉得/;
const DOUBT_RESULT_RE = /exit\s*[0-2]\b|pass\s*\d+|\d+\s*fail|[^\s:：]+\.(mjs|js|md|json|ts|sh|yaml|yml):\d+/;
// G10（2.2.0）：与 派发闸.mjs LEDGER_EMPTY_WORDS 同表；取舍取值整值等于任一项即判红。
const LEDGER_EMPTY_WORDS = ["无", "N/A", "—", "显而易见", "常规做法", "最佳实践", "一般来说", "通常"];
const LEDGER_LABELS = ["依据", "取舍", "证伪"];

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

// 段标题＝行首（零缩进）恰为五段名之一（自主延伸 / 自主修复 / 待裁决 / 自疑 / 行动账增量）的行；段内容＝该行之后至下一段标题或文件末尾的非空行。
function parseFuming(text) {
  const secs = {};
  const heads = {};
  let cur = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const m = SECTION_RE.exec(line);
    if (m) {
      cur = m[1];
      if (!secs[cur]) {
        secs[cur] = [];
        heads[cur] = i + 1;
      }
      return;
    }
    if (cur && line.trim() !== "") secs[cur].push({ no: i + 1, text: line });
  });
  return { secs, heads };
}

const isNone = (items) => items.length === 1 && items[0].text.trim() === NONE;

// G4/G5 归一化口径：全角转半角 + toLowerCase + 去所有空白，再匹配特征串（不限字段、不豁免）。
function normalizeFuming(line) {
  return line
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(/\s+/g, "");
}

// G8 字段取值：标签命中后取到下一个箭头前（stopAtArrow）/ 行尾。
function fumingFieldValue(line, label, stopAtArrow) {
  const m = new RegExp(label + "\\s*[:：]\\s*").exec(line);
  if (!m) return "";
  const rest = line.slice(m.index + m[0].length);
  const at = stopAtArrow ? rest.search(ARROW_RE) : -1;
  return (at < 0 ? rest : rest.slice(0, at)).trim();
}

// G9 只扫「最可能错的地方」＝首个箭头之前的文本；证据 / 命令字段不参与扫描。
function doubtHead(line) {
  const at = line.search(ARROW_RE);
  return normalizeFuming((at < 0 ? line : line.slice(0, at)).trim());
}

// G10 字段取值：模板以 `|` 分隔，取到下一个 `|` 为止（G7–G9 的 fumingFieldValue 取到行尾，同段多字段会串值）。
function ledgerField(line, label) {
  const m = new RegExp(label + "\\s*[:：]\\s*([^|]*)").exec(line);
  return m ? m[1].trim() : "";
}

// G10 空话判定：去空白与首尾标点后整值比对（与 派发闸.mjs ledgerScalar 同口径）。
function ledgerScalar(v) {
  const P = "`*_「」『』（）()【】\\[\\]，。、；：,.;:!?！？—–-";
  return v.replace(/\s+/g, "").replace(new RegExp(`^[${P}]+`), "").replace(new RegExp(`[${P}]+$`), "");
}

// G8 三判据：箭头 ≥2（原始行）/ 证伪实验非空且非推理词 / 结果命中命令回显形态。
function hasEvidence(line) {
  if ((line.match(/→|->/g) || []).length < 2) return false;
  const exp = fumingFieldValue(line, "证伪实验", true);
  if (!exp || FAKE_EXPERIMENT_RE.test(exp)) return false;
  return DOUBT_RESULT_RE.test(fumingFieldValue(line, "结果", false));
}

function judgeFuming(text) {
  const { secs, heads } = parseFuming(text);
  const NO_NONE = new Set(["自疑"]);   // 自疑段禁止写「无」
  const errors = [];

  for (const k of FUMING_SECTIONS) {
    if (!secs[k]) errors.push("0: 缺段标题「" + k + ":」");
  }

  for (const k of FUMING_SECTIONS) {
    const items = secs[k] || [];
    if (isNone(items)) {
      if (NO_NONE.has(k)) errors.push(items[0].no + ": " + k + " 段不得写 " + NONE);
      continue;
    }
    for (const it of items) {
      if (!it.text.startsWith("- ")) {
        errors.push(it.no + ": " + k + " 段行不合形态（须以「- 」开头，或整段恰为「" + NONE + "」）");
      }
    }
  }

  // G10（2.2.0）：行动账增量段——整段 `无` 放行（不在 NO_NONE）；非 `无` 时每行三字段须各自非空，取舍不得为空话。
  const ledger = secs["行动账增量"] || [];
  if (ledger.length && !isNone(ledger)) {
    for (const it of ledger) {
      if (!it.text.startsWith("- ")) continue;
      for (const label of LEDGER_LABELS) {
        if (!ledgerField(it.text, label)) errors.push(it.no + ": 行动账增量缺 " + label + ": 或取值为空");
      }
      if (LEDGER_EMPTY_WORDS.includes(ledgerScalar(ledgerField(it.text, "取舍")))) {
        errors.push(it.no + ": 行动账增量 取舍为空话（整值等于词表任一项）");
      }
    }
  }

  // 自疑段跳过 G6（产物路径）：其箭头归 G8 计数，判定交 G7 / G8 / G8b / G9。
  for (const k of ["自主延伸", "自主修复"]) {
    const items = secs[k] || [];
    if (!items.length || isNone(items)) continue;
    for (const it of items) {
      if (!it.text.startsWith("- ")) continue;
      if (!it.text.includes(" → ")) errors.push(it.no + ": " + k + " 缺产物路径（须含「 → 」）");
    }
  }

  const pending = secs["待裁决"] || [];
  if (pending.length && !isNone(pending)) {
    for (const it of pending) {
      const m = ADMISSION_RE.exec(it.text);
      const value = m ? m[1].trim() : null;
      if (!m) errors.push(it.no + ": 待裁决缺 准入:（取值限 " + ADMISSION.join(" / ") + "）");
      else if (!ADMISSION.includes(value)) errors.push(it.no + ": 准入取值非枚举（" + value + "）");
      const n = normalizeFuming(it.text);
      if (SKILL_MARK_RE.test(n)) errors.push(it.no + ": 待裁决指向本 skill（skill 里已有指令，该去做而不是来问）");
      if (REPORT_ONLY_RE.test(n)) errors.push(it.no + ": 待裁决含只报不改词（可修缺陷须进「自主修复」段）");
    }
  }

  // G7–G9：自疑段只认 `- ` 条目；G8b/G9 只看首个箭头之前的「最可能错的地方」。
  const doubt = (secs["自疑"] || []).filter((it) => it.text.startsWith("- "));
  if (doubt.length < 3) {
    errors.push((heads["自疑"] || 0) + ": 自疑条数不足：需 ≥3（自疑段不得写 " + NONE + "）");
  }
  const seen = new Set();
  for (const it of doubt) {
    if (!hasEvidence(it.text)) errors.push(it.no + ": 自疑条目缺证伪实验或可核结果");
    const head = doubtHead(it.text);
    if (seen.has(head)) errors.push(it.no + ": 自疑条目重复");
    seen.add(head);
    if (SKILL_MARK_RE.test(head) || REPORT_ONLY_RE.test(head)) {
      errors.push(it.no + ": 自疑条目指向本 skill / 只报不改 → 该去做而不是来自疑");
    }
  }

  return errors;
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

// 复命闸：只读复命清单，逐条列违规；不写任何文件、零网络。
function cmdFuming(a) {
  if (!a.file) return usage("复命 缺少 --file <复命.md>");
  const file = resolve(a.file);
  if (!existsSync(file)) return usage("文件不存在：" + file);

  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    return usage("文件无法读取：" + file + "（" + e.message + "）");
  }

  const errors = judgeFuming(text);
  const ok = errors.length === 0;
  if (a.json) {
    console.log(ok ? JSON.stringify({ ok: true, mode: "复命" }) : JSON.stringify({ ok: false, errors }));
  } else if (ok) {
    console.log("✓ 复命闸通过");
  } else {
    for (const e of errors) console.log("✗ " + e);
  }
  return ok ? 0 : 1;
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
  if (cmd === "复命") return cmdFuming(a);
  if (cmd === "link") return cmdLink(a);
  return usage(cmd ? "未知命令：" + cmd : "缺少命令");
}

process.exit(main());
