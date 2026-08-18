#!/usr/bin/env python3
"""Strip the leading Netease songId from Bilibili sniff-download filenames.

Isshin-tools currently writes:
    {songId}_{artists} - {title}-{bvid}.mp4
This script removes `{songId}_` and rewrites downloads/网易云音乐/index.json
so the app still recognizes already-downloaded tracks.

Dry-run by default. Pass --apply to rename.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PREFIX = re.compile(r"^(\d+)_(.+)$")
MEDIA_SUFFIXES = {".mp4", ".m4a", ".mkv", ".webm", ".flv", ".mov"}


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def strip_prefix(name: str) -> str | None:
    match = PREFIX.match(name)
    if not match:
        return None
    rest = match.group(2).strip()
    return rest or None


def unique_dest(directory: Path, filename: str, claimed: set[str]) -> Path:
    stem = Path(filename).stem
    suffix = Path(filename).suffix
    candidate = filename
    n = 2
    while candidate.lower() in claimed or (directory / candidate).exists():
        candidate = f"{stem} ({n}){suffix}"
        n += 1
    claimed.add(candidate.lower())
    return directory / candidate


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


def collect_renames(root: Path) -> list[tuple[Path, Path]]:
    claimed: dict[Path, set[str]] = {}
    planned: list[tuple[Path, Path]] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in MEDIA_SUFFIXES:
            continue
        new_name = strip_prefix(path.name)
        if not new_name or new_name == path.name:
            continue
        directory = path.parent
        claimed.setdefault(directory, {p.name.lower() for p in directory.iterdir() if p.is_file()})
        dest = unique_dest(directory, new_name, claimed[directory])
        planned.append((path, dest))
    return planned


def rewrite_index(index_path: Path, renames: list[tuple[Path, Path]], apply: bool) -> int:
    mapping = {src.resolve(): dest.resolve() for src, dest in renames}
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"跳过索引（无法读取 {index_path}）: {exc}", file=sys.stderr)
        return 0

    entries = data.get("entries")
    if not isinstance(entries, dict):
        return 0

    updated = 0
    for entry in entries.values():
        if not isinstance(entry, dict):
            continue
        raw = entry.get("path")
        if not isinstance(raw, str) or not raw:
            continue
        current = Path(raw)
        new_path = mapping.get(current.resolve())
        if new_path is None:
            continue
        entry["path"] = str(new_path)
        updated += 1

    if apply and updated:
        index_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return updated


def main() -> int:
    parser = argparse.ArgumentParser(description="去掉文件名前缀里的网易云 songId")
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

    renames = collect_renames(root)
    if not renames:
        print(f"没有需要处理的文件：{root}")
        return 0

    print(f"{'将执行' if args.apply else '预览'} {len(renames)} 个文件：{root}\n")
    preview = renames[:12]
    for src, dest in preview:
        print(f"  {src.name}")
        print(f"    → {dest.name}")
    if len(renames) > len(preview):
        print(f"  … 其余 {len(renames) - len(preview)} 个省略")

    index_path = find_index(root)
    index_hits = 0
    if index_path:
        index_hits = rewrite_index(index_path, renames, apply=False)
        print(f"\n索引 {index_path} 将更新 {index_hits} 条 path")

    if not args.apply:
        print("\n以上为预览，未改动任何文件。确认后加上 --apply 再跑一遍。")
        return 0

    for src, dest in renames:
        src.rename(dest)

    if index_path:
        index_hits = rewrite_index(index_path, renames, apply=True)
        print(f"已更新索引 {index_hits} 条")

    print(f"已重命名 {len(renames)} 个文件。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
