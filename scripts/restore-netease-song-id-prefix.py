#!/usr/bin/env python3
"""Restore the leading Netease songId prefix using downloads/网易云音乐/index.json.

Inverse of strip-netease-song-id-prefix.py. Only touches files that still have
an index entry. Dry-run by default; pass --apply to rename.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PREFIX = re.compile(r"^\d+_")


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def find_index(start: Path) -> Path | None:
    current = start.resolve()
    for _ in range(6):
        candidate = current / "index.json"
        if candidate.is_file():
            return candidate
        if current.parent == current:
            break
        current = current.parent
    return None


def collect_renames(index_path: Path) -> tuple[list[tuple[Path, Path]], int]:
    data = json.loads(index_path.read_text(encoding="utf-8"))
    entries = data.get("entries")
    if not isinstance(entries, dict):
        return [], 0

    planned: list[tuple[Path, Path]] = []
    skipped = 0
    claimed: dict[Path, set[str]] = {}

    for entry in entries.values():
        if not isinstance(entry, dict):
            continue
        raw = entry.get("path")
        song_id = entry.get("songId")
        if not isinstance(raw, str) or not raw or not isinstance(song_id, int) or song_id <= 0:
            skipped += 1
            continue
        src = Path(raw)
        if not src.is_file():
            skipped += 1
            continue
        if PREFIX.match(src.name):
            continue
        dest = src.with_name(f"{song_id}_{src.name}")
        directory = src.parent
        claimed.setdefault(
            directory,
            {p.name.lower() for p in directory.iterdir() if p.is_file()},
        )
        if dest.name.lower() in claimed[directory] or dest.exists():
            skipped += 1
            continue
        claimed[directory].add(dest.name.lower())
        planned.append((src, dest))

    return planned, skipped


def rewrite_index(index_path: Path, renames: list[tuple[Path, Path]]) -> int:
    data = json.loads(index_path.read_text(encoding="utf-8"))
    entries = data.get("entries")
    if not isinstance(entries, dict):
        return 0

    mapping = {str(src.resolve()): str(dest.resolve()) for src, dest in renames}
    updated = 0
    for entry in entries.values():
        if not isinstance(entry, dict):
            continue
        raw = entry.get("path")
        if not isinstance(raw, str) or not raw:
            continue
        new_path = mapping.get(str(Path(raw).resolve()))
        if new_path is None:
            continue
        entry["path"] = new_path
        updated += 1

    index_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return updated


def main() -> int:
    parser = argparse.ArgumentParser(description="按索引把网易云 songId 写回文件名前缀")
    parser.add_argument(
        "--dir",
        type=Path,
        default=repo_root() / "downloads" / "网易云音乐",
        help="下载根目录（默认 downloads/网易云音乐）",
    )
    parser.add_argument("--apply", action="store_true", help="真正改名；默认只预览")
    args = parser.parse_args()

    root = args.dir.expanduser().resolve()
    if not root.is_dir():
        print(f"目录不存在: {root}", file=sys.stderr)
        return 1

    index_path = find_index(root)
    if not index_path:
        print(f"找不到 index.json: {root}", file=sys.stderr)
        return 1

    try:
        renames, skipped = collect_renames(index_path)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"读取索引失败: {exc}", file=sys.stderr)
        return 1

    if not renames:
        print(f"没有需要恢复的文件：{root}（跳过 {skipped}）")
        return 0

    print(f"{'将执行' if args.apply else '预览'} {len(renames)} 个文件：{root}")
    if skipped:
        print(f"跳过 {skipped} 条（文件缺失或目标已存在）")
    print()
    preview = renames[:12]
    for src, dest in preview:
        print(f"  {src.name}")
        print(f"    → {dest.name}")
    if len(renames) > len(preview):
        print(f"  … 其余 {len(renames) - len(preview)} 个省略")

    if not args.apply:
        print("\n以上为预览，未改动任何文件。确认后加上 --apply 再跑一遍。")
        return 0

    for src, dest in renames:
        src.rename(dest)
    updated = rewrite_index(index_path, renames)
    print(f"已重命名 {len(renames)} 个文件，索引更新 {updated} 条。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
