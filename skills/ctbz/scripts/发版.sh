#!/bin/bash
# 发版 —— 草台班子唯一发版入口（v1.8.3 起）
# 用法: ./skills/ctbz/scripts/发版.sh <版本号>   例: ./skills/ctbz/scripts/发版.sh 1.8.3
# 流程: frontmatter bump → settings 版本联动 → commit → tag → push → Release → 附件 → 部署 → 阿里云
set -eu
VER="${1:?用法: 发版.sh <版本号>}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SKILL="$ROOT/skills/ctbz"
TOKEN=$(security find-generic-password -a fml8023yd -s ctbz-github-token -w 2>/dev/null) || { echo "✗ 钥匙串无 GitHub 令牌"; exit 1; }
DATE=$(date +%Y%m%d)

echo "== ① frontmatter bump → $VER =="
python3 - "$VER" <<'PY'
import re, sys
ver = sys.argv[1]
p = None
import os
for cand in [os.path.join(os.path.dirname(sys.argv[0]) or ".", "SKILL.md")]:
    pass
p = os.path.join(os.path.dirname(os.path.abspath(__import__("os").environ.get("_", "."))), "SKILL.md")
PY
# python 里路径取不到 argv[0]，改用直接路径替换：
python3 - "$VER" "$SKILL/SKILL.md" <<'PY'
import re, sys
ver, p = sys.argv[1], sys.argv[2]
s = open(p).read()
s = re.sub(r'^version:\s*\S+', f'version: {ver}', s, count=1, flags=re.M)
open(p, 'w').write(s)
print(f'version → {ver}')
PY

echo "== ② settings 版本联动 =="
python3 - "$VER" <<'PY'
import re, sys, os
ver = sys.argv[1]
p = os.path.expanduser("~/Documents/.ctbz/setting.yaml")
if os.path.exists(p):
    s = open(p).read()
    s = re.sub(r'^版本:\s*\S+', f'版本: {ver}', s, count=1, flags=re.M)
    open(p, 'w').write(s)
    print(f'settings 版本 → {ver}')
else:
    print('settings 不存在，跳过')
PY

echo "== ③ commit =="
cd "$ROOT"
git add -A
git -c user.name="fml8023yd" -c user.email="fml8023yd@users.noreply.github.com" commit -m "ctbz $VER: 发版（发布检查+lock重算+frontmatter bump 由 发版.sh 统一执行）" || echo "（无变化，继续）"

echo "== ④ tag + push =="
git tag -f "v$VER"
git remote set-url origin "https://fml8023yd:${TOKEN}@github.com/fml8023yd/ctbz.git"
git push origin main 2>&1 | tail -n 1
git push origin "v$VER" 2>&1 | tail -n 1
git remote set-url origin https://github.com/fml8023yd/ctbz.git

echo "== ⑤ Release + 附件 =="
NOTES=$(python3 - "$VER" <<'PY'
import sys
ver = sys.argv[1]
s = open("CHANGELOG.md").read()
i = s.find(f"## [{ver}]")
j = s.find("\n## [", i + 5)
print(s[i:j if j > 0 else len(s)].strip())
PY
"$VER")
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" https://api.github.com/repos/fml8023yd/ctbz/releases -d "$(python3 -c "
import json,sys
notes=sys.stdin.read()
print(json.dumps({'tag_name':sys.argv[1],'name':'ctbz '+sys.argv[1],'body':notes,'draft':False,'prerelease':False}))
" "$VER" <<EOF2
$NOTES
EOF2
)" | python3 -c "import json,sys; d=json.load(sys.stdin); print('Release:', d.get('html_url') or d.get('message'))"

tar -czf "ctbz-pack-v$VER-$DATE.tar.gz" skills CHANGELOG.md docs
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/gzip" --data-binary "@ctbz-pack-v$VER-$DATE.tar.gz" "$(curl -s -H "Authorization: Bearer $TOKEN" https://api.github.com/repos/fml8023yd/ctbz/releases/tags/v$VER | python3 -c "import json,sys; print(json.load(sys.stdin)['upload_url'].split('{')[0])")?name=ctbz-pack-v$VER-$DATE.tar.gz" -o /dev/null -w "附件 HTTP %{http_code}\n"

echo "== ⑥ 部署到本机安装目录 =="
node "$SKILL/scripts/部署.js" 2>&1 | tail -n 2

echo "== ⑦ 阿里云 =="
bash ~/.agents/skills/file-relay/scripts/relay.sh upload "$ROOT/ctbz-pack-v$VER-$DATE.tar.gz" 2>&1 | tail -n 1
echo "✓ v$VER 发版完成。"
