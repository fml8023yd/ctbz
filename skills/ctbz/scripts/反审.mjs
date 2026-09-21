#!/usr/local/bin/node
// ctbz 反审骨架生成器（dsh 版）
//
// 用法：
//   /usr/local/bin/node 反审.mjs --plan <计划md路径> [--camps deepseek,zhipu,tencent,moonshot]
//                                [--round 1|2] [--prev <一轮记录目录>] [--dry-run] [--out <骨架文件>]
//
// 产物：可直接交给 dsh `workflow` 工具执行的 JS 骨架（脚本体）。
//   - 调度走 workflow 的 agent(prompt,{provider,model})，显式传 provider/model（见 references/派发.md §3 模型代号表）。
//   - 反审席位 DeepSeek 一律 deepseek-v4-pro（避免与主进程 deepseek-flash 同模型自审）。
//   - 规避 maxResultChars 50000 静默截断：每路裁决由 reviewer 子代理写入独立文件（.ctbz-record 下），
//     workflow 仅回 "文件路径 + 一句话摘要"，不被 50k 截断吞掉。
//   - 只依赖 workflow 提供的 agent()；不使用任何 Node 文件系统/网络 API（workflow 沙箱不提供）。

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 模型代号表：与 references/派发.md §3 完全一致（4 阵营 / 5 模型取样，反审席位 DeepSeek 取 deepseek-v4-pro）
const CAMPS = {
  deepseek: { key: "deepseek", label: "DeepSeek", provider: "deepseek-official", model: "deepseek-v4-pro" },
  zhipu:    { key: "zhipu",    label: "智谱",     provider: "workbuddy",         model: "glm-5.3-flash" },
  tencent:  { key: "tencent",  label: "腾讯",     provider: "workbuddy",         model: "hy4-preview-f" },
  moonshot: { key: "moonshot", label: "月之暗面", provider: "workbuddy",         model: "kimi-k2.8-preview" },
};

const SIX_VIEWS = ["需求一致性", "架构合理性", "测试完整性", "边界条件", "性能安全", "用户体验"];

function parseArgs(argv) {
  const a = { camps: Object.keys(CAMPS).join(","), round: "1", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--plan") a.plan = argv[++i];
    else if (t === "--camps") a.camps = argv[++i];
    else if (t === "--round") a.round = argv[++i];
    else if (t === "--prev") a.prev = argv[++i];
    else if (t === "--out") a.out = argv[++i];
    else if (t === "--dry-run") a.dryRun = true;
    else if (t === "-h" || t === "--help") a.help = true;
  }
  return a;
}

const USAGE = `ctbz 反审骨架生成器（dsh 版）

用法：
  node 反审.mjs --plan <计划md路径> [选项]

选项：
  --plan <路径>                      计划文件（必填；路径会原样烤进骨架，使骨架不看上下文独立开工）
  --camps <c1,c2,...>                参与阵营，默认全 4 路：deepseek,zhipu,tencent,moonshot
  --round <1|2>                      反审轮次，默认 1；2 仅针对未解决项
  --prev <目录>                      第一轮记录目录（round=2 时注入"只针对未解决项"限定）
  --dry-run                          打印骨架到 stdout 并用 new Function 校验语法
  --out <文件>                       将骨架写入文件（不打印）
  -h, --help                         显示本帮助

示例：
  node 反审.mjs --plan docs/ctbz-dsh-实施计划-20260921.md --dry-run
  node 反审.mjs --plan docs/某计划.md --round 2 --prev .ctbz-record/反审/某计划 --out /tmp/反审-r2.js`;

function buildSkeleton({ plan, camps, round, prev }) {
  const planLit = JSON.stringify(plan);
  const campsLit = JSON.stringify(camps);
  const viewsLit = JSON.stringify(SIX_VIEWS);
  const roundLit = JSON.stringify(round);
  const prevLit = JSON.stringify(prev || null);

  const L = [];
  L.push("// ctbz 四路反审骨架（scripts/反审.mjs 自动生成，可直接交 dsh workflow 执行）");
  L.push("// 调度：workflow agent(prompt,{provider,model})；模型代号见 references/派发.md §3");
  L.push("// 反审席位 DeepSeek 一律 deepseek-v4-pro（避免与主进程 deepseek-flash 同模型自审）");
  L.push("// 规避 maxResultChars 50000 静默截断：每路裁决由 reviewer 子代理写入独立文件，workflow 仅回 路径+摘要");
  L.push("");
  L.push("const PLAN = " + planLit + ";");
  L.push("const SIX_VIEWS = " + viewsLit + ";");
  L.push("const CAMPS = " + campsLit + ";");
  L.push("const ROUND = " + roundLit + ";");
  L.push("const PREV_DIR = " + prevLit + ";");
  L.push("const RECORD_DIR = \".ctbz-record/反审/\" + PLAN.split(\"/\").pop().replace(/\\.md$/i, \"\");");
  L.push("");
  L.push("const ROUND_RULE = ROUND === \"2\"");
  L.push("  ? \"第二轮：只针对 PREV_DIR 中未解决项（类别=阻塞 或 结论!=接受）。重提已否决意见须带新证据，否则视为无效。\"");
  L.push("  : \"第一轮：六视角全量核查。\";");
  L.push("");
  L.push("const results = [];");
  L.push("for (const c of CAMPS) {");
  L.push("  const outFile = RECORD_DIR + \"/\" + c.key + \".json\";");
  L.push("  const prompt = [");
  L.push("    \"你是 ctbz 反审员（阵营：\" + c.label + \"）。对计划文件 \" + PLAN + \" 执行反审。\",");
  L.push("    \"六视角逐一核查：\" + SIX_VIEWS.join(\"、\") + \"。\",");
  L.push("    \"裁决表每视角一行，字段：类别(阻塞/非阻塞/可接受) | 证据(文件行号或命令) | 结论(接受/有条件接受/不接受) | 逐条处置。\",");
  L.push("    ROUND_RULE,");
  L.push("    \"将完整裁决表写入文件：\" + outFile + \"（JSON：{camp,plan,round,verdicts:[{view,category,evidence,conclusion,disposition}],summary}）。\",");
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

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help) { console.log(USAGE); return 0; }
  if (!a.plan) { console.error("缺少 --plan <计划md路径>\n" + USAGE); return 2; }
  if (!existsSync(a.plan)) { console.error("计划文件不存在：" + a.plan); return 2; }

  const keys = a.camps.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = keys.filter((k) => !CAMPS[k]);
  if (unknown.length) { console.error("未知阵营：" + unknown.join(",") + "；可选：" + Object.keys(CAMPS).join(",")); return 2; }
  const camps = keys.map((k) => CAMPS[k]);

  const skeleton = buildSkeleton({ plan: a.plan, camps, round: a.round, prev: a.prev });

  if (a.out) {
    writeFileSync(a.out, skeleton, "utf8");
    console.error("[反审.mjs] 骨架已写入 " + a.out);
    return 0;
  }

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
  return 0;
}

process.exit(main());
