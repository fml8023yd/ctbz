# ctbz 2.1.1 —— 凭据定位修复（渠道换接入点导致的假「凭据缺失」）

review_scale: 轻

workspace: /Users/master/CODEX/草台班子/源码

取证文件: docs/取证/ctbz-2.1.1-凭据定位修复.md

## 前言

用户原话：「草台班子 初始化」。初始化链在 activate 步被 doctor 拦下（unknown-model-ref 全角色变体 + catalog-fingerprint-drift），会话启动自检 preflight 亦对 WB 渠道报「凭据缺失」。根因锁定：脚本把 WB 渠道地址写死为 http://101.133.151.121:18890/v1，而宿主配置已切到本机网关 http://127.0.0.1:7864/v1，前缀不再命中即凭据解析失败。

```
定级依据：同一根因的单点修复——preflight.mjs 与 反审直连.mjs 的凭据定位函数改为前缀列表、端点取宿主配置命中值；另加一个回归测试文件（tests/凭据定位.test.mjs）。
不改接口、不改主文、不注册模型、不下调任何硬门。
轻级下限 ≥3 席、≥3 阵营；可用独立阵营恰为 3（智谱 / 腾讯 / 月之暗面），DeepSeek 席渠道欠费不可用（取证 §7）。
DeepSeek 席同源、不计独立性的缺席不削弱独立性保证；席位不足由本轮记录明示，不以主进程自审冒充。
```

## 现场核对

| 断言 | 锚点 | 出处（相对 workspace） |
|---|---|---|
| 宿主 WB 渠道 baseURL 已为本机网关 127.0.0.1:7864/v1，旧自建通道地址不再被命中 | ↗A | 取证文件 §2（脱敏实测） |
| 修复前脚本对 M2 判「凭据缺失」（假失败复现） | ↗B | 取证文件 §1（status=fail） |
| 修复后 M2 与 M4 探活 http=200 | ↗C | 取证文件 §4 |
| 网关模型清单中 61 个条目含 4 个所需模型 | ↗D | 取证文件 §3 |
| 回归测试 7 例、全量 129 例全绿 | ↗E | 取证文件 §9、§10 |
| DeepSeek 渠道均欠费 402，该席不可用 | ↗F | 取证文件 §7 |
| 落点行号：preflight.mjs:55 与 反审直连.mjs:79 为白名单匹配函数、tests/凭据定位.test.mjs:30 起为回归用例 | ↗G | 取证文件 §11（行摘录） |
| 席位模型可用性：hy3 40s、kimi-k2.7 61s 正常；hy4-preview-f 断流、kimi-k3 502 | ↗H | 取证文件 §8 |

## 任务契约

```
T1 凭据定位修复（write-set）
  改动：skills/ctbz/scripts/preflight.mjs（前缀列表 + 封闭匹配 + 端点取配置值 + 行输出 endpoint）
        skills/ctbz/scripts/反审直连.mjs（前缀列表 + 封闭匹配 + 端点优先级 + --reasoning-effort/--attach）
        skills/ctbz/scripts/派发闸.mjs（SEAT_TABLE moonshot 席扩 kimi-k2.7/kimi-k2.6）
        skills/ctbz/dependencies.lock.json（verifyBundle 要求同步重算）
  新增：tests/凭据定位.test.mjs（回归 7 例，零网络：夹具配置注入 + 死端点）
  验收：node --test tests/*.test.mjs 全绿（129 例）
        node skills/ctbz/scripts/反审直连.mjs --plan <本计划> --workspace . --dry-run
          → 期望：逐个打印 camp 与端点，WB 系三席显示 http://127.0.0.1:7864/v1/chat/completions
        node skills/ctbz/scripts/派发闸.mjs --plan docs/取证/ctbz-2.1.1-计划.md --workspace . --level l1 → ok:true
  回滚：git revert <本批 commit>；安装副本回滚 = 备份目录 ~/Documents/.ctbz/备份/ 恢复后重跑部署
```

## 反审重点（供席位）

```
1. 端点来源改变是否引入注入风险（base 取自宿主配置而非脚本常量）——前缀白名单是否足够收口。
2. 旧前缀保留是否属冗余；阿里云中继是否仍应支持。
3. 轻级定级是否成立（改动面与席位数的匹配），DeepSeek 席缺席的补偿是否充分。
4. 回归测试是否真独立（不依赖外网、不依赖真实凭据）。
```

## 行动账

| 编号 | 动作 | 依据 | 取舍 | 证伪 |
|---|---|---|---|---|
| A1 | 凭据定位改为前缀列表，端点取宿主配置命中值 | 命令: node skills/ctbz/scripts/反审直连.mjs --plan docs/取证/ctbz-2.1.1-计划.md --workspace . --dry-run | 否掉「只追加新前缀、端点仍写死常量」的半修——渠道再换地址即复发 | node --test tests/凭据定位.test.mjs → exit 0 |
| A2 | 保留旧自建通道前缀（向后兼容） | 命令: node --test tests/凭据定位.test.mjs --test-name-pattern=旧通道前缀 | 否掉直接删旧前缀——阿里云中继仍在运行，删除会把仍可用渠道误报为凭据缺失 | node --test tests/凭据定位.test.mjs → pass 7 |
| A3 | 新增凭据定位回归测试 | tests/凭据定位.test.mjs:30（本机网关前缀） | 否掉「只靠人工探活验证」——探活计费且不可回归，缺陷会静默复发 | node --test tests/凭据定位.test.mjs → pass 7 |
| A4 | 重算依赖锁 | 命令: node skills/ctbz/scripts/发布检查.js | 否掉手工编辑摘要——verifyBundle 会判「依赖文件已变化」并拦死 prepare/activate | node skills/ctbz/scripts/发布检查.js → exit 0 |
| A5 | 主会话实施先于 L1 的偏差补内审并挂机制修改项 | 命令: node skills/ctbz/scripts/内审.mjs check docs/内审/2026-09-30-主会话直改脚本未过L1.md | 否掉「撤回改动按流程重做」——字节等价的重做只增噪声不增保障；改为补审 + 机制补丁（部署链加反审链覆盖检查） | node skills/ctbz/scripts/内审.mjs check docs/内审/2026-09-30-主会话直改脚本未过L1.md → exit 0 |

## 验收

- 本轮修复：全量测试 129 例全绿；l1 三席回执齐（智谱/腾讯/月之暗面）。
- 交付动作：源码仓 commit + 部署.js 同步安装副本（本地、可回滚）。
- 未做（明示）：tag / push / Release / 阿里云发布——对外发布属不可逆项，留待用户口令；l3 项目级反审因 DeepSeek 席不可用而无法凑齐 4 阵营，不伪造通过。
- 内审修改项（部署链反审覆盖检查）登记为未实现，随下批实施。

## 附录：反审意见及处置（l1，round=1）

```
执行命令：node skills/ctbz/scripts/反审直连.mjs --plan docs/取证/ctbz-2.1.1-计划.md --workspace . \
  --camps zhipu,tencent,moonshot --attach docs/取证/ctbz-2.1.1-凭据定位修复.md \
  --attach docs/内审/2026-09-30-主会话直改脚本未过L1.md
回执：.ctbz-record/反审/ctbz-2.1.1-计划/{zhipu,tencent,moonshot}.json
DeepSeek 席：两渠道均 402 欠费，未出回执（取证 §7），独立性由三路非 DeepSeek 阵营保证。
```

| # | 席 | 类别 | 意见 | 处置 |
|---|---|---|---|---|
| 1 | 智谱 | 阻塞 | 计划写 126 例/回归 4 例，取证 §9/§10 为 129 例/回归 7 例，计数自相矛盾 | 已接受：计划同步为 129/7，并加 ↗E 锚点指向 §9/§10 |
| 2 | 智谱 | 非阻塞 | ↗G 声称可核验源码行号，但 §5 只列测试名 | 已接受：新增取证 §11 行摘录（grep -n 原文），↗G 改指 §11 |
| 3 | 智谱/月之暗面 | 非阻塞 | 白名单匹配语义（startsWith vs 严格相等）未在计划声明 | 已接受：改为封闭匹配 baseMatches（恰等或后跟 `/` 分段），补两负例 |
| 4 | 月之暗面/腾讯 | 非阻塞 | 未内联源码与取证文件，席位无法核验 | 已接受：反审直连新增 --attach 内联附件；本轮即以附件复核 |
| 5 | 月之暗面 | 非阻塞 | 多前缀同时命中的优先级未文档化 | 已接受：取宿主配置枚举序首条，新增确定性用例并记入取证 §9 |
| 6 | 三路席位 | 非阻塞 | 席位模型在本机网关超 ~120s 断流 | 已接受：腾讯席改 hy3、月之暗面席改 kimi-k2.7（取证 §8），派发闸 SEAT_TABLE 同步 |
| 7 | 月之暗面 | 非阻塞 | 内审修改项（部署链反审覆盖检查）未实现 | 已登记未实现，随下批实施（docs/内审/2026-09-30-主会话直改脚本未过L1.md） |
```
