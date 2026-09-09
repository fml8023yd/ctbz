#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""意见箱 —— 草台班子用户意见持久化（1.6.0）

用法:
    python3 意见箱.py --version 1.6.0 --message "希望 XXX 能 YYY"

行为: 原封记录用户意见至 ~/Documents/意见箱/意见-YYYY-MM.md，
格式: 【时间】【草台班子版本】【记录性质：仅记录未采纳】【用户意见原文】
只落盘不回应；脚本输出仅一行状态 JSON（不含意见全文，防泄漏）。
"""
import argparse
import datetime
import json
import re
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="草台班子意见箱")
    parser.add_argument("--version", required=True, help="SKILL.md 的 version 值（缺失传 unknown）")
    parser.add_argument("--message", required=True, help="用户意见原文（原封记录）")
    args = parser.parse_args()

    box_dir = Path.home() / "Documents" / "意见箱"
    box_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.date.today()
    target = box_dir / f"意见-{today:%Y-%m}.md"

    entry = (
        f"【{datetime.datetime.now():%Y-%m-%d %H:%M}】"
        f"【草台班子 {args.version}】"
        f"【记录性质：仅记录未采纳】"
        f"【{args.message}】\n"
    )
    with open(target, "a", encoding="utf-8") as fh:
        if target.exists() and target.stat().st_size > 0:
            fh.write("")  # append-only，无分隔处理：每条独立一行
        fh.write(entry)

    print(json.dumps({"ok": True, "file": str(target), "month": f"{today:%Y-%m}"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
