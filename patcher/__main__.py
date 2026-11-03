"""uv run python -m patcher --llvm <tree> [--dry-run]"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .patch import patch_tree


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="patcher", description=__doc__)
    parser.add_argument("--llvm", type=Path, required=True, help="llvm-project tree to patch")
    parser.add_argument("--dry-run", action="store_true", help="report, do not write")
    args = parser.parse_args(argv)

    try:
        report = patch_tree(args.llvm, dry_run=args.dry_run)
    except RuntimeError as err:
        print(f"error: {err}", file=sys.stderr)
        return 1

    print(f"LLVM {report.major}: {len(report.files)} files {'would be ' if args.dry_run else ''}patched")
    for name, count in sorted(report.hook_counts.items()):
        print(f"  {name:32} {count}")
    for msg in report.fixups:
        print(f"  fixup: {msg}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
