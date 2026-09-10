#!/usr/bin/env node
// 部署 —— 草台班子 v1.8.2（开发工作区 → 运行安装目录，一条命令）
// 用法: node 部署.js [--check-only]
// 流程: git 目录(本脚本上级=源码) 的 skills/ctbz → rsync 到 ~/.agents/skills/ctbz
//       → 自动跑 发布检查.js（lock 重算 + verifyBundle + initialize 冒烟）
// 原则: 开发工作区是唯一源；安装目录只被部署写入，不再手改。

import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url)))); // 仓库根（scripts/ctbz 上三级）
const SRC = join(ROOT, "skills", "ctbz");
const DST = join(homedir(), ".agents", "skills", "ctbz");
const CHECK_ONLY = process.argv.includes("--check-only");

function rsync() {
  // --delete 保证镜像一致（删掉安装目录里的多余文件，防血统残留）
  execSync(`rsync -a --delete --exclude '__pycache__' --exclude '.backups' "${SRC}/" "${DST}/"`, { stdio: "inherit" });
  // dashboard-example 历史残留清理（1.8.1 已归档出引擎树）
  try { execSync(`rm -rf "${join(DST, "scripts/dashboard-example")}"`); } catch {}
}

try {
  if (CHECK_ONLY) {
    console.log("== --check-only：仅发布检查，不同步 ==");
  } else {
    // 部署前确认源码目录干净（无未提交改动时才同步——防止部署半成品）
    const dirty = execSync(`git -C "${ROOT}" status --short`, { encoding: "utf8" }).trim();
    if (dirty) {
      console.error(`✗ 开发工作区有未提交改动，先 commit 再部署：\n${dirty}`);
      process.exit(1);
    }
    console.log("== rsync 同步（源→安装目录，--delete 镜像）==");
    rsync();
  }
  console.log("== 发布检查（lock 重算 + verifyBundle + initialize 冒烟）==");
  execSync(`node "${join(dirname(fileURLToPath(import.meta.url)), "发布检查.js")}" "${DST}"`, { stdio: "inherit" });
  console.log("✓ 部署完成。");
} catch (e) {
  console.error(`✗ 部署失败: ${e.message}`);
  process.exit(1);
}
