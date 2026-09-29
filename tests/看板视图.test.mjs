// T1 看板视图验收：graph-math 纯函数（零 DOM、零网络）。
// 约束：只读文件、零写盘；graph-math.js 为 classic script，经 node:vm 的 window 沙箱装载。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_PATH = resolve(REPO, "skills/ctbz/dashboard/graph-math.js");
const DAY = 86400000;

const source = () => readFileSync(MODULE_PATH, "utf8");
const math = () => {
  const context = { window: {} };
  vm.runInNewContext(source(), context);
  return context.window.CTBZGraphMath;
};
const node = (id, overrides = {}) => ({
  id,
  title: `节点 ${id}`,
  status: "planned",
  archived: false,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  ...overrides,
});

test("graph-math.js 为 classic script：零 import/export，经 window 暴露 5 个函数", () => {
  assert.ok(!/^\s*(?:import|export)\s/m.test(source()), "graph-math.js 不得含 import/export 语句");
  const api = math();
  assert.equal(typeof api, "object");
  for (const name of ["ganttDomain", "ganttRows", "depsLayers", "depsEdges", "milestoneItems"]) {
    assert.equal(typeof api[name], "function", `缺少纯函数 ${name}`);
  }
});

test("ganttDomain 空数组：返回 empty 且不抛", () => {
  const domain = math().ganttDomain([]);
  assert.equal(domain.empty, true);
  assert.ok(Number.isFinite(domain.t0) && Number.isFinite(domain.t1));
  assert.ok(domain.t1 > domain.t0);
});

test("ganttDomain 单节点零跨距：两端各扩半日，无 NaN", () => {
  const domain = math().ganttDomain([node("n1")]);
  assert.equal(domain.empty, false);
  assert.ok(Number.isFinite(domain.t0) && Number.isFinite(domain.t1));
  assert.ok(domain.t1 - domain.t0 >= DAY);
});

test("ganttRows 两节点跨日：坐标全为有限数且条宽不小于 6", () => {
  const api = math();
  const nodes = [node("n1"), node("n2", { createdAt: "2026-09-02T00:00:00Z", updatedAt: "2026-09-04T06:00:00Z" })];
  const rows = api.ganttRows(nodes, api.ganttDomain(nodes));
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.ok(Number.isFinite(row.x) && Number.isFinite(row.y) && Number.isFinite(row.width), `${row.id} 坐标含 NaN`);
    assert.ok(row.width >= 6);
  }
  assert.ok(rows[1].x > rows[0].x);
  assert.equal(rows[0].y, 0);
  assert.equal(rows[1].y, 30);
});

test("ganttRows 无效时间戳：回落域起点，不产生 NaN", () => {
  const api = math();
  const nodes = [node("n1"), node("broken", { createdAt: "不是时间", updatedAt: null })];
  const rows = api.ganttRows(nodes, api.ganttDomain(nodes));
  const broken = rows.find(row => row.id === "broken");
  assert.ok(broken);
  assert.equal(broken.invalidTime, true);
  for (const value of [broken.x, broken.width, broken.y]) assert.ok(Number.isFinite(value));
  const only = api.ganttDomain([node("only", { createdAt: "无效", updatedAt: "无效" })]);
  assert.equal(only.empty, true);
  assert.ok(Number.isFinite(only.t0) && Number.isFinite(only.t1));
});

test("depsLayers 依赖指向不存在节点：过滤该边且不抛", () => {
  const api = math();
  const nodes = [node("a", { dependsOn: ["ghost"] }), node("b")];
  const layers = api.depsLayers(nodes);
  assert.equal(layers.invalid.length, 0);
  assert.deepEqual([...layers.layer.keys()].sort(), ["a", "b"]);
  assert.equal(api.depsEdges(nodes).length, 0);
});

test("depsLayers 成环：不抛，环内节点落 invalid 且同层", () => {
  const layers = math().depsLayers([node("a", { dependsOn: ["b"] }), node("b", { dependsOn: ["a"] })]);
  assert.deepEqual([...layers.invalid].sort(), ["a", "b"]);
  assert.equal(layers.layer.get("a"), layers.depth);
  assert.equal(layers.layer.get("b"), layers.depth);
});

test("depsLayers 链式依赖 a→b→c：分层递增且保序", () => {
  const { layer, invalid } = math().depsLayers([node("c", { dependsOn: ["b"] }), node("b", { dependsOn: ["a"] }), node("a")]);
  assert.equal(invalid.length, 0);
  assert.equal(layer.get("a"), 0);
  assert.equal(layer.get("b"), 1);
  assert.equal(layer.get("c"), 2);
  assert.equal(new Set(layer.values()).size, 3);
});

test("milestoneItems 两轮 board：条目计数（进行中轮只出 startedAt）与倒序", () => {
  const board = {
    project: { createdAt: "2026-09-01T00:00:00Z" },
    rounds: [
      { number: 1, startedAt: "2026-09-02T00:00:00Z", finishedAt: "2026-09-03T00:00:00Z" },
      { number: 2, startedAt: "2026-09-04T00:00:00Z", finishedAt: null },
    ],
    nodes: [
      node("d1", { status: "completed", kind: "task", updatedAt: "2026-09-03T01:00:00Z" }),
      node("g1", { status: "completed", kind: "group" }),
      node("d2", { status: "active", kind: "task" }),
    ],
  };
  const items = math().milestoneItems(board);
  assert.equal(items.length, 5, "项目 1 + 第 1 轮 2 + 第 2 轮 1 + 已完成非 group 节点 1");
  assert.deepEqual([...new Set(items.map(item => item.kind))].sort(), ["node", "project", "round"]);
  assert.ok(items.every((item, index) => index === 0 || Date.parse(items[index - 1].at) >= Date.parse(item.at)));
  assert.ok(items.some(item => item.label === "✓ 节点 d1"));
});
