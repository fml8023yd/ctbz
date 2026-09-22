#!/usr/local/bin/node
// ctbz 反审骨架生成器（dsh 版）
//
// 用法：
//   /usr/local/bin/node 反审.mjs --plan <计划md路径> --workspace <ws> [--camps deepseek,zhipu,tencent,moonshot]
//                                [--round 1|2] [--prev <一轮记录目录>] [--gate] [--out <骨架文件>]
//   /usr/local/bin/node 反审.mjs --plan <计划md路径> --dry-run
//
// 产物：可直接交给 dsh `workflow` 工具执行的 JS 骨架（脚本体）。
//   - 调度走 workflow 的 agent(prompt,{provider,model})，显式传 provider/model（见 references/派发.md §3 模型代号表）。
//   - 反审席位 DeepSeek 一律 deepseek-v4-pro（避免与主进程 deepseek-flash 同模型自审）。
//   - 规避 maxResultChars 50000 静默截断：每路裁决由 reviewer 子代理写入独立文件（.ctbz-record 下），
//     workflow 仅回 "文件路径 + 一句话摘要"，不被 50k 截断吞掉。
//   - 只依赖 workflow 提供的 agent()；不使用任何 Node 文件系统/网络 API（workflow 沙箱不提供）。
//
// 有意副作用（M2，见 2.0.6 计划 §4.6；属有意变更，不是向后兼容回归）：
//   - 非 --dry-run 时按 §4.4 在 <ws>/.ctbz-record/反审/<slug>/ 落 4 份空回执模板（verdict=null、verdicts=[]），
//     用于区分「没写回执」与「写了空模板 = 没审」；已填（verdicts 非空）保留不覆盖，JSON 损坏的一律跳过覆盖并提示人工处理。
//   - --workspace 是落盘前提：非 --dry-run 且未显式给出 → exit 2（防污染任意 cwd）；--dry-run 零写盘、不跑 --gate。
//   - --camps 少于定级席位数时必然不过闸，属预期行为，非 bug。

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, basename, resolve } from "node:path";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 模型代号表：与 references/派发.md §3 完全一致（4 阵营 / 5 模型取样，反审席位 DeepSeek 取 deepseek-v4-pro）
const CAMPS = {
  deepseek: { key: "deepseek", label: "DeepSeek", provider: "deepseek-official", model: "deepseek-v4-pro" },
  zhipu:    { key: "zhipu",    label: "智谱",     provider: "workbuddy",         model: "glm-5.3-flash" },
  tencent:  { key: "tencent",  label: "腾讯",     provider: "workbuddy",         model: "hy4-preview-f" },
  moonshot: { key: "moonshot", label: "月之暗面", provider: "workbuddy",         model: "kimi-k2.8-preview" },
};

const SIX_VIEWS = ["需求一致性", "架构合理性", "测试完整性", "边界条件", "性能安全", "用户体验"];

// §4.4 命名：round=1 → <camp>.json；round≥2 → <camp>-r<N>.json（落空模板与骨架 outFile 同用一处规则）
function roundSuffix(round) {
  return round === "1" ? "" : "-r" + round;
}

function planSlug(plan) {
  return basename(plan).replace(/\.md$/i, "");
}

function parseArgs(argv) {
  const a = { camps: Object.keys(CAMPS).join(","), round: "1", dryRun: false, gate: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--plan") a.plan = argv[++i];
    else if (t === "--camps") a.camps = argv[++i];
    else if (t === "--round") a.round = argv[++i];
    else if (t === "--prev") a.prev = argv[++i];
    else if (t === "--workspace") a.workspace = argv[++i];
    else if (t === "--out") a.out = argv[++i];
    else if (t === "--gate") a.gate = true;
    else if (t === "--dry-run") a.dryRun = true;
    else if (t === "-h" || t === "--help") a.help = true;
  }
  return a;
}

const USAGE = `ctbz 反审骨架生成器（dsh 版）

用法：
  node 反审.mjs --plan <计划md路径> --workspace <ws> [选项]

选项：
  --plan <路径>                      计划文件（必填；路径会原样烤进骨架，使骨架不看上下文独立开工）
  --workspace <项目根>               回执落盘根：<ws>/.ctbz-record/反审/<slug>/；非 --dry-run 必填（缺失即 exit 2）
  --camps <c1,c2,...>                参与阵营，默认全 4 路：deepseek,zhipu,tencent,moonshot
  --round <1|2>                      反审轮次，默认 1；≥2 时回执文件名 <camp>-r<N>.json；2 仅针对未解决项
  --prev <目录>                      第一轮记录目录（round=2 时注入"只针对未解决项"限定）
  --gate                             骨架产出后调用 <skill>/scripts/派发闸.mjs --level l1，退出码取闸门退出码
  --dry-run                          只预览：打印骨架到 stdout 并用 new Function 校验语法；零写盘、不跑 gate
  --out <文件>                       将骨架写入文件（不打印；--dry-run 时忽略本项）
  -h, --help                         显示本帮助

示例：
  node 反审.mjs --plan docs/某计划.md --dry-run
  node 反审.mjs --plan docs/某计划.md --workspace /path/to/ws --gate
  node 反审.mjs --plan docs/某计划.md --workspace /path/to/ws --round 2 --prev <slug> --out /tmp/反审-r2.js`;

function buildSkeleton({ plan, camps, round, prev, workspace }) {
  const planLit = JSON.stringify(plan);
  const campsLit = JSON.stringify(camps);
  const viewsLit = JSON.stringify(SIX_VIEWS);
  const roundLit = JSON.stringify(round);
  const prevLit = JSON.stringify(prev || null);
  const suffixLit = JSON.stringify(roundSuffix(round));

  const slug = planSlug(plan);
  const recordDir = workspace ? join(workspace, ".ctbz-record", "反审", slug) : null;
  // 有 --workspace → 烤绝对路径字面量；无（仅 --dry-run 可能）→ 保留 2.0.5 的相对表达式
  const recordDirExpr = recordDir
    ? JSON.stringify(recordDir)
    : "\".ctbz-record/反审/\" + PLAN.split(\"/\").pop().replace(/\\.md$/i, \"\")";
  const recordDirNote = recordDir || "<ws>/.ctbz-record/反审/" + slug;
  const wsNote = workspace || "<ws>";
  const gatePath = join(__dirname, "派发闸.mjs");

  const L = [];
  L.push("// ctbz 四路反审骨架（scripts/反审.mjs 自动生成，可直接交 dsh workflow 执行）");
  L.push("// 调度：workflow agent(prompt,{provider,model})；模型代号见 references/派发.md §3");
  L.push("// 反审席位 DeepSeek 一律 deepseek-v4-pro（避免与主进程 deepseek-flash 同模型自审）");
  L.push("// 规避 maxResultChars 50000 静默截断：每路裁决由 reviewer 子代理写入独立文件，workflow 仅回 路径+摘要");
  L.push("// 回执落盘：" + recordDirNote + "/<camp>" + roundSuffix(round) + ".json");
  L.push("// 校验命令：node " + gatePath + " --plan " + plan + " --workspace " + wsNote + " --level l1");
  L.push("// schema：camp/camp_label/provider/model/round/plan/plan_sha256/generated_at/verdict/fresh_agent_test/verdicts/summary");
  L.push("");
  L.push("const PLAN = " + planLit + ";");
  L.push("const SIX_VIEWS = " + viewsLit + ";");
  L.push("const CAMPS = " + campsLit + ";");
  L.push("const ROUND = " + roundLit + ";");
  L.push("const ROUND_SUFFIX = " + suffixLit + ";");
  L.push("const PREV_DIR = " + prevLit + ";");
  L.push("const RECORD_DIR = " + recordDirExpr + ";");
  L.push("");
  L.push("const ROUND_RULE = ROUND === \"2\"");
  L.push("  ? \"第二轮：只针对 PREV_DIR 中未解决项（类别=阻塞 或 结论!=接受）。重提已否决意见须带新证据，否则视为无效。\"");
  L.push("  : \"第一轮：六视角全量核查。\";");
  L.push("");
  L.push("const results = [];");
  L.push("for (const c of CAMPS) {");
  L.push("  const outFile = RECORD_DIR + \"/\" + c.key + ROUND_SUFFIX + \".json\";");
  L.push("  const prompt = [");
  L.push("    \"你是 ctbz 反审员（阵营：\" + c.label + \"）。对计划文件 \" + PLAN + \" 执行反审。\",");
  L.push("    \"六视角逐一核查：\" + SIX_VIEWS.join(\"、\") + \"。\",");
  L.push("    \"裁决表每视角一行，字段：类别(阻塞/非阻塞/可接受) | 证据(文件行号或命令) | 结论(接受/有条件接受/不接受) | 逐条处置。\",");
  L.push("    ROUND_RULE,");
  L.push("    \"回执 JSON 必含字段：camp、camp_label、provider、model、round、plan、plan_sha256、generated_at、verdict、fresh_agent_test、verdicts、summary。\",");
  L.push("    \"provider/model 填你自身实际席位：\" + c.provider + \"/\" + c.model + \"；round=\" + ROUND + \"；plan=\" + PLAN + \"。\",");
  L.push("    \"plan_sha256 = 计划文件字节的 sha256（小写 hex，现算）；generated_at 用 ISO8601。\",");
  L.push("    \"fresh_agent_test 必含【新鲜 Agent 测试】结论（conclusion）与卡点清单（blockers 数组，无卡点填空数组）。\",");
  L.push("    \"verdicts 六视角各 ≥1 条，每条 {view,category,evidence,conclusion,disposition}；verdict=null 或 verdicts=[] 会被闸门判为「空模板=没审」。\",");
  L.push("    \"将完整裁决表写入文件：\" + outFile + \"。\",");
  L.push("    \"仅回复一行：<\" + outFile + \"> | <一句话摘要>\"");
  L.push("  ].join(\"\\n\");");
  L.push("  const r = await agent(prompt, { provider: c.provider, model: c.model });");
  L.push("  results.push({ camp: c.label, provider: c.provider, model: c.model, outFile: outFile, reply: r });");
  L.push("}");
  L.push("return results;");
  return L.join("\n");
}

function validateSyntax(skeleton) {
  // workflow 脚本体允许顶层 await/return；用 async IIFE 包裹后由 new Function 解析。
  // agent 作为入参提供；不引用任何 Node API（workflow 沙箱不提供）。
  new Function("agent", "return (async () => {\n" + skeleton + "\n})();");
}

// 回执三态：空模板（可覆盖）/ 已填（保留）/ 损坏（JSON 解析失败，视为已占用，跳过覆盖防丢原内容）
// 空模板 = 字段齐全但 verdict=null 且 verdicts=[]（§4.2）；用于区分「没写」与「没审」
function receiptState(file) {
  try {
    const j = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(j.verdicts) && j.verdicts.length > 0 ? "filled" : "empty";
  } catch {
    return "broken";
  }
}

function writeTemplates({ workspace, plan, round }) {
  const dir = join(workspace, ".ctbz-record", "反审", planSlug(plan));
  mkdirSync(dir, { recursive: true });
  const sha = createHash("sha256").update(readFileSync(plan)).digest("hex");
  const generatedAt = new Date().toISOString();
  const suffix = roundSuffix(round);
  const total = Object.keys(CAMPS).length;
  let written = 0;
  let kept = 0;
  for (const c of Object.values(CAMPS)) {
    const file = join(dir, c.key + suffix + ".json");
    if (existsSync(file)) {
      const state = receiptState(file);
      if (state === "filled") {
        kept++;
        console.error("[反审.mjs] 已存在非空回执，保留不覆盖：" + file);
        continue;
      }
      if (state === "broken") {
        console.error("[反审.mjs] 回执损坏，已跳过覆盖，请人工处理：" + file);
        continue;
      }
    }
    writeFileSync(file, JSON.stringify({
      camp: c.key,
      camp_label: c.label,
      provider: c.provider,
      model: c.model,
      round: round,
      plan: plan,
      plan_sha256: sha,
      generated_at: generatedAt,
      verdict: null,
      fresh_agent_test: { conclusion: "", blockers: [] },
      verdicts: [],
      summary: ""
    }, null, 2) + "\n", "utf8");
    written++;
  }
  console.error("[反审.mjs] 空回执模板已落盘 " + written + "/" + total + " 份（保留已填 " + kept + " 份）：" + dir);
}

function runGate({ plan, workspace }) {
  const gate = join(__dirname, "派发闸.mjs");
  if (!existsSync(gate)) {
    // 闸门可能尚未交付（T1 并行开发）；按 §4.5 exit 2 语义（用法/环境错误）返回，不崩栈
    console.error("[反审.mjs] 闸门脚本不存在：" + gate);
    console.error("[说明] 闸门缺失按 §4.5 环境错误处理，退出码 2；闸门交付后可直接重跑本命令。");
    console.error("node " + gate + " --plan " + plan + " --workspace " + workspace + " --level l1");
    return 2;
  }
  // 闸门 stdout 本就只给机器读：接到本进程 stderr，避免混进骨架 stdout 通道（--out 时 stdout 必须为空）
  const r = spawnSync(process.execPath, [gate, "--plan", plan, "--workspace", workspace, "--level", "l1"],
    { stdio: ["ignore", process.stderr, "inherit"], timeout: 30000, killSignal: "SIGTERM" });
  if (r.error && r.error.code === "ETIMEDOUT") {
    console.error("[反审.mjs] 闸门超时（30000ms 未退出，已按 SIGTERM 终止）：" + gate);
    return 2;
  }
  if (r.error) { console.error("[反审.mjs] 闸门执行失败：" + r.error.message); return 2; }
  if (typeof r.status !== "number") { console.error("[反审.mjs] 闸门被信号中断：" + r.signal); return 2; }
  console.error("[反审.mjs] 闸门退出码=" + r.status);
  return r.status;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help) { console.log(USAGE); return 0; }
  if (!a.plan) { console.error("缺少 --plan <计划md路径>\n" + USAGE); return 2; }
  if (!existsSync(a.plan)) { console.error("计划文件不存在：" + a.plan); return 2; }
  // --round 须为十进制正整数：否则会产出 <camp>-rabc.json / <camp>-rundefined.json 脏文件名
  if (typeof a.round !== "string" || !/^[1-9]\d*$/.test(a.round)) {
    console.error("--round 须为正整数（如 1、2、3；实际 " + JSON.stringify(a.round) + "）");
    return 2;
  }
  if (!a.dryRun && !a.workspace) {
    console.error("非 --dry-run 必须显式给出 --workspace <项目根>（回执落盘 <ws>/.ctbz-record/反审/<slug>/，防止污染任意 cwd）；仅预览请用 --dry-run");
    return 2;
  }

  const keys = a.camps.split(",").map((s) => s.trim()).filter(Boolean);
  if (!keys.length) { console.error("--camps 过滤后为空（空串或纯分隔符）；可选：" + Object.keys(CAMPS).join(",") + "，或省略取默认全 4 路"); return 2; }
  const unknown = keys.filter((k) => !CAMPS[k]);
  if (unknown.length) { console.error("未知阵营：" + unknown.join(",") + "；可选：" + Object.keys(CAMPS).join(",")); return 2; }
  const camps = keys.map((k) => CAMPS[k]);

  const workspace = a.workspace ? resolve(a.workspace) : null;
  const skeleton = buildSkeleton({ plan: a.plan, camps, round: a.round, prev: a.prev, workspace });

  // 非 --dry-run 的两条返回路径（带 --out / 不带 --out）都要落模板、都要跑 --gate
  const afterSkeleton = () => {
    if (a.dryRun) {
      if (a.gate) console.error("[反审.mjs] --dry-run：跳过闸门校验（零写盘、不跑 gate）");
      return 0;
    }
    // 先落模板再写骨架：--out 写失败不得牵连 4 份空模板
    try {
      writeTemplates({ workspace, plan: a.plan, round: a.round });
    } catch (e) {
      console.error("[反审.mjs] 回执模板落盘失败：" + e.message);
      return 2;
    }
    if (a.out) {
      try {
        writeFileSync(a.out, skeleton, "utf8");
      } catch (e) {
        console.error("[反审.mjs] 骨架写出失败：" + e.message);
        return 2;
      }
      console.error("[反审.mjs] 骨架已写入 " + a.out);
    }
    return a.gate ? runGate({ plan: a.plan, workspace }) : 0;
  };

  if (a.out && a.dryRun) console.error("[反审.mjs] --dry-run 优先：忽略 --out，不写任何文件");

  if (!a.out || a.dryRun) {
    // --dry-run（默认也打印到 stdout，便于直接交 workflow）
    try {
      validateSyntax(skeleton);
    } catch (e) {
      console.error("[反审.mjs] 骨架语法校验失败：" + e.message);
      return 1;
    }
    console.log("// ===== ctbz 四路反审骨架（start）=====");
    console.log(skeleton);
    console.log("// ===== ctbz 四路反审骨架（end）=====");
    console.error("[反审.mjs] 语法校验通过（new Function 解析 OK）；阵营数=" + camps.length + "；round=" + a.round);
  }
  return afterSkeleton();
}

process.exit(main());
