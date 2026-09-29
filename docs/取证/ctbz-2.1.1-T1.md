# ctbz 2.1.1 T1 任务复核件 —— 凭据定位修复（实施完成，待任务级反审）

review_scale: 轻

workspace: /Users/master/CODEX/草台班子/源码

取证文件: docs/取证/ctbz-2.1.1-凭据定位修复.md

## 范围

T1 = 修复「渠道换接入点导致的假凭据缺失」，并同步派发链席位模型。实施已完成，本件供未参与实现的阵营做任务级复核。

## 现场核对

| 断言 | 锚点 | 出处 |
|---|---|---|
| 修复后探活 M2 与 M4 http=200 | ↗C | 取证 §4 |
| 回归测试 7 例全绿 | ↗E | 取证 §9 |
| 全量测试 129 例全绿 | ↗I | 取证 §10 |
| 白名单匹配函数落点 preflight.mjs:55 与 反审直连.mjs:79 | ↗G | 取证 §11 |
| 席位模型可用性实测（hy3 与 kimi-k2.7 正常） | ↗H | 取证 §8 |
| 改动全集：diff 统计见取证第 12 节 | ↗J | 取证 §12（统计与 diff 文件 docs/取证/ctbz-2.1.1-T1.diff） |

## 交付物

```
skills/ctbz/scripts/preflight.mjs      凭据前缀列表 + 封闭匹配 + 端点随配置
skills/ctbz/scripts/反审直连.mjs        同上 + --reasoning-effort + --attach + 席位模型改判
skills/ctbz/scripts/派发闸.mjs         SEAT_TABLE moonshot 席扩 kimi-k2.7 与 kimi-k2.6
skills/ctbz/dependencies.lock.json     verifyBundle 锁重算
tests/凭据定位.test.mjs                回归 7 例（含后缀伪装与空值两负例）
```

## 行动账

| 编号 | 动作 | 依据 | 取舍 | 证伪 |
|---|---|---|---|---|
| A1 | 凭据定位改前缀列表且端点取配置命中值 | 命令: node --test tests/凭据定位.test.mjs | 否掉「只加新前缀、端点仍写死」的半修——渠道再变即复发 | node --test tests/凭据定位.test.mjs → pass 7 |
| A2 | 匹配改封闭式（恰等或后跟斜杠） | 命令: node --test tests/凭据定位.test.mjs | 否掉裸 startsWith——「v1.evil」后缀伪装可通过 | node --test tests/凭据定位.test.mjs → pass 7 |
| A3 | 腾讯席换 hy3、月之暗面席换 kimi-k2.7 | 命令: node skills/ctbz/scripts/反审直连.mjs --plan docs/取证/ctbz-2.1.1-计划.md --workspace . --camps tencent,moonshot --json | 否掉维持原模型——约 120 秒网关上限下长推理必断流，反审无法出回执 | 命令退出码 exit 0（见 ↗H） |

## 复核要求（供席位）

```
1. 对照 docs/取证/ctbz-2.1.1-T1.diff 检查改动是否与「回归测试 7 例」及取证数字自洽；
2. 检查 --attach 内联附件是否会放大 prompt 注入面（附件内容被当作指令执行的风险）；
3. 检查席位模型改判（hy3 / kimi-k2.7）是否属同厂商降档而非跨阵营替代。
```
