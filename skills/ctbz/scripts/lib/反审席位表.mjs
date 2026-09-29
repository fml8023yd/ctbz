// 反审席位表 —— 单一真源（2.1.3 起）。
//
// 为什么单独成文件：调用路径（反审直连.mjs）与闸门（派发闸.mjs）各自维护一份席位表时，
// 降级白名单会在两处漂移——「runner 放行的组合」与「闸门放行的组合」不再一致，
// 属于反审意见明确点名的结构性风险（docs/取证/ctbz-2.1.3-席位降级.md §6）。
// 本文件只放数据，不放逻辑：两边 import 同一份声明。

export const DEEPSEEK_BASE = "https://api.deepseek.com";
export const WORKBUDDY_BASE = "http://101.133.151.121:18890/v1"; // 自建通道（已知 http 明文风险）

// 席位表：camp → 主 provider/模型 + 可选备选 provider（同源席欠费降级用）。
// - deepseek 席取 deepseek-flash（与主进程同源，不计独立性）；官方两渠道同时欠费时可降级到
//   WB 网关的 DeepSeek 模型（仍同源，独立性由另三席保证）；官方可用时优先官方。
// - zhipu 席 reasoningEffort "off"：glm 在反审这类长结构化任务上会无限推理（实测 15 分钟、
//   正文 0 字），关推理后立即出正文；反审是结构化判断，不依赖长思维链。
// - 2026-09-30 模型改判：本机网关对单次上游生成有 ~120s 硬上限，超时即断流/502
//   （实测 hy4-preview-f 与 kimi-k2.8-preview 断流、kimi-k3 502；hy3/kimi-k2.7/kimi-k2.6 正常）。
export const CAMPS = {
  deepseek: { key: "deepseek", label: "DeepSeek", provider: "deepseek-official", model: "deepseek-flash", base: DEEPSEEK_BASE,
              fallback: { provider: "workbuddy", model: "deepseek-v4.1-flash" } },
  zhipu:    { key: "zhipu",    label: "智谱",     provider: "workbuddy",         model: "glm-5.3-flash",   base: WORKBUDDY_BASE, reasoningEffort: "off" },
  tencent:  { key: "tencent",  label: "腾讯",     provider: "workbuddy",         model: "hy3",             base: WORKBUDDY_BASE },
  moonshot: { key: "moonshot", label: "月之暗面", provider: "workbuddy",         model: "kimi-k2.7",       base: WORKBUDDY_BASE },
};

export const CAMP_ORDER = Object.keys(CAMPS);

// 闸门侧席位表（含历史兼容值与备选白名单），由 CAMPS 派生，禁止手写第二份模型清单：
// - deepseek 席 v4-pro 为历史兼容值（2.0.6/2.0.7/2.0.8 旧回执）；
// - altProviders 的取值与 CAMPS[*].fallback 对应，由 buildSeatTable 统一生成。
export function buildSeatTable(camps = CAMPS) {
  const table = {};
  for (const key of Object.keys(camps)) {
    const camp = camps[key];
    const models = [camp.model];
    // 历史兼容：旧回执用过的模型名继续放行（不新增调用能力）。
    if (key === "deepseek") models.push("deepseek-v4-pro");
    if (key === "zhipu") models.push("glm-5.3");
    if (key === "tencent") models.push("hy4-preview-f");
    if (key === "moonshot") models.push("kimi-k2.8-preview", "kimi-k2.6");
    const entry = { provider: camp.provider, models };
    if (camp.fallback) entry.altProviders = { [camp.fallback.provider]: [camp.fallback.model] };
    table[key] = entry;
  }
  return table;
}

export const SEAT_TABLE = buildSeatTable();

/** 按 provider 取该席允许的模型清单；未声明的 provider 返回空数组（fail-closed）。 */
export function allowedModelsFor(camp, provider) {
  const seat = SEAT_TABLE[camp];
  if (!seat) return [];
  if (provider === seat.provider) return seat.models;
  return seat.altProviders?.[provider] ?? [];
}

/**
 * 该席按序尝试的 provider/model 组合：主渠道在前，声明的备选在后，最多两条。
 * 「恰好一次降级」由本函数封顶——调用方不得自行追加第三路，避免失败时无限重试。
 */
export function seatAttempts(camp) {
  const entry = CAMPS[camp];
  if (!entry) return [];
  const attempts = [{ provider: entry.provider, model: entry.model }];
  if (entry.fallback) attempts.push({ provider: entry.fallback.provider, model: entry.fallback.model });
  return attempts;
}
