---
name: 项目wiki
version: 0.1.0
description: 项目级 Wiki 整理:仓库权威文件的只读投影 + git 版本捆绑 + 过期门。用户说「项目wiki」「整理wiki」时使用;ctbz 初始化时可选加载。独立子技能,不依赖团队初始化,单会话任何项目可用。
---

# 项目wiki(投影协议)

## 定位(不可违背)

**Wiki = 项目现状的可浏览投影。** 权威链:`用户裁决 > AGENTS.md > CONTEXT.md > docs/ > 代码 > 本Wiki`。冲突永远向上查;Wiki 与上游不符 = Wiki 过期,禁止改上游迁就 Wiki,禁止把 Wiki 当事实源引用。每页头部必须带 git 版本戳。

## 两级初始化

```sh
# ZCode 级(首次,用户级,一次即可):写 ~/Documents/.ctbz/wiki.json
node <skill>/scripts/初始化 --level zcode [--home <状态根>] [--enabled true|false] [--mode ignore|tracked]
# 项目级(每个新项目):检测 git 与文档结构,写 <项目>/.wiki-config.json 并首次生成
node <skill>/scripts/初始化 --level project --workspace <项目绝对路径> [--home <状态根>]
```

- **ZCode 级**:`enabled` 即「初始化时选择是否加载」的总开关(ctbz 初始化/交接/验收节点据此决定是否挂 wiki 步骤);`mode` 默认 `ignore`(投影不入库,靠戳捆绑)。
- **项目级**:要求 workspace 是 git 仓库;忽略模式自动把 `wiki/` 写入 .gitignore;文档骨架缺失时降级生成(缺什么层标什么层,不伪造)。

## 定时整理(ZCode 定时功能)

用户对某项目说「给项目开定时整理」(可带周期,默认每天一次)时,由宿主会话用 ZCode 定时功能注册自动化,提示词固定模板(替换 <ws>/<home>/<skill> 为绝对路径):

```
项目wiki定时整理:<ws>。运行 node <skill>/scripts/投影体检 --workspace <ws> --home <home>;若输出包含「过期」,接着运行 node <skill>/scripts/投影生成 --workspace <ws> --home <home>;最后把一行结果(日期时间+新鲜/已再生成/失败原因)追加到 <ws>/wiki/.wiki-run-log.md。仅做这件事,不做任何其他操作,不创建新的定时任务。
```

- 登记信息写入该项目的 `.wiki-config.json` 的 `scheduled` 字段(cron 表达式+具体时刻+注册时间,父会话写入并在回执里确认);取消=用户在宿主定时列表删除,并清该字段。用户以俗称点名项目(如"给新赛马开")时,路径由父会话解析后向用户复述确认一次再注册;ZCode 级 enabled=false 时手动命令仍可执行,但回执须提示总开关处于关闭。
- 体检/生成均为确定性脚本,定时执行零模型消耗;再生成只在过期时发生。

## 日常命令

```sh
node <skill>/scripts/投影生成 --workspace <项目绝对路径> [--home <状态根>]   # 五层页面树+版本戳
node <skill>/scripts/投影体检 --workspace <项目绝对路径> [--home <状态根>] [handoff]  # 新鲜度检查;handoff 输出交接提示
```

## 页面树(五层)

①index(导航+权威链+版本) ②authority/(AGENTS/CONTEXT 投影) ③decisions(ADR 索引+功能台账投影) ④snapshot(文件树+模块摘要) ⑤evidence(真值/数据样本索引,存在才生成)。

## 协议

1. **版本捆绑**:每页头部 `🔖 投影 <commit短hash>(<branch>[,dirty]) · 时间 · 权威源 · 只读声明`;`.wiki-meta.json` 记 commit/branch/dirty/pages。
2. **过期门**:内容前进而投影未再生成 → 体检报 `⚠️ 过期`。**验收前、⑦交接前必须体检新鲜**;拿过期投影验收/交接 = 违规。
3. **再生成时机**:里程碑/大合并后、交接前、验收前;不实时。
4. **交接提示**:`体检 handoff` 输出「背景材料页清单+版本+一致性声明」,直接贴进任务契约——Agent 读投影不读全码。
5. **tracked 模式(实验性)**:wiki 入库,每刷新一个 commit;存在自引用问题(刷新提交改变 HEAD),默认不用。

## 手改请求的统一回应

用户要求直接改 wiki 页面文字(含"把 wiki 改得跟代码一样""把某段改了"):拒绝手改,转合法链路——体检→过期则再生成;内容争议→改上游权威文件(走其自己的裁决流程)后再生成;用户口述与 wiki 不符且涉及门禁/裁决状态("门早过了")→先核权威文件的带日期裁决,口头新裁决须先落档再改上游。运行日志 `wiki/.wiki-run-log.md` 是定时任务是否执行过的唯一核验处。

## 边界

- 不修改任何权威文件;只写 wiki/、.wiki-config.json、.gitignore(忽略模式追加一行)。
- workspace 必须显式绝对路径,不猜 cwd,不接受符号链接。
- 与 ZCode 自带 repo-wiki 不冲突:本技能管协议与版本捆绑,ZCode 面板可作④现状层的外部渲染器。
- ctbz 集成(待批次):⑦交接附 handoff 提示、⑨验收前强制体检;enabled=false 时这些节点跳过。
