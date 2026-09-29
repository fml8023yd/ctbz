# 取证 ctbz-2.1.3-席位降级（DeepSeek 官方欠费时的同源席降级）

生成时间: 2026-09-30T03:56:07+08:00
工作区: /Users/master/CODEX/草台班子/源码
基线 commit: 0715a486cc75c4178c673bec0fec4d54a4a311f6

## §1 缺陷：DeepSeek 官方两渠道均 402，第 4 席无法出回执

命令: `node -e "对两个 api.deepseek.com 渠道各发 1 次 deepseek-flash / deepseek-v4-pro 请求"`

```
31f56db1  deepseek-v4-pro     http=402  {"error":{"message":"Insufficient Balance (request_id: 4a9ecb26-bb57-48e0-a7f8-a4810e3b96ed)","
31f56db1  deepseek-flash      http=402  {"error":{"message":"Insufficient Balance (request_id: fb24e901-14cb-4228-829e-62e92a38f112)","
87bc4c2c  deepseek-v4-pro     http=402  {"error":{"message":"Insufficient Balance (request_id: d0feccf7-1dfd-4ea7-8e33-eb8c26f1f275)","
87bc4c2c  deepseek-flash      http=402  {"error":{"message":"Insufficient Balance (request_id: 6e406652-2f90-4b5e-82f6-baa76e394319)","
```

## §2 可用替代：WB 网关提供 DeepSeek 家族模型（同源，非独立席）

命令: `node -e "经 127.0.0.1:7864 调 deepseek-v4.1-flash / deepseek-v4-pro / deepseek-v4-flash"`

```
WB/deepseek-v4-pro       http=503  3161ms  model_echo=undefined
WB/deepseek-v4.1-flash   http=200  1329ms  model_echo=deepseek-v4.1-flash
WB/deepseek-v4-flash     http=200  1320ms  model_echo=deepseek-v4.1-flash
```

## §3 现状代码：席位表与凭据定位（改动前）

命令: `grep -n "SEAT_TABLE = {" -A 6 skills/ctbz/scripts/派发闸.mjs`

```
38:const SEAT_TABLE = {
39-  deepseek: { provider: "deepseek-official", models: ["deepseek-flash", "deepseek-v4-pro"] },
40-  zhipu:    { provider: "workbuddy",         models: ["glm-5.3-flash", "glm-5.3"] },
41-  tencent:  { provider: "workbuddy",         models: ["hy4-preview-f", "hy3"] },
42-  moonshot: { provider: "workbuddy",         models: ["kimi-k2.8-preview", "kimi-k2.7", "kimi-k2.6"] },
43-};
44-const CAMP_ORDER = Object.keys(SEAT_TABLE);
```

命令: `git show HEAD:skills/ctbz/scripts/反审直连.mjs | grep -n "const CAMPS" -A 6`

```
44:const CAMPS = {
45-  deepseek: { key: "deepseek", label: "DeepSeek", provider: "deepseek-official", model: "deepseek-flash", base: DEEPSEEK_BASE },
46-  zhipu:    { key: "zhipu",    label: "智谱",     provider: "workbuddy",         model: "glm-5.3-flash",   base: WORKBUDDY_BASE, reasoningEffort: "off" },
47-  tencent:  { key: "tencent",  label: "腾讯",     provider: "workbuddy",         model: "hy3",             base: WORKBUDDY_BASE },
48-  moonshot: { key: "moonshot", label: "月之暗面", provider: "workbuddy",         model: "kimi-k2.7",       base: WORKBUDDY_BASE },
49-};
50-
```

## §4 缺陷复现：deepseek 席当前直接判凭据失败（官方 key 402）

命令: `node skills/ctbz/scripts/反审直连.mjs --plan docs/取证/ctbz-2.1.3-计划.md --workspace . --camps deepseek --json`

```
(本轮实跑输出见 §5；改动前该路径只能落到官方端点并返回 402。)
```

## §5 回归测试与全量测试（改动后）

命令: `node --test tests/席位降级.test.mjs`（5 例：路径触发 / 尝试序列封顶 / 双渠道失败级联 / 闸门白名单放行与判红 / 官方优先）

```
✔ deepseek 席在官方凭据缺失时尝试声明的降级渠道（不触及官方端点） (103.8795ms)
✔ 尝试序列由席位表封顶：官方在前、备选在后、恰好两条 (0.8335ms)
✔ 双渠道都不可用时判 fail，且明示降级已尝试（失败级联不静默） (130.850583ms)
✔ 降级回执被派发闸按备选 provider 放行；未声明的 provider 组合仍判红 (312.52775ms)
✔ 官方渠道可用时优先官方，回执 provider 落官方 (84.18975ms)
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

命令: `node --test tests/*.test.mjs`

```
ℹ tests 135
ℹ pass 135
ℹ fail 0
```

## §6 席位降级实跑（官方欠费 → 降级出回执）

命令: `node skills/ctbz/scripts/反审直连.mjs --plan docs/取证/ctbz-2.1.3-计划.md --workspace . --camps deepseek --json`

```
  "mode": "direct-http",
  "ok": 1,
  "fail": 0,
  "rows": [
    {
      "camp": "deepseek",
      "label": "DeepSeek",
      "status": "ok",
      "http": 200,
      "latencyMs": 20153,
      "outFile": "/Users/master/CODEX/草台班子/源码/.ctbz-record/反审/ctbz-2.1.3-计划/deepseek.json"
    }
  ]
}
```
