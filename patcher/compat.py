"""Build fixups for old target trees that modern emscripten and libstdc++ reject.

Each fixup takes the tree and its LLVM major version, edits text anchors only when its
version gate applies, and returns a description of what it changed (None if nothing).
These are plain-text edits on headers, preprocessor blocks and CMake, not C++ syntax.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

Fixup = Callable[[Path, int], str | None]


# Headers that use fixed-width integer types without including <cstdint>, which current
# C++ standard libraries no longer include for them, with the last LLVM major that
# needs it.
MISSING_CSTDINT = {
    "llvm/include/llvm/Support/Signals.h": 13,
    "llvm/include/llvm/ADT/SmallVector.h": 15,
}


def cstdint_includes(tree: Path, major: int) -> str | None:
    """Includes <cstdint> where old headers rely on getting it from elsewhere."""
    fixed = []
    for header, last in MISSING_CSTDINT.items():
        path = tree / header
        if major > last or not path.is_file():
            continue
        if _insert_before(path, "#include ", "#include <cstdint>\n"):
            fixed.append(header)
    return f"<cstdint> in {', '.join(fixed)}" if fixed else None


def path_inc_emscripten(tree: Path, major: int) -> str | None:
    """LLVM <= 8: Unix/Path.inc has no Emscripten branch, and the generic one uses
    statfs::f_flags and MNT_LOCAL, which emscripten lacks.
    See https://github.com/emscripten-core/emscripten/issues/6432."""
    path = tree / "llvm/lib/Support/Unix/Path.inc"
    if major > 8 or not path.is_file():
        return None
    text = path.read_text()
    if "defined(__EMSCRIPTEN__)" in text:
        return None

    # 1. Use the .f_flag spelling: extend the `#if defined(__NetBSD__)...` directive
    #    (possibly continued over several lines) right before STATVFS_F_FLAG.
    flag = text.index("#define STATVFS_F_FLAG(vfs) (vfs).f_flag\n")
    directive = text.rindex("#if defined(__NetBSD__)", 0, flag)
    end = text.index("\n", directive)
    while text[end - 1] == "\\":
        end = text.index("\n", end + 1)
    text = text[:end] + " || defined(__EMSCRIPTEN__)" + text[end:]

    # 2. is_local_impl: everything is local on emscripten.
    anchor = "#else\n  return !!(STATVFS_F_FLAG(Vfs) & MNT_LOCAL);"
    if anchor not in text:
        raise RuntimeError(f"{path}: is_local_impl MNT_LOCAL branch not found")
    text = text.replace(anchor, "#elif defined(__EMSCRIPTEN__)\n  return true;\n" + anchor, 1)
    path.write_text(text)
    return f"{path}: emscripten branches"


def mc_vcsrevision_dependency(tree: Path, major: int) -> str | None:
    """Some snapshots include VCSRevision.h in lib/MC without depending on the target
    that generates it, so parallel builds race on the header."""
    source = tree / "llvm/lib/MC/DXContainerInfo.cpp"
    cmake = tree / "llvm/lib/MC/CMakeLists.txt"
    if not source.is_file() or '#include "llvm/Support/VCSRevision.h"' not in source.read_text():
        return None
    if "llvm_vcsrevision_h" in cmake.read_text():
        return None
    anchor = "  DEPENDS\n  intrinsics_gen\n"
    return _insert_after(cmake, anchor, "  llvm_vcsrevision_h\n")


FIXUPS: tuple[Fixup, ...] = (cstdint_includes, path_inc_emscripten, mc_vcsrevision_dependency)


def _insert_before(path: Path, anchor: str, text: str) -> str | None:
    """Inserts `text` before the first `anchor`, unless the file already has it."""
    content = path.read_text()
    if text in content:
        return None
    if anchor not in content:
        raise RuntimeError(f"{path}: anchor {anchor!r} not found")
    path.write_text(content.replace(anchor, text + anchor, 1))
    return f"{path}: {text.strip()}"


def _insert_after(path: Path, anchor: str, text: str) -> str | None:
    content = path.read_text()
    if anchor not in content:
        raise RuntimeError(f"{path}: anchor {anchor!r} not found")
    path.write_text(content.replace(anchor, anchor + text, 1))
    return f"{path}: {text.strip()}"
