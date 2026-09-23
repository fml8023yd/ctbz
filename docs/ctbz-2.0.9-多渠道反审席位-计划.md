# ctbz 2.0.9 多渠道反审席位 · 实施计划

review_scale: 重
review_level: l1
计划正文版本: r5（2026-09-22，L1 第四轮回修后）

| 键 | 值 |
|---|---|
| 源码根 / ws | `/Users/maolong/Betty/草台班子/ctbz-dsh` |
| 版本 | `2.0.8` → `2.0.9` |
| 来源 | TD-17（已裁决选项 a）+ TD-16（WB 渠道实测） |
| 用户口径 | 「先把多渠道反审协议上线，我接下来的开发要用上」 |
| 定级 | **重**（改主文 + 改脚本行为；席位数 8 = 4 阵营 × 双轮） |

### 0 修订记录（L1 第一轮 sha `3ae0ea23…` 4 份回执 → r2 处置）

| # | r1 阻塞项 | 出处 | r2 处置 |
|---|---|---|---|
| R1 | **同步清单不闭合**：全仓 `deepseek-v4-pro` 命中 **35 处**，§2 只列 6 处，漏 `SKILL.md:399`（错误理由本体）、`反审协议.md:25/83/91/96`、`派发.md:63/71/122`、`cost-rules.json:39/50/104`、`pick-profile` 8 处、`tests/dsh-regression.test.mjs:50/59/60/111`、`tests/派发闸.test.mjs:20/200/208/211`、`tests/README.md:49/51` | 4 席一致（阻塞） | §2 改为 **逐处改动点全表**（§2.1 口径点 20 处 + §2.2 测试点 8 处），每处给行号与逐字新值；§3 write-set 补齐 |
| R2 | **架构冲突**：`派发闸.mjs:29` `DEFAULT_HOST_MODEL="deepseek-flash"` 与席位表新值相同 → `SEAT_MODELS.has(hostModel)` 命中 → **默认运行必 exit 2** | tencent / deepseek（阻塞） | §2.1 新增改点：`SEAT_TABLE.deepseek.models` 改 `["deepseek-flash","deepseek-v4-pro"]`（v4-pro 标注历史兼容）；新增 `SAME_SOURCE_MODELS` 常量，`--host-model` 硬闸改为「不得取**非豁免**席位模型」；`model != hostModel` 软校验对 deepseek 席**跳过**，其余三席保留 |
| R3 | **同源事实无机器判据**：改完后同模型校验对该席不成立，但对外仍无标注 | deepseek（阻塞） | §2.1 改点：`review` 块增加 `"independence":"3 independent + 1 same-source"`；回执允许可选 `same_source: true`（deepseek 席）；`派发闸` 通过时打印该行 |
| R4 | **重级席位数自相矛盾**：§4 写「4 份回执 exit 0」，§5 写「重 = 8 席」 | deepseek（阻塞） | §4 步 3 改「**8 份**（4 席 round=1 + 4 席 round=2）」；§5 同步 |
| R5 | **历史目录会被新白名单判不合格** | tencent（阻塞） | §7 明写三选一取 (a)：白名单并列接受 `deepseek-v4-pro` 为历史兼容值 → 历史目录 2.0.6/2.0.7/2.0.8 不重跑也不受影响；V6 显式声明「不对历史目录执行闸门」 |
| R6 | **V2 断言落点与 write-set 不一致**；`tests/主文锚点.test.mjs` 不读 `references/反审协议.md` | tencent / deepseek / zhipu（阻塞） | §2.3 给出测试冻结文本：口径断言落 `tests/dsh-regression.test.mjs`（脚本侧）+ `tests/主文锚点.test.mjs`（主文侧，含新增对 `references/反审协议.md` 的读取）；两文件均入 write-set |
| R7 | **`pick-profile` 8 处、`cost-rules.json` 4 处未给新值** | zhipu / deepseek（阻塞） | §2.1 逐处列出（含 `cost-rules.json:39` 历史 change 段**不改史实**，追加 `r2026-09-22` 更正注记） |
| R8 | 缺「风险」节：独立性由 4 降为 3、3/4 席共用 WB 网关单点、`deepseek-official` 单点同时影响主进程与该席、`hy3` 冷却兜底未定 | tencent / deepseek（阻塞） | 新增 §8 风险表 |
| R9 | 「三份 references」未具名（第三份不存在） | deepseek（阻塞） | §2 改为具名两份（`反审协议.md`、`派发.md`）；`unified-workflow.md` 实测不含 provider/model 字面量，明确不动 |
| R10 | 循环论证：用未上线的新席位审本计划 | zhipu（条件） | 运行事实：本轮 L1 已用新四席跑通（`hy4-preview-f` / `deepseek-flash` / `kimi-k2.8-preview` / `glm-5.3-flash`，4/4 回执），作为「多渠道席位可用」的**独立证据**；回执中 DeepSeek 席在 `summary` 已注明同源 |

### 0.1 L1 第三轮（r3，sha `9e3f266e…`）→ r4 处置

| # | r3 阻塞项 | 出处 | r4 处置 |
|---|---|---|---|
| R11 | V1 残留四类漏 `tests/execution-chain-acceptance.md`（历史产物）与 `SKILL.md:399` 渠道事实句 | tencent / deepseek（阻塞） | V1 补第 ⑤⑥ 类，并把 grep 命令固定为带 `grep -v execution-chain-acceptance.md` 的显式形式 |
| R12 | §2.2 第 26 项未处置 `tests/派发闸.test.mjs:211` 循环里的 `deepseek-v4-pro` | tencent（阻塞） | 第 26 项补「删除该值，移入 exit 0 组」 |
| R13 | §2.2 第 28 项未给常量区与断言代码 | tencent（阻塞） | 第 28 项补逐字代码块（常量 + 三条断言） |

**实证（本轮取到）**：现网 2.0.8 闸门对新回执的直接判词——`✗ deepseek.json: 同模型自审：model 与 --host-model 逐字相等（deepseek-flash）；model 未落席位表："deepseek-flash"（deepseek 允许 deepseek-v4-pro）`，同时 `阵营覆盖 3 个，重级需 4 阵营齐全`。这两条即 V5 的**改前状态**，改后必须转 exit 0。

---

## 1 需求诊断

| 项 | 内容 |
|---|---|
| 原始表述 | 用户：「你先把多渠道反审协议上线，我接下来的开发要用上」；前轮已定「四路 = hy4f 或 hy3 + dsv4 自身 + kimi k2.8 + glm 5.3 flash，每家至少一个模型」 |
| 真实问题 | 现网 2.0.8 把 DeepSeek 席定为 `deepseek-official/deepseek-v4-pro`，**理由写「避免与主进程同源」是错的**（v4-pro 底层路由到 flash）；对外仍宣称「四路独立反审」 |
| 目标结果 | ①四路席位跨渠道落值（每家厂商一个模型）②声明改「**三路独立 + 一路同源**」③全仓 35 处口径同步、测试不红 ④端到端可跑 |
| 非目标 | 不扩到 WB 全池 42 个模型（TD-16 保留）；不改四扇门；不改硬门行；不动历史计划与历史回执 |
| 成功证据 | V1–V7（§6） |
| 意图置信度 | 高 |

## 2 逐处改动点（实施者按行号誊写）

### 2.1 口径同步点（20 处）

| # | 文件:行 | 现状关键串 | 改为 |
|---|---|---|---|
| 1 | `SKILL.md:399` | 「反审席位用 M1 时取 `deepseek-v4-pro`（避免主进程自审同模型）」 | 「反审席位用 M1 时取 `deepseek-flash`（**与主进程同源，仅提供独立上下文与采样，不计模型独立性**；独立性由腾讯/月之暗面/智谱三路保证）」 |
| 2 | `SKILL.md:422` | 「**四路反审**：…4 阵营并行独立反审」 | 「**四路反审（三路独立 + 一路同源）**：…四路并行…DeepSeek 席与主进程同源，不计独立性」 |
| 3 | `反审协议.md:25` | 「反审席位 DeepSeek 一律取 `deepseek-v4-pro`（避开主进程 `deepseek-flash` 同模型自审，见 §3）」 | 「反审席位 DeepSeek 取 `deepseek-flash`：**与主进程同源，仅提供独立上下文与采样，不计模型独立性**（用户裁定 2026-09-22，见 §3）」 |
| 4 | `反审协议.md:83` | 表行 `\| DeepSeek \| deepseek-official \| **deepseek-v4-pro** \|` | `\| DeepSeek \| deepseek-official \| deepseek-flash（同源，不计独立性） \|` |
| 5 | `反审协议.md:91` | 范例 `model: "deepseek-v4-pro"` | `model: "deepseek-flash"` |
| 6 | `反审协议.md:96` | 锚点行含 `deepseek-v4-pro` | 锚点改 `deepseek-flash` |
| 7 | `派发.md:63` | 「反审席位用 DeepSeek 阵营时取 `deepseek-v4-pro`（避免与主进程 `deepseek-flash` 同模型自审）」 | 「反审席位用 DeepSeek 阵营时取 `deepseek-flash`（**同源，不计模型独立性**）」 |
| 8 | `派发.md:71` | 「`--role reviewer` 时 DeepSeek 席位自动换 `deepseek-v4-pro`」 | 「`--role reviewer` 时 DeepSeek 席位取 `deepseek-flash`（同源）」 |
| 9 | `派发.md:122` | 范例 `model: "deepseek-v4-pro"` | `model: "deepseek-flash"` |
| 10 | `反审.mjs:11` | 头注释「一律 deepseek-v4-pro（避免…同模型自审）」 | §0 R3 的逐字新注释块（含「三路独立 + 一路同源」） |
| 11 | `反审.mjs:30` | 「反审席位 DeepSeek 取 deepseek-v4-pro」 | 「反审席位 DeepSeek 取 deepseek-flash（同源，不计独立性）」 |
| 12 | `反审.mjs:32` | `model: "deepseek-v4-pro"` | `model: "deepseek-flash"` |
| 13 | `反审.mjs:108` | 骨架注释「一律 deepseek-v4-pro」 | 「DeepSeek 席 deepseek-flash（同源，不计独立性）」 |
| 14 | `派发闸.mjs:37` | `deepseek: { provider: "deepseek-official", models: ["deepseek-v4-pro"] }` | `deepseek: { provider: "deepseek-official", models: ["deepseek-flash", "deepseek-v4-pro"] }`（v4-pro 为历史兼容值，注释标明） |
| 15 | `派发闸.mjs:29+446` | `DEFAULT_HOST_MODEL="deepseek-flash"` + `SEAT_MODELS.has(hostModel) → exit 2` | 新增 `const SAME_SOURCE_MODELS = new Set(["deepseek-flash", "deepseek-v4-pro"]);`，硬闸改 `SEAT_MODELS.has(hostModel) && !SAME_SOURCE_MODELS.has(hostModel)` → exit 2；注释改「DeepSeek 席同源已裁定接受」 |
| 16 | `派发闸.mjs:214` 同模型软校验 | `if (d.model === ctx.hostModel) bad(...)` | 改为 `if (d.camp !== "deepseek" && d.model === ctx.hostModel) bad(...)`（**按 camp 判定**，不按 model 判定）；其余三席保留 |
| 17 | `派发闸.mjs` review 块 | `{ok,review_scale,review_level,review_receipt,review_camps,plan_sha256,seats}` | 追加 `"independence":"3 independent + 1 same-source"` |
| 18 | `pick-profile:5/22/46/100/142/170/194/207` | 8 处含 `deepseek-v4-pro` | `reaudit: "deepseek-flash"`；注释与 stderr/note/semantics 文案改为「DeepSeek 席与主进程同源，不计独立性」 |
| 19 | `cost-rules.json:50/104` | `reaudit_model: "deepseek-v4-pro"`；rule 写「用 deepseek-v4-pro 避免同模型自审」 | `"reaudit_model": "deepseek-flash"`；rule 改「反审席位 DeepSeek 取 deepseek-flash（同源，不计模型独立性）」 |
| 20 | `cost-rules.json:39` | history.change 段含「反审 DeepSeek 席位换 deepseek-v4-pro」 | **不改史实**，追加 `r2026-09-22` 更正注记：「v4-pro 底层路由至 flash，已丧失独立性；反审席位改 deepseek-flash 并明示同源」 |

### 2.2 测试与文档同步点（8 处）

| # | 文件:行 | 改为 |
|---|---|---|
| 21 | `tests/dsh-regression.test.mjs:50` | 用例名 `T3 选型器：反审席位 DeepSeek 取 deepseek-flash（同源）` |
| 22 | `tests/dsh-regression.test.mjs:59` | `assert.equal(m1.model, 'deepseek-flash')` |
| 23 | `tests/dsh-regression.test.mjs:60` | `assert.match(m1.note, /同源/)` |
| 24 | `tests/dsh-regression.test.mjs:111` | 骨架断言改 `includes('deepseek-flash')` 且 `!includes('deepseek-v4-pro')` |
| 25 | `tests/派发闸.test.mjs:20` | fixture 回执 deepseek 席 `model: 'deepseek-flash'` |
| 26 | `tests/派发闸.test.mjs:200/208/211` | **同时删除 `:211` 循环数组中的 `'deepseek-v4-pro'`**（该值移入 exit 0 组），其余四值 `glm-5.3-flash`/`hy4-preview-f`/`hy3`/`kimi-k2.8-preview` 保留在 exit 2 组。V3 用例改为四断言（逐条可跑）：①deepseek 席 `model=deepseek-flash` → exit 0；②deepseek 席 `model=deepseek-v4-pro`（历史兼容值）→ exit 0；③zhipu 席 `model=deepseek-flash`（camp≠deepseek 但同源模型）→ exit 1；④`--host-model glm-5.3-flash`（非豁免席位模型）→ exit 2；用例名改 `V3 同源豁免：deepseek 席放行、其余三席同源仍拒、--host-model 取非豁免席位模型 exit 2` |
| 27 | `tests/README.md:49/51` | T3/T7 描述改 `deepseek-flash`（同源，不计独立性） |
| 28 | `tests/主文锚点.test.mjs` | 常量区新增 `const REVIEW_PROTO = readFileSync(join(REPO, "skills/ctbz/references/反审协议.md"), "utf8");`（**常量名用现行 `REPO`**，见 `tests/主文锚点.test.mjs:11`；该文件无 `ROOT`）；新增用例 `V2 反审口径：主文含三路独立+一路同源、协议无裸 v4-pro`，断言三条：`assert.ok(SKILL.includes("三路独立 + 一路同源"))`；`assert.ok(!SKILL.includes("4 阵营并行独立反审"))`；`const bare = REVIEW_PROTO.split("\n").filter(l => l.includes("deepseek-v4-pro") && !/历史|legacy|更正|兼容/.test(l)); assert.deepEqual(bare, [])` |

**历史产物不动**（明确列出，避免实施者误改）：`docs/ctbz-2.0.6-派发闸与内审-计划.md`、`docs/ctbz-2.0.7-*`、`docs/ctbz-2.0.8-*`、`tests/execution-chain-acceptance.md`、`.ctbz-record/反审/**`（历史回执）。

## 3 任务契约

| 项 | 内容 |
|---|---|
| write-set | `skills/ctbz/SKILL.md`、`skills/ctbz/scripts/{反审.mjs,派发闸.mjs,pick-profile}`、`skills/ctbz/references/{反审协议.md,派发.md}`、`skills/ctbz/cost-rules.json`、`CHANGELOG.md`、`tests/{dsh-regression,派发闸,主文锚点}.test.mjs`、`tests/README.md` |
| 输入依赖 | §2 全表（逐处行号 + 新值） |
| 约束 | 逐字誊写；硬门行一字不改；不改 `~/.dsh/AGENTS.md` 两镜像块；`kimi-k2.8-preview` / `glm-5.3-flash` / `hy4-preview-f` / `hy3` 取值不动；不动 §2.2 尾列的历史产物 |
| 验收 | V1–V7（§6） |
| 发布 | commit → 部署（带 PATH）→ 重算仓库侧锁 → `diff -rq` exit 0 → push + tag `v2.0.9` → Release + 附件 → 阿里云 |

## 4 端到端验证

| 步 | 命令 | 期望 |
|---|---|---|
| 1 | `node skills/ctbz/scripts/pick-profile --kind discussion --role reviewer` | 四席新值，DeepSeek 席 = `deepseek-official/deepseek-flash` |
| 2 | `node skills/ctbz/scripts/反审.mjs --plan <本计划> --workspace $PWD --dry-run` | 骨架内四席与 §2.1 一致，不含 `deepseek-v4-pro` |
| 3 | 用新四席跑 L1 第二轮（重签） | **8 份**（4 席 round=1 已在本轮完成 + 4 席 round=2） |
| 4 | `派发闸 --level l1` | exit 0，输出含 `"independence":"3 independent + 1 same-source"` |

## 5 本计划自身的闸门

| 步骤 | 状态 |
|---|---|
| L1 第一轮（**新四席**） | 已完成，sha `3ae0ea23…`，4/4 回执，13 阻塞 |
| 回修 → r2 | 已完成（R1–R10） |
| L1 第二轮（重签） | 待跑，sha = r2 |
| 闸门 `--level l1` | 待跑（重 = 8 席 = 4 阵营 × 双轮） |

## 6 验收（V1–V7）

| # | 验收项 | 通过标准 | 证据 |
|---|---|---|---|
| V1 | 口径点全部同步 | §2.1 的 20 处全部落地；`grep -rn 'deepseek-v4-pro' skills/ tests/` 的**每一处残留必须落入下列四类之一**（超出即不合格）：①`派发闸.mjs` 历史兼容白名单与 `SAME_SOURCE_MODELS` 常量；②反向断言字面量（`tests/dsh-regression.test.mjs` / `tests/主文锚点.test.mjs` / `tests/派发闸.test.mjs` 的 `!includes(...)` 与负例）；③`tests/派发闸.test.mjs` 历史兼容值正例；④`cost-rules.json:39` 更正注记；⑤**历史产物**（`tests/execution-chain-acceptance.md`，§2.2 尾列已声明不动）；⑥`SKILL.md:399` 渠道事实句（「`deepseek-official` 仅 `deepseek-flash`/`deepseek-v4-pro`」——描述渠道能力，必须保留该字面量）。判据=逐条归类输出，不得只报总数；命令固定为 `grep -rn 'deepseek-v4-pro' skills/ tests/ | grep -v execution-chain-acceptance.md` |
| V2 | 测试点全部同步 | §2.2 的 8 处落地；`tests/主文锚点.test.mjs` 含「三路独立 + 一路同源」断言 | 测试用例 |
| V3 | 骨架口径正确 | `反审.mjs --dry-run` 含四席新值且不含 `deepseek-v4-pro` | 命令输出 |
| V4 | pick-profile 正确 | `--kind discussion --role reviewer` 四席新值 | 命令输出 |
| V5 | 闸门放行新席位且不误伤 | 新口径回执 `--level l1` exit 0；`--host-model deepseek-flash`（默认）不再 exit 2；`--host-model glm-5.3-flash` 仍 exit 2 | 命令 |
| V6 | 历史目录不受影响 | 对 `2.0.6/2.0.7/2.0.8` 计划跑 `--level l1` 仍 exit 0（白名单并列兼容）；**本轮不重跑历史目录**，仅声明 | 声明 + 可选抽验一条 |
| V7 | 不破坏既有 | 全量 `tests/*.test.mjs` 全绿；硬门行 sha `d7bef505…`；两镜像块 diff 无差异；`部署.js` exit 0；`diff -rq` exit 0 | 命令 |

## 7 不做 / 历史处置

- 不扩到 WB 全池 42 个模型（TD-16 保留）
- 不改四扇门、不改硬门行、不动历史计划与历史回执
- 历史目录处置取 **并列兼容白名单**：`deepseek-v4-pro` 保留在 `SEAT_TABLE.deepseek.models` 内并标注 `legacy`，使 2.0.6/2.0.7/2.0.8 的旧回执在新闸门下仍 exit 0；新回执一律写 `deepseek-flash`

## 8 风险（本轮新增）

| # | 风险 | 处置 |
|---|---|---|
| RK1 | 对外口径由「四路独立」降为「**三路独立 + 一路同源**」，反审结构实际从 4 路降为 3 路 | 已在主文、反审协议、`review` 块三处显式声明；不得再写作「四路独立」 |
| RK2 | 4 席中 3 席共用一个 WB 网关（同 baseURL/凭据/限流池）→ 网关抖动可同时打掉 3 席 | 记 TD-16 风险；反审失败按 `--exclude` 滑链，滑到 `hy3` |
| RK3 | `deepseek-official` 单点：主进程与 DeepSeek 席同时挂 | 该席失败不影响另外三席；滑链后仍保留 3 路独立 |
| RK4 | `hy3` 冷却兜底未定（`hy4-preview-f` 冷却时是否自动滑到 `hy3`） | 沿用 `pick-profile` 既有冷却逻辑，不改；本轮不新增兜底 |
