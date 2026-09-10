# 两套上游的固定引用与快捷升级

- Superpowers: https://github.com/obra/superpowers ，当前固定版本见 vendor/superpowers/source.json。
- Matt Pocock skills（包含 ask-matt）: https://github.com/mattpocock/skills ，当前固定版本见 vendor/matt-pocock/source.json。

采用完整固定提交归档而非运行时 git submodule，安装后无需网络、git init 或递归拉取。源代码、许可证随包保留，dependencies.lock.json 校验所有字节；CTBZ 适配方法与原始归档分离。每套来源的 source.json 是当前固定引用，不能把 HEAD 当稳定安装依赖。

## 在本仓库快捷检查/准备升级

在 skills/ctbz 目录执行（或使用脚本绝对路径）：

```sh
node scripts/upstream check superpowers
node scripts/upstream check matt-pocock
node scripts/upstream stage superpowers v6.3.0
node scripts/upstream stage matt-pocock HEAD
```

check 对比当前固定提交与指定 ref，默认 HEAD；stage 下载固定解析后的完整提交归档、核对路径、读取许可证、计算摘要到独立临时目录，输出其绝对位置。也支持完整 40 位提交。只有公开仓库读取，不上传本项目数据。依赖 Node.js 22+、Git、curl、tar。

stage 是升级准备，不是“已升级”：不会覆盖 vendor 或运行方法，不修改依赖锁，不自动安装、运行上游代码、提交或推送。这样源变化不能悄悄覆盖 CTBZ 的权限、九步门禁或用户自选技能。

## 完成升级

用户请求实际升级时，父会话先检查 stage 的 source.json、源码差异和 LICENSE；评估重命名/拆分/资源变动，保留当前适配的调度、双层确认、新会话交接和经济性边界。确认写入范围后导入新归档和许可证，更新 vendor/<name>/source.json，保留旧归档直到明确清理授权。更新相应 methods 适配并运行本仓库 tests/workflow.test.mjs，重新生成依赖锁，再运行 scripts/methods check 和已有项目验证。只更新来源时不得声称运行适配也已升级。

依赖锁可用现有 bundleFiles 的确定性文件列表生成 SHA-256；这是维护构建操作，不能用重锁掩盖未知用户改动。升级前后检查 git diff；失败或缺件保留现场。安装指纹改变会使已有团队绑定失效，需要原 initialize prepare / 新会话 activate 流程，不能自动改机器配置。
