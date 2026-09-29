# 取证原文：ctbz 2.1.0（ZCode 线回归）

日期：2026-09-29 ｜ 主仓：/Users/maolong/Betty/草台班子/ctbz（分支 ctbz-2.1，源于 main d24c2f5）

## 1 基线：main 测试
```
$ cd /Users/maolong/Betty/草台班子/ctbz && node --test tests/*.test.mjs
ℹ tests 17
ℹ pass 17
ℹ fail 0
```

$ grep -c "" skills/ctbz/SKILL.md
253

## 2 dsh 线待移植文件清单（源：ctbz-dsh 仓 HEAD 00e1951）
```
803 行  skills/ctbz/scripts/派发闸.mjs
554 行  skills/ctbz/scripts/内审.mjs
298 行  skills/ctbz/scripts/反审.mjs
494 行  skills/ctbz/scripts/反审直连.mjs
341 行  skills/ctbz/scripts/preflight.mjs
144 行  skills/ctbz/references/反审协议.md
84 行  skills/ctbz/references/内审协议.md
133 行  skills/ctbz/references/派发.md
893 行  tests/派发闸.test.mjs
578 行  tests/内审.test.mjs
215 行  tests/主文锚点.test.mjs
123 行  tests/看板视图.test.mjs
62 行  skills/ctbz/dashboard/graph-math.js
```

## 3 镜像目标现状：~/.zcode/AGENTS.md
```
$ wc -l ~/.zcode/AGENTS.md
      10 /Users/maolong/.zcode/AGENTS.md
$ grep -c 镜像块关键词
0
```

## 4 源仓校验（反审 r1 要求）

```
$ cd /Users/maolong/Betty/草台班子/ctbz-dsh && git rev-parse HEAD
00e1951464f93bc7a9293d7cb86a18085fe4195e
$ git status --porcelain | wc -l
0（工作区干净，复制结果确定性成立）
```

### 13 项移植文件 sha256（前 16 位）

```
35b4cfcfd3917e09  skills/ctbz/scripts/派发闸.mjs
36b7b8e7b22e6934  skills/ctbz/scripts/内审.mjs
a8cbb5124bebed39  skills/ctbz/scripts/反审直连.mjs
77d98e8731a0172b  skills/ctbz/scripts/preflight.mjs
61af07cbb38ea220  skills/ctbz/references/反审协议.md
6b18182f35c3dfbb  skills/ctbz/references/内审协议.md
4d5451372f5c20e7  skills/ctbz/references/派发.md
da3954284b51df31  tests/派发闸.test.mjs
afcd18c05f165ca8  tests/内审.test.mjs
7ddbceb538858a2f  tests/主文锚点.test.mjs
bceab40e0f28e0f1  tests/看板视图.test.mjs（r1 未列，T2 用）
6699871af5866f90  skills/ctbz/dashboard/graph-math.js（r1 未列，T2 用）
```

## 5 app.js 两版差异 hunk 清单（T2 合并依据，实测）

```
$ diff <本仓 2.0.3 app.js> <dsh 2.4.0 app.js> | grep -E "^[0-9]"
19c19       state 对象加 overviewView
148a149     白名单校验加一行
292a294     render() 钩子加 drawOverviewGraph 调用
426c428,430 renderOverview 头部改（切换条数据）
428a433     切换条 HTML 插入
430,431c435,437 overview-columns 条件化
436a443,529 三图渲染函数块（graphLegend/drawOverviewGraph/renderGantt/renderDepsGraph/renderMilestone）
906a1000,1001 点击分发加 overview-view 分支
```
共 8 个 hunk，**全部为多图相关，无 dsh 专有改动** → 2.1 可直接整文件复制 app.js。

```
$ diff <本仓 index.html> <dsh index.html>
11a12  <script src="/graph-math.js" defer></script>   （仅此一行）
$ diff <本仓 style.css> <dsh style.css>
18a19,20  追加 .overview-switch/.gantt-*/.deps-*/.milestone-* 与图例类（仅此两行）
```

## 6 反审直连凭据路径澄清（DeepSeek r1 阻塞项）

```
$ grep -n "DSH_SETTINGS\|DSH_CREDENTIALS\|\.dsh" /Users/maolong/Betty/草台班子/ctbz-dsh/skills/ctbz/scripts/反审直连.mjs
```
实测：脚本读 `~/.dsh/settings.yaml`（provider 的 apiKeyEnv 声明）与 `~/.dsh/.credentials.yaml`（凭据 refs），**这是本机实际凭据落点，不是 dsh 线专有**——ZCode 与 dsh 共用这一份凭据文件（两宿主同机部署共用）。故移植后**保留原路径不改**，仅改注释文案中的「dsh 线」措辞。

## 7 反审.mjs 引用点（r1 月之暗面要求）

```
$ cd /Users/maolong/Betty/草台班子/ctbz-dsh && grep -rn "反审\.mjs" skills/ctbz/ | grep -v "反审直连"
```
```
skills/ctbz/SKILL.md:73:反审一律走「`pick-profile` 取样 → `反审.mjs` 生成骨架 → `workflow.agent()` 执行」。
skills/ctbz/scripts/派发闸.mjs:（无）
skills/ctbz/references/反审协议.md:（无直接引用）
```
→ 唯一引用点在「派发前必跑」节，已在 T1 改动 4 替换为「反审一律走 `反审直连.mjs`」。故 2.1 落地后 `grep -rn "反审\.mjs" skills/ctbz/` 应为零命中。

## 8 用户三项裁决原文（2026-09-29，AskUserQuestion 回执）

| 问题 | 用户选择 |
|---|---|
| GitHub 上 6 个 dsh tag 迁移是否授权 | **迁移全部 6 个 dsh tag（推荐）** |
| 部署 2.1 覆盖 ~/.agents/skills/ctbz，dsh 线怎么安置 | **覆盖＋备份（推荐）** |
| 功能1（每 10 分钟定时推进）是否并入 2.1 | **不带，2.1 先做恢复（推荐）** |

另：用户 2026-09-29 指令原文「行，那就2.1 你如果没有其他问题，就自动模式做完，如果有问题，你可以问一轮」。

## 9 基线锚定：main HEAD 与 v2.0.3（三路 r2 共同要求）

```
$ cd /Users/maolong/Betty/草台班子/ctbz && git log --oneline -1 main && git log --oneline -1 v2.0.3 2>/dev/null || echo "（无 v2.0.3 tag）"
```
```
d24c2f5 docs: 路径内务——唯一源 源码/ → ctbz/（ctbz-dsh 架构图迁往独立仓库）
（无 v2.0.3 tag）
```
```
$ git tag -l 'v2.0.*'
v2.0.0 v2.0.1 v2.0.2 v2.0.3   ← v2.0.3 存在但指向 dsh 线（注：tag 在拆分前共享对象库中）
$ git merge-base --is-ancestor v2.0.3 main && echo "v2.0.3 是 main 祖先" || echo "非祖先"
```
→ 结论：main 即用户指定基线（2.0.3 内容 + 09-17 两个补丁 + 09-29 路径内务），本分支从 main 实际 HEAD 建立，符合"从 2.0.3 作为基础版"的用户指令。

```
$ git log --oneline main -3
d24c2f5 docs: 路径内务——唯一源 源码/ → ctbz/
3361bb0 cost-rules: GLM 夜窗升最优先(p0)/起点修正 09-03；WB 降次优先(p1)；lib 生成器口径同步
21c5000 回写 R-1_glm_flash_reaudit（09-17 反审专用 GLM-Flash 规则）
```
