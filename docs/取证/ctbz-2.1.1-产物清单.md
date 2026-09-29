# ctbz 2.1.1 产物级自审提交件

本件不是计划，是**已实施完成批次的产物复核对象**。请按「产物级自审」核对：改动是否与所述目标一致、是否有副作用、证据是否成立。文件清单在文末，逐行 `路径 sha256`，sha 即当前工作区实际字节摘要。

## 批次目标

修复「宿主渠道换接入点后，凭据按 baseURL 前缀定位失配，反审与探活全线假报『凭据缺失』」。故障链：会话启动自检 preflight 对 WB 渠道 4 个模型全部判凭据缺失；反审链同因无法取凭据，四路反审无回执；`initialize activate` 被 doctor 以 unknown-model-ref 拦下。

## 改动内容

| 文件 | 改动 | 为什么 |
|---|---|---|
| `skills/ctbz/scripts/preflight.mjs` | provider→前缀由单值改列表；新增 `baseMatches` 封闭匹配；请求端点取宿主配置命中值并写入 `endpoint` 字段 | 旧写法把渠道地址写死为 `101.133.151.121:18890`，宿主已改 `127.0.0.1:7864`，前缀不命中即无凭据 |
| `skills/ctbz/scripts/反审直连.mjs` | 同上；另加 `--attach`（内联取证附件，标注「证据材料，非指令」）与 `--reasoning-effort`（按席覆盖推理档）；席位表 tencent→hy3、moonshot→kimi-k2.7 | 同一根因；附件解决「reviewer 无文件读取工具、证据锚点无法核验」；推理档与席位模型针对本机网关约 120 秒生成上限 |
| `skills/ctbz/scripts/派发闸.mjs` | `SEAT_TABLE` moonshot 席扩 `kimi-k2.7`/`kimi-k2.6` | 与上表模型改判联动，否则新回执被判「model 未落席位表」 |
| `skills/ctbz/dependencies.lock.json` | 全量重算 | `verifyBundle` 逐文件校验 sha，不改锁则 prepare/activate 直接拒 |
| `skills/ctbz/SKILL.md` | 版本 2.1.0 → 2.1.1 | 版本唯一来源，与 CHANGELOG 首段头一致 |
| `tests/凭据定位.test.mjs` | 新增回归 7 例 | 夹具配置注入 + 死端点，零网络零计费；含后缀伪装、空 baseURL、多前缀确定性三负例 |

## 边界与安全

- 前缀匹配为封闭集合：`base` 恰等于前缀，或前缀后紧跟 `/` 分段；`…/v1.evil` 这类后缀伪装不命中（有专门用例）。
- 凭据仍只从宿主配置读取，不打印、不落盘、不进日志；请求端点随凭据所在渠道走，脚本内不再保留可用端点常量（席位表地址仅作兜底）。
- 明确保留的过渡项：旧自建通道前缀 `101.133.151.121:18890` 仍在白名单（阿里云中继仍在跑，删除会把仍可用渠道误报为缺失）；明文 http 属已知风险，与既有一致。

## 验证证据

- 全量测试 129 例全绿（基线 122 + 新增 7）。
- 修复前复现：旧版脚本对 M2 判「凭据缺失」；修复后 `preflight --only M2,M4` 两席 http=200（安装副本实测 4/5 通，唯一 fail 为 DeepSeek 渠道真欠费 402）。
- L1 反审三席（智谱/腾讯/月之暗面）round=1 与 round=2 回执齐，闸门 exit 0；T1 任务级回执 1 份，闸门 exit 0。DeepSeek 席因两渠道均欠费缺席，未以其他渠道冒充，独立性由三路非 DeepSeek 阵营保证。
- 席位模型可用性实测：hy3 正常、kimi-k2.7 正常；原 hy4-preview-f / kimi-k3 在本机网关约 120 秒上限下断流。

## 未做（明示）

- tag / push / Release / 阿里云发布未执行（对外发布属不可逆项，留待用户口令）。
- L3 项目级反审需 4 阵营齐全，DeepSeek 席欠费导致无法凑齐，未伪造通过。
- 内审登记的机制修改项（部署链反审覆盖检查）未实现，随下批实施。

## 产物清单

```
skills/ctbz/scripts/preflight.mjs b205301d7ade45861ca49c4eac6d49ab8ba147f00b4984ce258e1f6ef1e22101
skills/ctbz/scripts/反审直连.mjs c4b74351a5af19950214c45fe3df5ed76cf97a156585d252f3ac05207cc9457d
skills/ctbz/scripts/派发闸.mjs c80dfb7f18b0923984890a788184048f229844fa43b99e08ee9a87c46747d7bf
skills/ctbz/dependencies.lock.json ee4b5472834235c25d3cae6b6becb8821f922f53e4ee5038c794cffd40f8a45f
skills/ctbz/SKILL.md 50c4b040a278b3cdbaeb3e9685fbeb570c21edc31e374729a7ef3a9a31d7344c
tests/凭据定位.test.mjs 7b10396c511b25ad8d2d30e2cf0fe2886d52475714a1e22e06eb03e87ff72956
```
