#!/usr/bin/env python3
"""Apply Douyin download seq prefixes: `{seq}_{awemeId}_{stem}.mp4`.

Mirrors NetEase liked-playlist numbering: earliest (list bottom) = 0001.

Reads chronological aweme IDs (oldest first) from:
  downloads/抖音/likes-order.json   (or works-order.json)
written by the app when the full list finishes loading.

Also rewrites downloads/抖音/index.json paths.

Dry-run by default. Pass --apply to rename.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def seq_width(total: int) -> int:
    return max(4, len(str(max(total, 1))))


def format_seq(index: int, total: int) -> str:
    return str(index).zfill(seq_width(total))


def strip_prefix(name: str, aweme_id: str) -> str:
    mid = f"_{aweme_id}_"
    pos = name.find(mid)
    if pos > 0 and name[:pos].isdigit():
        return name[pos + len(mid) :]
    prefix = f"{aweme_id}_"
    if name.startswith(prefix):
        return name[len(prefix) :]
    return name


def load_order(path: Path) -> list[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    ids = data.get("awemeIds")
    if not isinstance(ids, list) or not ids:
        raise SystemExit(f"order file missing awemeIds: {path}")
    out: list[str] = []
    for item in ids:
        if isinstance(item, str) and item.strip():
            out.append(item.strip())
        elif isinstance(item, (int, float)):
            out.append(str(int(item)))
    if not out:
        raise SystemExit(f"no aweme ids in {path}")
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=repo_root() / "downloads" / "抖音",
        help="Douyin downloads root",
    )
    parser.add_argument(
        "--kind",
        choices=("likes", "works"),
        default="likes",
        help="Which folder / order file to use",
    )
    parser.add_argument(
        "--order",
        type=Path,
        default=None,
        help="Override order JSON (oldest-first awemeIds)",
    )
    parser.add_argument("--apply", action="store_true", help="Actually rename")
    args = parser.parse_args()

    root: Path = args.root
    index_path = root / "index.json"
    order_path = args.order or root / f"{args.kind}-order.json"
    if not index_path.is_file():
        print(f"missing index: {index_path}", file=sys.stderr)
        return 1
    if not order_path.is_file():
        print(
            f"missing order file: {order_path}\n"
            "Open the Douyin tool, load the full list once, then re-run.",
            file=sys.stderr,
        )
        return 1

    aweme_ids = load_order(order_path)
    seq_of = {aid: i + 1 for i, aid in enumerate(aweme_ids)}
    total = len(aweme_ids)

    data = json.loads(index_path.read_text(encoding="utf-8"))
    entries = data.get("entries")
    if not isinstance(entries, dict):
        print("invalid index.json", file=sys.stderr)
        return 1

    planned: list[tuple[Path, Path, str]] = []
    skipped = 0

    def kind_matches(kind: str) -> bool:
        k = kind.strip().lower()
        if args.kind == "likes":
            return k in ("likes", "favorite", "like")
        return k in ("works", "post")

    for key, entry in list(entries.items()):
        if not isinstance(entry, dict):
            continue
        kind = str(entry.get("kind") or "")
        if not kind_matches(kind):
            continue

        aweme_id = str(entry.get("awemeId") or "")
        raw_path = entry.get("path")
        if not aweme_id or not isinstance(raw_path, str):
            skipped += 1
            continue
        seq = seq_of.get(aweme_id)
        if seq is None:
            skipped += 1
            continue
        src = Path(raw_path)
        if not src.is_file():
            skipped += 1
            continue
        rest = strip_prefix(src.name, aweme_id)
        new_name = f"{format_seq(seq, total)}_{aweme_id}_{rest}"
        dest = src.with_name(new_name)
        if dest == src:
            continue
        if dest.exists() and dest.resolve() != src.resolve():
            print(f"skip (dest exists): {dest.name}")
            skipped += 1
            continue
        planned.append((src, dest, key))

    print(f"kind={args.kind} total_in_order={total} rename={len(planned)} skip={skipped}")
    for src, dest, _ in planned[:8]:
        print(f"  {src.name}")
        print(f"  → {dest.name}")
    if len(planned) > 8:
        print(f"  … and {len(planned) - 8} more")

    if not args.apply:
        print("dry-run only; pass --apply to rename")
        return 0

    for src, dest, key in planned:
        src.rename(dest)
        entry = entries[key]
        if isinstance(entry, dict):
            entry["path"] = str(dest)

    index_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"renamed {len(planned)} files; updated {index_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
