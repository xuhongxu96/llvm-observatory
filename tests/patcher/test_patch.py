"""patch_tree on a miniature LLVM tree."""

from pathlib import Path

import pytest

from patcher.patch import patch_tree

FILES = {
    "llvm/include/llvm/IR/PatternMatch.h": "struct is_zero {\n  template <typename ITy> bool match(ITy *V) { return false; }\n};\n",
    "llvm/CMakeLists.txt": "set(LLVM_VERSION_MAJOR 23)\n",
    "llvm/lib/IR/Value.cpp": "Value::~Value() {\n}\nvoid Value::doRAUW(Value *New, int M) {\n}\n",
    "llvm/lib/Transforms/InstCombine/InstructionCombining.cpp": (
        "bool InstCombinerImpl::run() {\n  if (Instruction *R = visit(*I))\n    return true;\n  return false;\n}\n"
        "Value *InstCombinerImpl::simplify(Value *V) {\n  if (match(V, m_Zero()))\n    return nullptr;\n  return V;\n}\n"
    ),
}


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    for name, text in FILES.items():
        (tmp_path / name).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / name).write_text(text)
    return tmp_path


def test_patches_every_rule(tree: Path):
    report = patch_tree(tree)
    assert report.major == 23
    assert report.hook_counts == {
        "value-returns": 1,
        "replace": 1,
        "delete": 1,
        "iteration:instcombine": 1,
        "visit": 1,
        "match": 1,
        "matchers": 2,  # the scope and the result
        "iteration:aggressive-instcombine": 0,
    }
    combining = (tree / "llvm/lib/Transforms/InstCombine/InstructionCombining.cpp").read_text()
    assert "llvm_obs::IterationScope" in combining
    assert "return llvm_obs::observed(V);" in combining


def test_dry_run_writes_nothing(tree: Path):
    patch_tree(tree, dry_run=True)
    assert "llvm_obs" not in (tree / "llvm/lib/IR/Value.cpp").read_text()


def test_refuses_a_patched_tree(tree: Path):
    patch_tree(tree)
    with pytest.raises(RuntimeError, match="already patched"):
        patch_tree(tree)


def test_missing_required_hook_fails(tree: Path):
    (tree / "llvm/lib/IR/Value.cpp").write_text("void Value::other() {}\n")
    with pytest.raises(RuntimeError, match="hook replace matched nothing"):
        patch_tree(tree)
