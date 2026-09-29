# ctbz 2.1.3 —— 同源席降级（DeepSeek 官方欠费时的第 4 席）

review_scale: 轻

workspace: /Users/master/CODEX/草台班子/源码

取证文件: docs/取证/ctbz-2.1.3-席位降级.md

## 前言

用户原话：「草台班子 初始化」→ 进入 zcode 目录改造任务时，需按 ctbz 协议做四阵营反审。DeepSeek 官方两个渠道（Deepseek-ML / Deepseek-JN）同时欠费（HTTP 402，取证 §1），四路反审整批失败——第 4 席取不到凭据。该席本就不计独立性（与主进程同源），故允许其降级到 WB 网关提供的 DeepSeek 模型（取证 §2 实测可用），官方渠道可用时仍优先官方。

```
定级依据：单点——反审直连的席位表加 fallback 字段 + 调用路径按 fallback 重试一次；派发闸席位表放行「声明过的备选 provider×model」组合。
不改主文、不注册模型、不下调任何闸门门槛；备选组合是白名单（未声明的 provider 组合仍判红）。
轻级下限 ≥3 席、≥3 阵营；四席本轮可用（DeepSeek 走降级）。
```

## 现场核对

| 断言 | 锚点 | 出处（相对 workspace） |
|---|---|---|
| DeepSeek 官方两渠道四个模型组合全部 402 | ↗A | 取证 §1 |
| WB 网关提供 deepseek-v4.1-flash 并返回 200 | ↗B | 取证 §2 |
| 改动前席位表与 CAMPS 的原始定义 | ↗C | 取证 §3 |
| 降级回归 5 例通过 | ↗D | 取证 §5（含 5 例清单） |
| 全量测试 135 例全绿 | ↗E | 取证 §5 |

## 任务契约

```
T1 同源席降级（write-set）
  单一真源：skills/ctbz/scripts/lib/反审席位表.mjs（新增）
    导出 CAMPS（席位主渠道 + fallback 声明）、CAMP_ORDER、SEAT_TABLE（含历史兼容值与 altProviders）、
    allowedModelsFor(camp, provider)（未声明即空集，fail-closed）、seatAttempts(camp)（官方在前、备选在后、最多两条）。
  改动：
    skills/ctbz/scripts/反审直连.mjs —— 删除内联 CAMPS，改 import 共享表；runOne 按 seatAttempts 依次尝试，
      成功即落回执（provider/model 写实际使用的那一组）；双渠道均不可用时 fail 并在 detail 明示「已尝试降级到 <备选>」。
    skills/ctbz/scripts/派发闸.mjs —— 删除内联 SEAT_TABLE，改 import 共享表；validate 用 allowedModelsFor 收口白名单。
    skills/ctbz/dependencies.lock.json —— verifyBundle 逐文件校验 sha，新增/改动后必须重算。
  新增：tests/席位降级.test.mjs（5 例，零网络零计费）
    1) 官方凭据缺失时进入降级路径且不触及官方端点；2) 尝试序列由席位表封顶（恰好两条，无备选的席位只有一条）；
    3) 双渠道都不可用 → exit 1 且 detail 明示降级已尝试；4) 闸门放行声明过的备选组合、未声明的组合判红；5) 官方可用时优先官方（顺序可核验）。
  失败级联（评审要求显式定义）：
    官方失败 → 备选恰一次 → 仍失败则该席记 fail；轻级下限 ≥3 席且 ≥3 阵营，故单席失败不阻断闸门，
    但若可用席不足 3 或不足 3 阵营，闸门按既有规则判红并给出补齐命令（不改门槛）。
  官方回正：官方渠道成功即用官方，不需要人工切换——seatAttempts 每次调用重新求值，无缓存、无状态。
  验收：node --test tests/*.test.mjs 全绿（135 例）
        node skills/ctbz/scripts/反审直连.mjs --plan docs/取证/ctbz-2.1.3-计划.md --workspace . --camps deepseek --json → 回执 provider 落实际渠道
        node skills/ctbz/scripts/派发闸.mjs --plan docs/取证/ctbz-2.1.3-计划.md --workspace . --level l1 → ok:true、四席
  回滚：git revert <本批 commit>；回执目录 .ctbz-record/反审/ctbz-2.1.3-计划/ 一并删除
```

## 反审重点（供席位）

```
1. 降级是否削弱独立性保证（DeepSeek 席本就同源；另三席是否仍为独立阵营）。
2. 白名单收口是否严：未声明的 provider×model 组合必须仍判红。
3. 官方渠道恢复后是否自动回到官方（优先级而非替换）。
```

## 行动账

| 编号 | 动作 | 依据 | 取舍 | 证伪 |
|---|---|---|---|---|
| A1 | deepseek 席声明 fallback 到 workbuddy/deepseek-v4.1-flash | 命令: node skills/ctbz/scripts/反审直连.mjs --plan docs/取证/ctbz-2.1.3-计划.md --workspace . --camps deepseek --json | 否掉「四路降为三路」——独立性不损失，但会永久少一路同源采样 | 命令退出码 exit 0（status=ok） |
| A2 | 席位表抽成单一真源 lib/反审席位表.mjs，闸门按白名单放行 | 命令: node --test tests/席位降级.test.mjs | 否掉「两文件各写一份白名单」——runner 与闸门会漂移，且不存在可交付的失败级联定义 | node --test tests/席位降级.test.mjs → pass 5 |
| A3 | 保留官方渠道优先级，仅在失败后重试备选且恰好一次 | tests/席位降级.test.mjs:46（尝试序列由席位表封顶） | 否掉「直接改用网关」——官方恢复后应自动回正；否掉无限重试——失败级联必须收敛 | node --test tests/席位降级.test.mjs → pass 5 |

## 验收

- 本轮修复：全量测试 135 例全绿；四席回执齐（DeepSeek 走降级）。
- 未做（明示）：tag / push / Release 未执行（对外发布留待用户口令）。
