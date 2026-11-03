"""The version-gated build fixups."""

from pathlib import Path

from patcher import compat

HEADER = "#ifndef X\n#define X\n#include <string>\n#endif\n"


def write(tree: Path, name: str, text: str) -> Path:
    path = tree / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


def test_includes_are_added_up_to_the_last_major_that_needs_them(tmp_path: Path):
    signals = write(tmp_path, "llvm/include/llvm/Support/Signals.h", HEADER)
    small_vector = write(tmp_path, "llvm/include/llvm/ADT/SmallVector.h", HEADER)

    assert compat.missing_includes(tmp_path, 15) == "<cstdint> in llvm/include/llvm/ADT/SmallVector.h"
    assert "<cstdint>" not in signals.read_text()
    assert small_vector.read_text().startswith("#ifndef X\n#define X\n#include <cstdint>\n#include <string>")


def test_several_includes_go_in_together(tmp_path: Path):
    nodes = write(tmp_path, "llvm/include/llvm/Demangle/MicrosoftDemangleNodes.h", HEADER)
    assert "<cstdint>, <string> in" in compat.missing_includes(tmp_path, 8)
    assert nodes.read_text().startswith("#ifndef X\n#define X\n#include <cstdint>\n#include <string>\n#include <string>")


def test_includes_are_idempotent_and_skip_new_releases(tmp_path: Path):
    write(tmp_path, "llvm/include/llvm/ADT/SmallVector.h", HEADER)
    assert compat.missing_includes(tmp_path, 16) is None
    assert compat.missing_includes(tmp_path, 12) is not None
    assert compat.missing_includes(tmp_path, 12) is None

