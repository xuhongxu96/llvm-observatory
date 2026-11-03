"""Applies the compat fixups and every hook rule to an LLVM tree."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from . import compat
from .source import Insertion, SourceFile
from .targets import RULES, Rule
from .version import llvm_major

# Present in every patched file; a tree that has it must be reset before patching.
MARKER = b"llvm_obs::"


@dataclass
class Report:
    major: int
    fixups: list[str] = field(default_factory=list)
    hook_counts: dict[str, int] = field(default_factory=dict)  # points per hook
    files: list[Path] = field(default_factory=list)  # patched files


def patch_tree(tree: Path, *, dry_run: bool = False, rules: tuple[Rule, ...] = RULES) -> Report:
    report = Report(major=llvm_major(tree))
    llvm_dir = tree / "llvm"

    plan: dict[Path, list[Insertion]] = defaultdict(list)
    sources: dict[Path, SourceFile] = {}
    for rule in rules:
        report.hook_counts[rule.hook.name] = 0
        for path in rule.files(llvm_dir):
            src = sources.setdefault(path, SourceFile.read(path))
            if src.contains(MARKER):
                raise RuntimeError(f"{path} is already patched; reset the tree first")
            points = rule.hook.points(src)
            plan[path].extend(ins for point in points for ins in point)
            report.hook_counts[rule.hook.name] += len(points)
        if rule.required and report.hook_counts[rule.hook.name] == 0:
            raise RuntimeError(f"hook {rule.hook.name} matched nothing in {rule.globs}")

    patched = {path: sources[path].apply(ins) for path, ins in plan.items() if ins}
    report.files = sorted(patched)
    if dry_run:
        return report

    report.fixups = [msg for fix in compat.FIXUPS if (msg := fix(tree, report.major))]
    for path, content in patched.items():
        path.write_bytes(content)
    return report

