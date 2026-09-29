# 取证 ctbz-2.1.1-凭据定位修复

生成时间: 2026-09-30T02:13:53+08:00
工作区: /Users/master/CODEX/草台班子/源码
基线 commit: 2edfe7f1a6c940aa31f62d608564d782b995a6d7

## §1 缺陷复现（HEAD 版 preflight + 当前宿主配置 = 凭据未命中，零计费）

命令: `git show HEAD:skills/ctbz/scripts/preflight.mjs > /tmp/preflight-HEAD.mjs && node /tmp/preflight-HEAD.mjs --json --only M2`

```json
{
  "ran_at": "2026-09-29T18:13:54.761Z",
  "calls_made": 1,
  "budget_total": 5,
  "ok": 0,
  "fail": 1,
  "timeout": 0,
  "credentials": {
    "workbuddy": {
      "source": "zcode-config 未命中（workbuddy @ http://101.133.151.121:18890/v1）",
      "present": false
    }
  },
  "ledger_updates": [],
  "rows": [
    {
      "code": "M2",
      "provider": "workbuddy",
      "model": "glm-5.3-flash",
      "vendor": "智谱",
      "cost": "credit 0.01",
      "status": "fail",
      "http": null,
      "latencyMs": 0,
      "detail": "凭据缺失（来源 zcode-config 未命中（workbuddy @ http://101.133.151.121:18890/v1））"
    }
  ],
  "note": "status 区分 ok/fail/timeout；fail 含限额/欠费类错误（如实标注，不假报成功）。凭据不打印不落盘。"
}
```

## §2 宿主配置事实（脱敏：不打印 apiKey）

命令: `node -e "读 ~/.zcode/v2/config.json，列 provider id / name / baseURL / 是否有 key"`

```
builtin:bigmodel-coding-plan | BigModel - Coding Plan | https://open.bigmodel.cn/api/anthropic | key=y | models=GLM-5.3,GLM-5.3-Flash
builtin:bigmodel-start-plan | BigModel- Coding Plan | https://zcode.z.ai/api/v1/zcode-plan/anthropic | key=y | models=GLM-5.3-Flash
builtin:zai-coding-plan | Z.ai - Coding Plan | https://api.z.ai/api/anthropic | key=n | models=GLM-5.3,GLM-5.3-Flash
builtin:zai-start-plan | Z.ai - Coding Plan | https://zcode.z.ai/api/v1/zcode-plan/anthropic | key=n | models=
builtin:bigmodel | Bigmodel - API Key | https://open.bigmodel.cn/api/anthropic | key=n | models=GLM-5.3,GLM-5.3-Flash
builtin:zai | Z.ai - API Key | https://api.z.ai/api/anthropic | key=n | models=GLM-5.3,GLM-5.3-Flash
8d56774b-5308-4c7c-a9fd-eb79d32b7a03 | Draw | https://drawlumo.xyz/v1 | key=y | models=gpt-5.6-sol,gpt-5.6-terra,gpt-5.6-luna,deepseek-v4-flash,kimi-k3,deepseek-v4-pro,omen-alpha,gpt-6-aster,gpt-5.5
31f56db1-2f80-4661-9651-7bed1f43f5c7 | Deepseek-ML | https://api.deepseek.com | key=y | models=deepseek-v4-flash,deepseek-v4-flash-vision-exp,deepseek-v4.1-flash
8ec08115-c3af-4baa-bb45-5f558bb1dbfa | 2b | https://2btocken.xyz/v1 | key=y | models=gpt-5.6-luna,gpt-5.6-sol,gpt-6-astra
87bc4c2c-84b3-49aa-9277-2479eac0a6f6 | Deepseek-JN | https://api.deepseek.com | key=y | models=deepseek-v4-flash,deepseek-v4-flash-vision-exp
0f0bc352-25a1-4813-9a02-1534a94e9977 | WB | http://127.0.0.1:7864/v1 | key=y | models=hy3,deepseek-v4.1-flash,glm-5.3,glm-5.2,kimi-k2.7,minimax-m3,hy3-x,auto
55f03925-cee1-4269-8113-25257456b065 | 2b-global | https://wb.2btocken.xyz/v1 | key=y | models=deepseek-v4.1-flash,deepseek-v4.1-flash-sg,gpt-5.6-luna,gpt-5.6-sol,gpt-6-astra,gpt-5.5,kimi-k3
```

关键比对：
- 旧前缀（脚本硬编码）: http://101.133.151.121:18890/v1
- 当前配置 WB 渠道: 见上表 0f0bc352 行

## §3 网关侧模型存在性（GET /v1/models，零计费）

命令: `node -e "GET http://127.0.0.1:7864/v1/models，检查 4 个反审/探活模型是否存在"`

```
网关模型总数: 61
存在  glm-5.3-flash
存在  hy4-preview-f
存在  hy3
存在  kimi-k2.8-preview
```

## §4 修复后行为验证（源码版脚本，真实计费：M2 0.01 credit / M4 免费）

命令: `node skills/ctbz/scripts/preflight.mjs --json --only M2,M4`

```json
{
  "ran_at": "2026-09-29T18:14:14.244Z",
  "calls_made": 2,
  "budget_total": 5,
  "ok": 2,
  "fail": 0,
  "timeout": 0,
  "credentials": {
    "workbuddy": {
      "source": "zcode-config:0f0bc352-25a1-4813-9a02-1534a94e9977",
      "present": true
    }
  },
  "ledger_updates": [],
  "rows": [
    {
      "code": "M2",
      "provider": "workbuddy",
      "model": "glm-5.3-flash",
      "vendor": "智谱",
      "cost": "credit 0.01",
      "endpoint": "http://127.0.0.1:7864/v1",
      "status": "ok",
      "http": 200,
      "latencyMs": 2846,
      "detail": "HTTP 2xx",
      "credit": 0.01,
      "creditCumulative": 0.01,
      "usage": {
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 0,
        "cached_tokens": 0,
        "completion_thinking_tokens": 16,
        "completion_tokens": 16,
        "completion_tokens_details": {
          "accepted_prediction_tokens": 0,
          "audio_tokens": 0,
          "cached_tokens": 0,
          "reasoning_tokens": 16,
          "rejected_prediction_tokens": 0
        },
        "credit": 0.01,
        "prompt_cache_hit_tokens": 3776,
        "prompt_cache_miss_tokens": 36,
        "prompt_cache_write_tokens": 0,
        "prompt_tokens": 3812,
        "prompt_tokens_details": {
          "accepted_prediction_tokens": 0,
          "audio_tokens": 0,
          "cached_tokens": 3776,
          "reasoning_tokens": 0,
          "rejected_prediction_tokens": 0
        },
        "total_tokens": 3828
      }
    },
    {
      "code": "M4",
      "provider": "workbuddy",
      "model": "hy3",
      "vendor": "腾讯",
      "cost": "0",
      "endpoint": "http://127.0.0.1:7864/v1",
      "status": "ok",
      "http": 200,
      "latencyMs": 2091,
      "detail": "HTTP 2xx",
      "credit": 0,
      "creditCumulative": 0,
      "usage": {
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 0,
        "cached_tokens": 0,
        "completion_thinking_tokens": 16,
        "completion_tokens": 16,
        "completion_tokens_details": {
          "accepted_prediction_tokens": 0,
          "audio_tokens": 0,
          "cached_tokens": 0,
          "reasoning_tokens": 16,
          "rejected_prediction_tokens": 0
        },
        "credit": 0,
        "prompt_cache_hit_tokens": 0,
        "prompt_cache_miss_tokens": 3864,
        "prompt_cache_write_tokens": 0,
        "prompt_tokens": 3864,
        "prompt_tokens_details": {
          "accepted_prediction_tokens": 0,
          "audio_tokens": 0,
          "cached_tokens": 0,
          "reasoning_tokens": 0,
          "rejected_prediction_tokens": 0
        },
        "total_tokens": 3880
      }
    }
  ],
  "note": "status 区分 ok/fail/timeout；fail 含限额/欠费类错误（如实标注，不假报成功）。凭据不打印不落盘。"
}
```

## §5 新增回归测试（零网络、零计费）

命令: `node --test tests/凭据定位.test.mjs`

```
✔ 本机网关前缀（127.0.0.1:7864）命中凭据，不再报凭据缺失 (127.532ms)
✔ 旧通道前缀（101.133.151.121:18890）向后兼容 (137.306083ms)
✔ 无关前缀仍判凭据缺失（负例） (78.751333ms)
✔ 反审直连 dry-run 取宿主配置命中的端点，不写死地址 (111.586209ms)
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

## §6 全量测试 + 锁重算

命令: `node --test tests/*.test.mjs`

```
ℹ tests 126
ℹ pass 126
ℹ fail 0
```

命令: `node skills/ctbz/scripts/发布检查.js "$(pwd)/skills/ctbz"`

```
✓ ② verifyBundle 自测
✓ ③ initialize status 冒烟（不得报依赖检查失败）
{
  "ok": true,
  "steps": 3,
  "root": "/Users/master/CODEX/草台班子/源码/skills/ctbz"
}
发布前置检查全部通过，可 commit/tag/Release。
```

## §7 DeepSeek 席可用性（两个渠道，真实探测）

命令: 对 31f56db1-…（Deepseek-ML）与 87bc4c2c-…（Deepseek-JN）各发 1 次 deepseek-flash 请求

```
31f56db1-2f80-4661-9651-7bed1f43f5c7 | http=402 | {"error":{"message":"Insufficient Balance (request_id: cd0b6a03-6d8b-4075-aeae-d1a0eed962b8)","type":"unknown_error","pa
87bc4c2c-84b3-49aa-9277-2479eac0a6f6 | http=402 | {"error":{"message":"Insufficient Balance (request_id: 1ecb32b0-b4a4-40bd-9fbc-f92980714dd9)","type":"unknown_error","pa
```

## §8 席位模型可用性实测（同一反审 prompt，2026-09-30）

背景：本机网关对单次上游生成有 ~120s 硬上限，超时即断流或 502。命令为同 prompt 直连 127.0.0.1:7864 非流式。

```
hy4-preview-f      | 断流（stream-broken terminated，正文 0 字符）
kimi-k2.8-preview  | 断流（同上，413 块后终止）
kimi-k3            | http=502 upstream_unavailable（120105ms）
hy3                | http=200  40027ms  content_len=1464
kimi-k2.7          | http=200  61118ms  content_len=1887
kimi-k2.6          | http=200  15426ms  content_len=2228
```

结论：腾讯席改 hy3、月之暗面席改 kimi-k2.7；派发闸 SEAT_TABLE 同步扩 moonshot 允许模型（先例：zhipu 席 2.1.0 扩 glm-5.3）。

## §9 前缀白名单封闭性（反审意见补测）

命令: `node --test tests/凭据定位.test.mjs`（含 后缀伪装与空值两负例）

```
✔ 本机网关前缀（127.0.0.1:7864）命中凭据，不再报凭据缺失 (109.758ms)
✔ 旧通道前缀（101.133.151.121:18890）向后兼容 (109.304ms)
✔ 无关前缀仍判凭据缺失（负例） (87.940209ms)
✔ 后缀伪装前缀不命中（白名单封闭，负例） (93.312041ms)
✔ baseURL 为空按凭据缺失处理，不抛异常（边界） (70.220792ms)
✔ 多前缀同时命中时按配置枚举序取首条（确定性） (117.031583ms)
✔ 反审直连 dry-run 取宿主配置命中的端点，不写死地址 (113.187667ms)
ℹ tests 7
ℹ pass 7
ℹ fail 0
```

多前缀命中确定性: 命中顺序 = 宿主配置 provider 枚举序（wb-alpha 先于 wb-beta），见同文件用例「多前缀同时命中时按配置枚举序取首条」。

## §10 全量回归（白名单改造后）

命令: `node --test tests/*.test.mjs`

```
ℹ tests 129
ℹ pass 129
ℹ fail 0
```

## §11 源码改动行摘录（供席位核验行号锚点）

命令: `grep -n "function baseMatches" -A 3 skills/ctbz/scripts/preflight.mjs skills/ctbz/scripts/反审直连.mjs`

```
skills/ctbz/scripts/preflight.mjs:55:function baseMatches(base, hints) {
skills/ctbz/scripts/preflight.mjs-56-  return hints.some((h) => base === h || base.startsWith(h + "/"));
skills/ctbz/scripts/preflight.mjs-57-}
skills/ctbz/scripts/preflight.mjs-58-
--
skills/ctbz/scripts/反审直连.mjs:79:function baseMatches(base, hints) {
skills/ctbz/scripts/反审直连.mjs-80-  return hints.some((h) => base === h || base.startsWith(h + "/"));
skills/ctbz/scripts/反审直连.mjs-81-}
skills/ctbz/scripts/反审直连.mjs-82-
```

命令: `grep -n "PROVIDER_BASE_HINTS = {" -A 4 skills/ctbz/scripts/preflight.mjs skills/ctbz/scripts/反审直连.mjs`

```
skills/ctbz/scripts/preflight.mjs:44:const PROVIDER_BASE_HINTS = {
skills/ctbz/scripts/preflight.mjs-45-  "deepseek-official": ["https://api.deepseek.com"],
skills/ctbz/scripts/preflight.mjs-46-  workbuddy: ["http://101.133.151.121:18890/v1", "http://127.0.0.1:7864/v1"],
skills/ctbz/scripts/preflight.mjs-47-};
skills/ctbz/scripts/preflight.mjs-48-
--
skills/ctbz/scripts/反审直连.mjs:68:const PROVIDER_BASE_HINTS = {
skills/ctbz/scripts/反审直连.mjs-69-  "deepseek-official": ["https://api.deepseek.com"],
skills/ctbz/scripts/反审直连.mjs-70-  workbuddy: ["http://101.133.151.121:18890/v1", "http://127.0.0.1:7864/v1"],
skills/ctbz/scripts/反审直连.mjs-71-};
skills/ctbz/scripts/反审直连.mjs-72-
```

命令: `grep -n "endpoint = args.overrides\|const camps = keys.map\|reasoning-effort\|--attach" skills/ctbz/scripts/preflight.mjs skills/ctbz/scripts/反审直连.mjs`

```
skills/ctbz/scripts/preflight.mjs:259:    const endpoint = args.overrides[m.code] ?? creds[m.provider].base ?? m.base;
skills/ctbz/scripts/反审直连.mjs:325:    else if (t === "--attach") a.attach.push(argv[++i]);
skills/ctbz/scripts/反审直连.mjs:333:    else if (t === "--reasoning-effort") {
skills/ctbz/scripts/反审直连.mjs:336:        if (!m) { console.error("--reasoning-effort 需 <camp>=off|low|medium|high 形式，多组用逗号分隔"); a.badArg = true; return a; }
skills/ctbz/scripts/反审直连.mjs:365:  --reasoning-effort <camp>=<级>     覆盖某阵营推理档（off|low|medium|high；网关对长推理会中断流时用 off）
skills/ctbz/scripts/反审直连.mjs:366:  --attach <路径>      追加内联附件（可重复）：取证文件/内审记录等，供席位核验计划中的证据锚点
skills/ctbz/scripts/反审直连.mjs:400:  const camps = keys.map((k) => CAMPS[k]).map((c) => {
```

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

命令: `grep -n "^test(" tests/凭据定位.test.mjs`

```
30:test('本机网关前缀（127.0.0.1:7864）命中凭据，不再报凭据缺失', () => {
36:test('旧通道前缀（101.133.151.121:18890）向后兼容', () => {
41:test('无关前缀仍判凭据缺失（负例）', () => {
47:test('后缀伪装前缀不命中（白名单封闭，负例）', () => {
52:test('baseURL 为空按凭据缺失处理，不抛异常（边界）', () => {
58:test('多前缀同时命中时按配置枚举序取首条（确定性）', () => {
70:test('反审直连 dry-run 取宿主配置命中的端点，不写死地址', () => {
```

## §12 T1 改动全集统计（diff 行数）

命令: `git add -N tests/凭据定位.test.mjs && git diff -- skills/ctbz/scripts tests/凭据定位.test.mjs > docs/取证/ctbz-2.1.1-T1.diff && wc -l < docs/取证/ctbz-2.1.1-T1.diff`

```
diff 总行数:      374
新增行数: 181
删除行数: 38
涉及文件数: 4
```
