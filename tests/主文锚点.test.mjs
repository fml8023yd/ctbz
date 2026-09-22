// T4 主文锚点验收：V1 / V6 / V13 + 镜像一致性。
// 约束：只读文件、零写盘、零网络；路径由 import.meta.url 相对定位，不硬编码用户目录。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_PATH = join(REPO, "skills/ctbz/SKILL.md");
const DSH_HOME = process.env.DSH_HOME || join(homedir(), ".dsh");
const AGENTS_PATH = join(DSH_HOME, "AGENTS.md");
// r6 补遗 F-5 ④⑤ 的读取目标（只读）。
const DISPATCH_PATH = join(REPO, "skills/ctbz/references/派发.md");
const CHANGELOG_PATH = join(REPO, "CHANGELOG.md");
const INTERNAL_AUDIT_PATH = join(REPO, "skills/ctbz/references/内审协议.md");

const SKILL = readFileSync(SKILL_PATH, "utf8");
const AGENTS = readFileSync(AGENTS_PATH, "utf8");
const DISPATCH = readFileSync(DISPATCH_PATH, "utf8");
const CHANGELOG = readFileSync(CHANGELOG_PATH, "utf8");
const skillLines = SKILL.split("\n");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// 计划 §9.11 内联快照 = 编辑前 SKILL.md:77 硬门原文。常量独立存在，不取自被检文件（禁自证）。
const HARD_GATE = `所有计划实施前必须走反审协议（按规模分级）；快速模式验证性产出为例外（转正需反审）；倒计时/自动模式授权不得替代反审执行。反审必含硬问题【新鲜 Agent 测试】："把计划单独给一个没读过任何上下文的 Agent，能不能不问问题就开工？"卡住点=计划欠的具体性，补齐才过。反审通过的计划下一步只能派发，主会话不得自己执行（"写完计划自己开工"违规）；普通与自动模式的小修复也保留独立反审。`;
const HARD_GATE_SHA = "d7bef505d4af949974b16948014d4fba8196c0c3156b823e7dcd173fd54d929e";

function mirrorBlock(text, name) {
  const begin = `<!-- ${name}:BEGIN`;
  const end = `<!-- ${name}:END`;
  const i = text.indexOf(begin);
  const j = text.indexOf(end);
  assert.ok(i >= 0, `缺 ${name} BEGIN 标记`);
  assert.ok(j > i, `缺 ${name} END 标记`);
  const eol = text.indexOf("\n", j);
  return text.slice(i, eol === -1 ? text.length : eol);
}

test("V1 冷启动可发现：命令、回执落点、禁用通道齐全", () => {
  for (const s of [
    "scripts/派发闸.mjs",
    "scripts/反审.mjs",
    "scripts/preflight.mjs",
    ".ctbz-record/反审/",
    "review_receipt",
    "spawn_teammate",
  ]) {
    assert.ok(SKILL.includes(s), `SKILL.md 缺「${s}」`);
  }
  const paras = SKILL.split(/\n{2,}/);
  assert.ok(
    paras.some((p) => p.includes("spawn_teammate") && p.includes("禁止")),
    "SKILL.md 缺「禁止用 spawn_teammate 承担反审席位」的同段约束",
  );
});

test("V6 启动自检：preflight 命令与「反审阻塞」处置文案", () => {
  assert.ok(SKILL.includes("preflight.mjs --json"), "SKILL.md 缺 preflight.mjs --json");
  assert.ok(SKILL.includes("反审阻塞"), "SKILL.md 缺「反审阻塞」");
});

test("V13 硬门未被下调：§9.11 快照行逐字保留且 sha256 不变", () => {
  // §9.11 的 77 是编辑前基线行号：T4 在 :7 之后插 §9.2（空行 + 7 行）、在 :62 之前插 §9.1（21 行 + 空行），
  // 共 +30 行；F1 回修在「派发前必跑」节末补 F-4 部署前置提示（正文 + 空行，仍在硬门行之前），再 +2 行。
  // 故该行落到 77 + 30 + 2 = 109。位移必须恰等于这几处授权插入——多一行即说明硬门被挪动。
  const BASE_LINE = 77;
  const T4_SHIFT = 30;
  const F1_SHIFT = 2;
  assert.equal(sha256(HARD_GATE + "\n"), HARD_GATE_SHA, "内联快照常量本身与 §9.11 sha256 不符");
  const hits = skillLines.filter((l) => l === HARD_GATE).length;
  assert.equal(hits, 1, `硬门原文出现 ${hits} 次，应为 1 次`);
  const lineNo = skillLines.indexOf(HARD_GATE) + 1;
  assert.equal(
    lineNo,
    BASE_LINE + T4_SHIFT + F1_SHIFT,
    `硬门原文在第 ${lineNo} 行，应为第 ${BASE_LINE + T4_SHIFT + F1_SHIFT} 行`,
  );
  assert.equal(skillLines[lineNo - 1].trim(), HARD_GATE, "硬门行 trim 后与快照不相等");
  assert.equal(
    sha256(skillLines[lineNo - 1] + "\n"),
    HARD_GATE_SHA,
    "硬门行 sha256 与 §9.11 不符（硬门被下调）",
  );
});

test("镜像一致性：两个标记块在 SKILL.md 与 ~/.dsh/AGENTS.md 逐字相等", () => {
  for (const name of ["末段契约", "哑巴模式"]) {
    assert.equal(mirrorBlock(SKILL, name), mirrorBlock(AGENTS, name), `${name} 块两处不一致`);
  }
});

test("全局指令含反审席位链边界修正与启动自检", () => {
  assert.ok(AGENTS.includes("反审席位链在 dsh 完全适用"), "AGENTS.md 缺 §9.7 边界修正句");
  assert.ok(AGENTS.includes("preflight.mjs --json"), "AGENTS.md 缺 §9.8 启动自检行");
});

// r6 补遗 F-5 ①–⑥：六个零断言编辑点的锚点保护。
test("F-5 ①② 硬闸节标题、三档 --level、定级表字段", () => {
  assert.ok(
    SKILL.includes("## 派发前必跑（硬闸，未过不得创建实施任务）"),
    "SKILL.md 缺硬闸节标题",
  );
  for (const s of ["--level l1", "--level l2", "--level l3"]) {
    assert.ok(SKILL.includes(s), `SKILL.md 缺「${s}」`);
  }
  assert.ok(SKILL.includes("review_scale"), "SKILL.md 缺 review_scale");
  assert.ok(
    SKILL.includes("架构级 / 改公共库 / 改他人文件 / 删除 / 注册模型 / 改主文"),
    "SKILL.md 缺定级表「重」档改动面整行",
  );
});

test("F-5 ③④⑤ 内审链接可达、派发契约四行、CHANGELOG 版本段", () => {
  assert.ok(SKILL.includes("[内审协议](references/内审协议.md)"), "SKILL.md 缺内审协议链接");
  assert.ok(existsSync(INTERNAL_AUDIT_PATH), `内审协议链接目标不存在：${INTERNAL_AUDIT_PATH}`);

  const i = DISPATCH.indexOf("### 1.1 实施任务契约必填字段");
  assert.ok(i >= 0, "派发.md 缺「### 1.1 实施任务契约必填字段」");
  const sec = DISPATCH.slice(i);
  for (const f of ["review_scale", "review_receipt", "review_camps", "plan_sha256"]) {
    assert.match(sec, new RegExp(`^${f}: `, "m"), `派发.md 1.1 节缺字段行「${f}:」`);
  }

  assert.ok(CHANGELOG.includes("## [2.0.6] - 2026-09-22"), "CHANGELOG.md 缺 2.0.6 版本段");
});

test("F-5 ⑥ 版本号 2.0.6、旧定级口径防回归、L2/L3 落盘目录名", () => {
  assert.match(SKILL, /^version: 2\.0\.6$/m, "SKILL.md frontmatter 版本号非 2.0.6");
  for (const s of ["架构级 6+", "模块级 4-6"]) {
    assert.ok(!SKILL.includes(s), `SKILL.md 仍含旧定级口径「${s}」（L2-1 回归）`);
  }
  for (const s of ["任务级/", "项目级/"]) {
    assert.ok(SKILL.includes(s), `SKILL.md 缺 L2/L3 落盘目录名「${s}」（L2-2 回归）`);
  }
});

// F5（L3 阻塞 B1 + zhipu 条件）：冷启动照抄命令必须可直接执行——第 1 步缺 --workspace、l2 缺 --task 均实测 exit 2。
test("F5 派发前必跑：第 1 步含 --workspace、l2 含 --task、无过时 AGENTS.md 事实", () => {
  const head = "## 派发前必跑（硬闸，未过不得创建实施任务）";
  const i = SKILL.indexOf(head);
  assert.ok(i >= 0, "SKILL.md 缺「派发前必跑」节标题");
  const next = SKILL.indexOf("\n## ", i + head.length);
  const sec = SKILL.slice(i, next === -1 ? SKILL.length : next);

  const step1 = sec.split("\n").find((l) => l.startsWith("1. 计划反审："));
  assert.ok(step1, "「派发前必跑」节缺第 1 步「计划反审」行");
  assert.ok(step1.includes("反审.mjs"), `第 1 步缺「反审.mjs」：${step1}`);
  assert.ok(step1.includes("--workspace"), `第 1 步缺「--workspace」（照抄必 exit 2）：${step1}`);

  assert.ok(
    sec.includes("--level l2 --task"),
    "「派发前必跑」节缺「--level l2 --task <T号>」（l2 裸跑实测 exit 2）",
  );

  assert.ok(
    !SKILL.includes("本机当前不存在，首次需创建"),
    "SKILL.md 仍含过时事实「本机当前不存在，首次需创建」（~/.dsh/AGENTS.md 已存在）",
  );
});
