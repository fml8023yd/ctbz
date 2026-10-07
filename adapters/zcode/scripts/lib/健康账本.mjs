// 健康账本（A3，2.1.4）：模型冷却记账唯一实现，脚本与选型器共用。
// 存储 ~/Documents/.ctbz/模型健康.json（版本目录外）；CTBZ_HEALTH_FILE 覆盖路径（测试注入夹具）。
// 容错约束：文件缺失/坏 JSON/非对象一律按空账本处理且不抛——选型不得依赖账本存在。
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// 退避档（计划 §10.2）：30 分→1 时→4 时→1 天；索引 = 本次失败「之前」已累计的失败次数
export const BACKOFF_MS = [30 * 60e3, 60 * 60e3, 4 * 60 * 60e3, 24 * 60 * 60e3];
const FILE_DEFAULT = join(homedir(), "Documents", ".ctbz", "模型健康.json");
const int = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);

export function ledgerFile() {
  return process.env.CTBZ_HEALTH_FILE || FILE_DEFAULT;
}

export function loadLedger() {
  const f = ledgerFile();
  if (!existsSync(f)) return {};
  try {
    const d = JSON.parse(readFileSync(f, "utf8"));
    return d && typeof d === "object" && !Array.isArray(d) ? d : {};
  } catch {
    return {};
  }
}

export function saveLedger(obj) {
  const f = ledgerFile();
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(obj ?? {}, null, 2));
  chmodSync(f, 0o600); // 账本含报错原文，限本人可读写
}

// 键归一化：含 ":" 或 "/" 取最后一段为模型名，否则原样；完整 ref 与短名据此互相命中
//
// 碰撞语义（A1 前置约定，T1 l2 zhipu 席裁定）：两个不同完整 ref 若归一化同名（如
// `wb-a/glm-5.3` 与 `wb-b/glm-5.3`），本模块一律按「同一模型」命中并共享退避计数——
// 即冷却按模型名而非渠道隔离。这是有意选择：同名模型通常同源同配额，跨渠道隔离会
// 让欠费渠道躲过冷却。A1 路由表落地后若需按渠道隔离，须在此改键为 channel/model 全键。
export function normalizeKey(ref) {
  const raw = typeof ref === "string" ? ref : String(ref ?? "");
  return { model: raw.includes(":") || raw.includes("/") ? raw.split(/[:/]/).pop() : raw, raw };
}

// 命中集合：账本中所有「同名键」（归一化后模型名相同）且冷却未过期的条目
function coolingMatches(model, now) {
  if (!model) return [];
  const out = [];
  for (const [key, entry] of Object.entries(loadLedger())) {
    if (normalizeKey(key).model !== model) continue;
    const untilMs = Date.parse(entry?.cooldown_until);
    if (Number.isFinite(untilMs) && untilMs > now) out.push({ key, entry, untilMs });
  }
  return out;
}

// 冷却判定；过期即自愈（只读，不改文件）
export function isCooling(ref, now = Date.now()) {
  return coolingMatches(normalizeKey(ref).model, now).length > 0;
}

// 全键列表 + 状态判定；entry 原样回传，供 CLI 保留旧字段
export function listLedger(now = Date.now()) {
  return Object.entries(loadLedger()).map(([key, entry]) => {
    const untilMs = Date.parse(entry?.cooldown_until);
    const valid = entry && typeof entry === "object";
    return {
      key,
      model: normalizeKey(key).model,
      cooling: Number.isFinite(untilMs) && untilMs > now,
      untilMs: Number.isFinite(untilMs) ? untilMs : null,
      entry: valid ? entry : {},
    };
  });
}

// 截止解析优先级：①显式日期时间（北京时间）②retry-after 秒数 ③退避档；均解析不出不再判错
function parseDeadline(errorText, prevFail, now) {
  const text = String(errorText ?? "");
  const m = text.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(:\d{2})?)/);
  if (m) {
    const t = Date.parse(`${m[1]}T${m[2]}${m[2].length === 5 ? ":00" : ""}+08:00`);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  const r = text.match(/(?:retry|after)\D{0,8}(\d{1,6})\s*s/i);
  if (r) return new Date(now + Number(r[1]) * 1000).toISOString();
  return new Date(now + BACKOFF_MS[Math.min(prevFail, BACKOFF_MS.length - 1)]).toISOString();
}

// 记一次失败；now 可注入（测试用），默认当前时刻
export function noteFailure(ref, errorText, now = Date.now()) {
  const { raw } = normalizeKey(ref);
  const ledger = loadLedger();
  const prev = ledger[raw] && typeof ledger[raw] === "object" ? ledger[raw] : {};
  const prevFail = int(prev.fail_count);
  const entry = {
    cooldown_until: parseDeadline(errorText, prevFail, now),
    source: String(errorText ?? "").slice(0, 120),
    recorded_at: new Date(now).toISOString(),
    fail_count: prevFail + 1,
  };
  ledger[raw] = entry;
  saveLedger(ledger);
  return { key: raw, ...entry };
}

// 记一次成功：fail_count 衰减 1、success_streak+1；连击满 3 该键计数清零。
// cooldown_until 不动——冷却只由时间到期自愈，成功不伪造状态。
export function noteSuccess(ref) {
  const { raw } = normalizeKey(ref);
  const ledger = loadLedger();
  const prev = ledger[raw] && typeof ledger[raw] === "object" ? ledger[raw] : {};
  let fail_count = Math.max(0, int(prev.fail_count) - 1);
  let success_streak = int(prev.success_streak) + 1;
  if (success_streak >= 3) { fail_count = 0; success_streak = 0; }
  const entry = { ...prev, fail_count, success_streak };
  ledger[raw] = entry;
  saveLedger(ledger);
  return { key: raw, ...entry };
}
