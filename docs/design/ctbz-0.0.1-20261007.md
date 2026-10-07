# CTBZ 0.0.1

| 项 | 决定 |
|---|---|
| 原始目标 | 一份全局 CTBZ；Harness 私有 adapter；原生子进程优先，主进程兜底；清理旧版；0.0.1 发版 |
| 模式 | 用户明确授权自动执行、Git 管理、发布与旧项目清理 |
| 核心 | 新版当前目录 ctbz（Git 管理）；旧版 ctbz-old；安装 ~/.agents/skills/ctbz |
| Adapter | ~/.codex/skills/ctbz-codex、~/.zcode/skills/ctbz-zcode；不复制核心 |
| 白名单 | codex、zcode；未知/不可用/启动失败/途中失败提示一次，主进程继续 |
| 权限 | 权限拒绝不触发越权重试；自审不得伪称独立评审 |
| Codex | plan/discuss=gpt-6-astra；其余=gpt-6.1-sol；在途上限 2；合法 task_name；显式模型 fork_turns=none |
| Session | Harness 内目录；项目记录保留 .ctbz-record；共享知识与用户偏好不删 |
| API 执行器 | 按本轮裁决暂缓；不默认调用旧四厂商反审 |
| 旧版 | 先归档至技能发现目录外，校验后清理旧技能、复制仓库和旧发布包 |
| GitHub | 最新指令：本轮仅本地；不推送、不发远端 Release、不删远端仓库 |
| 不做此方案 | 两份核心继续漂移；宿主不可用时旧规则阻止工作 |
| 更小方案 | 单改文档无法消除复制核心、安装漂移与错误派发参数 |

## 现场核对

| 证据 | 事实 |
|---|---|
| git HEAD | 65036d5；工作树干净；远端 main=2edfe7f |
| 本地旧技能 | ctbz.bak-1.7.0-20260910、ctbz.bak-1.8.1-20260911、ctbz.bak-1.8.2-20260916 |
| Codex 复制版 | /Users/master/CODEX/CTBZ-Codex；独立核心副本 |
| GitHub 公开列表 | 仅查到 fml8023yd/ctbz；私有项目未能验证 |
| 认证 | GitHub 环境变量、git credential、ctbz-github-token 均不可用 |
| 独立计划审查 | Astra v001_plan；已定位 task_name、fork_turns、并发闸、源码锁、全局指令冲突 |

## 执行契约

1. 保留看板、知识、方法、角色与状态模块；重写共享入口，移动 ZCode 初始化/发现/profile/doctor 等宿主代码到 ZCode adapter。
2. 实现统一选择、真实回执、降级记录与主进程接管契约；验证边界与并发；不伪造工具执行。
3. 重写部署/只读发布校验/打包；源端锁定、安装验证、升级路径；不把本地配置与凭据打包。
4. 独立测试、临时 HOME 安装、真实原生子 Agent 冒烟；最后主进程验收、备份、部署、本地 Git tag/出包与清理。

## 停止条件

| 项 | 条件 |
|---|---|
| 回修 | 最多三轮；剩余真实缺陷保留证据 |
| 删除 | 目标身份明确、备份可读、新版可用；未知项目不猜测删除 |
| 网络写 | 可用认证且备份完整；否则完成全部本地工作并报告阻塞 |

## 验收

1. 单一核心，两 adapter 不含方法/看板副本；新机读核心成功。
2. 未知宿主、缺工具、启动/途中失败有记录且主进程接管；权限拒绝停止被拒动作。
3. 并发边界、模型分配、task_name、fork_turns 满足真实工具 schema。
4. 锁能发现修改/新增/删除；校验只读；安装失败保留原安装；release 包无本地状态或密钥。
5. 全套必要测试通过；安装路径、版本、归档、Git 与远端状态有证据。

## 主进程补充审查

审查现场：`/tmp/ctbz-root-review-notes.md`。包含 session 显式路径越界、并发外部 Agent 计数、安装副本重锁、真实 spawn 返回 `task_name` 兼容性与 ZCode 技能发现证据。交付前逐项消除。

现场补充：真实 Codex spawn 回执为 `{"task_name":"/root/v001_build"}`；不能只收 agent_id。ZCode 模型由本宿主已加载 profile 决定，不能套用 Codex Astra/Sol。显式 session --home/--storage 也须留在项目 .zcode；安装副本禁止 write-lock。

复核：并发同一 taskId 要在首次 await 前占位，排队时释放占位；否则同一任务被双派或第二次失败后与第一子进程并行写。
