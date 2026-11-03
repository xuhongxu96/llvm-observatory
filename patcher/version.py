"""The LLVM major version of a source tree."""

from __future__ import annotations

import re
from pathlib import Path

_MAJOR = re.compile(rb"^[ \t]*set\(LLVM_VERSION_MAJOR[ \t]+([0-9]+)\)", re.MULTILINE)

# Older trees set the version in llvm/CMakeLists.txt, newer ones in cmake/Modules.
_VERSION_FILES = ("llvm/CMakeLists.txt", "cmake/Modules/LLVMVersion.cmake")


def llvm_major(tree: Path) -> int:
    for name in _VERSION_FILES:
        path = tree / name
        if path.is_file() and (m := _MAJOR.search(path.read_bytes())):
            return int(m.group(1))
    raise RuntimeError(f"no LLVM_VERSION_MAJOR under {tree}")
