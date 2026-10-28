# 流程资产（CTBZ 受管模板）

这是干什么的：把散落在各处的操作手册/脚本登记成可检索、可校验的流程资产，让「做过的事能被找到、能被验真」。

## 目录约定

| 项 | 值 |
|---|---|
| 流程目录 | `~/.ctbz/流程/` |
| 机读索引 | `~/.ctbz/流程/index.json` |
| 查询脚本 | `~/.ctbz/流程/查.mjs` |
| 校验脚本 | `~/.ctbz/流程/验.mjs` |

## 命令

- 查询：`node ~/.ctbz/流程/查.mjs <关键词>`（命中输出 id/title/docPath/acceptance.command/lastVerified，未命中 `NO_MATCH` 退出码 1）
- 校验：`node ~/.ctbz/流程/验.mjs <id>`（执行该条 `acceptance.command`，输出 PASS/FAIL 与耗时，PASS 原子写回 `lastVerified`）
- 自检：`node ~/.ctbz/流程/验.mjs --self`（不依赖任何条目，验证骨架文件在位且 node 可启动）

退出码：`查.mjs` 0=有匹配 / 1=无匹配、关键词缺失、索引缺失或异常。`验.mjs` 0=PASS 或自检通过 / 1=FAIL、超时、写回失败 / 2=UNKNOWN_ID 或用法错误 / 3=索引缺失或异常。

## 降级口径（索引缺失时不静默）

`index.json` 不存在或损坏时，两个脚本都以退出码 1/3 报错并提示「流程资产未初始化」，不静默跳过。此期间：

- 流程资产复用规则降级为**只提示不拦截**——不拿「未登记」当拦截理由；
- 内审 C 闸（流程资产复用检查）在复命输出里写「流程资产复用未校验（index.json 缺失）」；
- 恢复方式：重跑 CTBZ 核心包 `scripts/部署.js`（首次安装或目标为空时自动把 `assets/流程` 模板落到本目录），或手动从核心包 `skills/ctbz/assets/流程/` 复制骨架文件。

## 模板边界

本目录是**发布模板**：只含空骨架（`entries: []`）与两个脚本，不含任何用户条目、不含任何本机绝对路径、不含凭据。用户条目只登记在本机 `~/.ctbz/流程/index.json`，部署时若目标目录已有内容则整体不动。

条目字段（登记时自定，模板不预设）：

- `id`：唯一标识，`验.mjs <id>` 与派发 brief 引用它
- `title` / `notes`：人读说明
- `docPath`：手册或文档路径（本机路径，不进发布包）
- `scripts`：相关脚本绝对路径列表
- `preconditions`：前置条件数组
- `acceptance.command` / `acceptance.expected`：校验命令与期望输出
- `lastVerified` / `verifiedBy`：由 `验.mjs` 自动写回
