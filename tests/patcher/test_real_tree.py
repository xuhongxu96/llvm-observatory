"""A dry run on a real, unpatched LLVM tree (the infra tree, when it is checked out)."""

from pathlib import Path

import pytest

from patcher.patch import patch_tree
from patcher.targets import RULES

TREE = Path(__file__).resolve().parents[2] / "thirdparty/llvm-infra"


@pytest.mark.skipif(not (TREE / "llvm").is_dir(), reason="run scripts/prepare_infra.sh")
def test_every_hook_matches_a_real_tree():
    report = patch_tree(TREE, dry_run=True)
    for rule in RULES:
        assert report.hook_counts[rule.hook.name] > 0, rule.hook.name
    assert report.hook_counts["value-returns"] > 1000
