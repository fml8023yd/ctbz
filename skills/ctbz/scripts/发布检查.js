#!/usr/bin/env node
// 发布前置钩子 —— 草台班子 v1.8.1（根治 lock 幽灵哈希）
// 用法: node 发布检查.js <安装副本根目录>
// 作用: 打 tag 前必须跑——①全量重算 dependencies.lock.json ②verifyBundle 自测 ③入口脚本冒烟
// 任一失败 exit 1，禁止发布。

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
if (!root || !existsSync(join(root, "SKILL.md"))) {
  console.error("✗ 用法: 发布检查.js <安装副本根目录>（目录须含 SKILL.md）");
  process.exit(1);
}

const steps = [];
function step(name, fn) {
  try {
    const out = fn();
    steps.push({ name, ok: true, out: (out || "").toString().slice(0, 200) });
    console.log(`✓ ${name}`);
  } catch (e) {
    steps.push({ name, ok: false, err: e.message });
    console.error(`✗ ${name}: ${e.message}`);
    process.exit(1);
  }
}

step("① lock 全量重算（按实际文件集合）", () =>
  execSync(`python3 - <<'PY'
import json, hashlib, os
root = ${JSON.stringify(root)}
os.chdir(root)
files = []
for r, ds, fs in os.walk('.'):
    ds[:] = [x for x in ds if x not in ('__pycache__', '.backups')]
    for fn in sorted(fs):
        p = os.path.relpath(os.path.join(r, fn), '.').replace(os.sep, '/')
        if p == 'dependencies.lock.json': continue
        files.append(p)
files.sort()
d = {'schemaVersion': 1, 'files': [{'path': p, 'sha256': hashlib.sha256(open(p,'rb').read()).hexdigest()} for p in files]}
json.dump(d, open('dependencies.lock.json','w'), ensure_ascii=False, indent=2)
print(f"locked {len(files)} files")
PY`, { encoding: "utf8" }));

step("② verifyBundle 自测", () =>
  execSync(`node --input-type=module -e "
import { verifyBundle } from 'file://${join(root, "scripts/lib/methods.mjs")}';
const r = verifyBundle();
console.log('fingerprint', r.fingerprint.slice(0, 16), '| methods', r.methods.length);
"`, { encoding: "utf8" }));

step("③ initialize status 冒烟（不得报依赖检查失败）", () => {
  const out = execSync(`node "${join(root, "scripts/initialize")}" status 2>&1`, { encoding: "utf8" });
  if (/依赖检查失败|依赖文件已变化|依赖文件集合与锁不一致/.test(out)) throw Error("依赖检查失败字样出现在 status 输出");
  return out;
});

console.log(JSON.stringify({ ok: true, steps: steps.length, root }, null, 2));
console.log("发布前置检查全部通过，可 commit/tag/Release。");
