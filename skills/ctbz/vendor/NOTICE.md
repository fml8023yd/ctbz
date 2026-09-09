# 内置来源与运行边界

本目录的归档为 source-only 原始材料，不在运行时解包。CTBZ 读取 methods 内的适配版。安装根只有一个 SKILL.md；原始上游 hooks、插件入口和子技能均封存在归档中。

| 来源 | 固定依据 | 原始版权与许可 | CTBZ 适配 |
| --- | --- | --- | --- |
| obra/superpowers | 6.3.0 / b36e0829c6d0140e93cfef2ca599b1b07d4a7797，完整仓库归档 | 2025 Jesse Vincent / MIT，见 superpowers/LICENSE | 保留全部 14 项方法；调度、提问、模型选择、记录、评审与清理按 CTBZ 协议调整 |
| DietrichGebert/ponytail | 1.2.1 导入快照与 974d940a1c5344210874150b98ff0d2c861fab6a 的技能字节一致 | 2026 DietrichGebert / MIT，见 ponytail/LICENSE | 保留按需简化与根因检查，输出服从 CTBZ 和用户需求 |
| ayghri/i-have-adhd | 1.2.1 导入快照正文与 58494af57962b2d7a996b4d419474380a299af5e 一致，触发 frontmatter 有 CTBZ 改动 | 2026 Ayoub Ghriss / MIT，见 i-have-adhd/LICENSE | 在 CTBZ 汇报内按需应用，不替用户作健康判断，不跨任务强制持久化 |

两辅助技能最初获取时的上游提交未知；对照提交是本次核对依据，不冒充原始获取版本。机器可读说明见各 source.json。完整归档及运行文件由 dependencies.lock.json 的 SHA-256 校验。

默认运行仅需 Node.js 22+；Git 用于代码 worktree 和评审快照。上游 Bash 工具、npm 污染定位示例、Graphviz dot 图渲染和独立视觉服务器仅保留为原始资料，不属于 CTBZ 可执行入口，也没有被承诺可直接运行。方法采用父会话准备的本地材料和项目自己的测试命令，未新增联网安装要求。

看板另含 D3 与 Lucide，其来源和完整许可证见 dashboard/vendor。CTBZ 不自动调用其余外部 skills，也不依赖宿主递归扫描嵌套目录。
