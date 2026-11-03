"""The version-gated build fixups."""

from pathlib import Path

from patcher import compat

HEADER = "#ifndef X\n#define X\n#include <string>\n#endif\n"


def write(tree: Path, name: str, text: str) -> Path:
    path = tree / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


def test_cstdint_is_added_up_to_the_last_major_that_needs_it(tmp_path: Path):
    signals = write(tmp_path, "llvm/include/llvm/Support/Signals.h", HEADER)
    small_vector = write(tmp_path, "llvm/include/llvm/ADT/SmallVector.h", HEADER)

    assert compat.cstdint_includes(tmp_path, 15) == "<cstdint> in llvm/include/llvm/ADT/SmallVector.h"
    assert "<cstdint>" not in signals.read_text()
    assert small_vector.read_text().startswith("#ifndef X\n#define X\n#include <cstdint>\n#include <string>")


def test_cstdint_is_idempotent_and_skips_new_releases(tmp_path: Path):
    write(tmp_path, "llvm/include/llvm/ADT/SmallVector.h", HEADER)
    assert compat.cstdint_includes(tmp_path, 16) is None
    assert compat.cstdint_includes(tmp_path, 12) is not None
    assert compat.cstdint_includes(tmp_path, 12) is None
