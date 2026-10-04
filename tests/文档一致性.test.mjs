// 文档一致性锁（计划 C3：文档-实现漂移，见 docs/ctbz-全面提升计划-20261005.md §C3/§10.5）。
// 锁「文档声明的关键事实」与实现实体：脚本路径、补齐命令引用、席位表、源路径声明、复命模板、测试命名。
// 约束：只读文件、零写盘、零网络、零依赖；路径由 import.meta.url 相对定位，不硬编码用户目录。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_DIR = join(REPO, "skills/ctbz");
const SCRIPTS = join(SKILL_DIR, "scripts");
const SKILL_PATH = join(SKILL_DIR, "SKILL.md");
const DISPATCH_PATH = join(SKILL_DIR, "references/派发.md");
const SEAT_TABLE_PATH = join(SCRIPTS, "lib/反审席位表.mjs");
const GATE_PATH = join(SCRIPTS, "派发闸.mjs");

const SKILL = readFileSync(SKILL_PATH, "utf8");
const DISPATCH = readFileSync(DISPATCH_PATH, "utf8");
const GATE_SRC = readFileSync(GATE_PATH, "utf8");

test("① SKILL.md 声明的 scripts/*.mjs|js 全部存在，关键脚本必须被覆盖", () => {
  const re = /scripts\/([\p{L}\p{N}_./-]+\.(?:mjs|js))/gu;
  const names = [...new Set([...SKILL.matchAll(re)].map((m) => m[1]))];
  assert.ok(names.length >= 6, `提取到的脚本名过少（${names.length}）：${names.join(",")}`);
  for (const name of names) {
    assert.ok(existsSync(join(SCRIPTS, name)), `SKILL.md 声明 scripts/${name}，文件不存在`);
  }
  // 主文引用过、且必须持续声明的关键脚本：引用被删 = 文档事实缺件，同判红。
  for (const key of ["反审直连.mjs", "派发闸.mjs", "内审.mjs", "模型健康.js", "部署.js"]) {
    assert.ok(names.includes(key), `SKILL.md 未再引用关键脚本 ${key}`);
  }
  // 实存关键文件（含 SKILL.md 未逐字引用的 lib 模块）须被本锁覆盖。
  for (const rel of ["反审直连.mjs", "派发闸.mjs", "内审.mjs", "模型健康.js", "部署.js", "lib/反审链.mjs", "lib/反审席位表.mjs"]) {
    assert.ok(existsSync(join(SCRIPTS, rel)), `关键脚本缺失：scripts/${rel}`);
  }
});

// 已知缺陷白名单（2026-10-05 T5 已修：派发闸 SKELETON 改指 反审直连.mjs）；
// 保留空集以固化「不得新增未点名引用」的检查语义——新增缺陷一律判红，不再放行。
const GATE_KNOWN_MISSING = new Set([]);

test("② 派发闸补齐命令引用的脚本存在（已知缺陷白名单除外）", () => {
  const re = /join\(\s*SELF_DIR\s*,\s*["']([^"']+)["']\s*\)/g;
  const names = [...new Set([...GATE_SRC.matchAll(re)].map((m) => m[1]))];
  for (const key of ["派发闸.mjs", "内审.mjs"]) {
    assert.ok(names.includes(key), `未从 join(SELF_DIR, …) 提取到预期脚本 ${key}：${names.join(",")}`);
  }
  for (const name of names) {
    if (GATE_KNOWN_MISSING.has(name)) continue;
    assert.ok(existsSync(join(SCRIPTS, name)), `派发闸.mjs 引用 scripts/${name}，文件不存在`);
  }
});

// 已知漂移白名单（2026-10-05 已修：派发.md §3 M5 已正为 kimi-k2.7 并加唯一真源注）；
// 保留空映射以固化「文档与席位表不一致即判红」的语义。
const DOC_KNOWN_DRIFT = new Map([]);

test("③ 席位表各席 provider/model 与派发.md 声明不冲突", async () => {
  const { CAMPS } = await import(pathToFileURL(SEAT_TABLE_PATH).href);
  assert.deepEqual(Object.keys(CAMPS).sort(), ["deepseek", "moonshot", "tencent", "zhipu"]);
  for (const [camp, seat] of Object.entries(CAMPS)) {
    assert.ok(DISPATCH.includes(seat.provider), `派发.md 未声明席位 ${camp} 的 provider：${seat.provider}`);
    assert.ok(
      DISPATCH.includes(seat.model) || DOC_KNOWN_DRIFT.get(camp) === seat.model,
      `派发.md 未声明席位 ${camp} 的 model：${seat.model}`,
    );
  }
});

test("④ SKILL.md 开发工作区节：含 installRoot 或以 / 开头的绝对路径（换机安全）", () => {
  const head = "## 开发工作区";
  const i = SKILL.indexOf(head);
  assert.ok(i >= 0, "SKILL.md 缺「开发工作区」节");
  const next = SKILL.indexOf("\n## ", i + head.length);
  const sec = SKILL.slice(i, next === -1 ? SKILL.length : next);
  assert.ok(
    sec.includes("installRoot") || /(?:^|[`（(\s])\/[^\s`）)]+/.test(sec),
    "「开发工作区」节既无 installRoot 也不含以 / 开头的绝对路径",
  );
});

test("⑤ 复命清单模板六段标题齐全", () => {
  const i = SKILL.indexOf("**复命清单模板**");
  assert.ok(i >= 0, "SKILL.md 缺复命清单模板");
  const fenceStart = SKILL.indexOf("```", i);
  const fenceEnd = SKILL.indexOf("```", fenceStart + 3);
  assert.ok(fenceStart >= 0 && fenceEnd > fenceStart, "复命清单模板缺代码围栏");
  const tpl = SKILL.slice(fenceStart, fenceEnd);
  for (const seg of ["自主延伸", "自主修复", "交付前三问", "待裁决", "自疑", "行动账增量"]) {
    assert.match(tpl, new RegExp(`^${seg}:\\s*$`, "m"), `复命清单模板缺「${seg}:」段`);
  }
});

test("⑥ tests/ 下测试命名自洽：*.mjs 均以 .test.mjs 结尾、无重名、无「副本」散落", () => {
  const mjs = readdirSync(join(REPO, "tests"), { recursive: true }).filter((f) => f.endsWith(".mjs"));
  assert.ok(mjs.length >= 6, `tests/ 下 .mjs 文件过少：${mjs.length}`);
  for (const f of mjs) {
    assert.ok(f.endsWith(".test.mjs"), `tests/ 下存在非 .test.mjs 的 mjs：${f}`);
    assert.ok(!f.includes("副本"), `tests/ 下存在「副本」类散落文件：${f}`);
  }
  const bases = mjs.map((f) => f.split(/[\\/]/).pop());
  assert.equal(new Set(bases).size, bases.length, `测试文件重名：${bases.join(",")}`);
});
