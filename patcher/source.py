"""A C++ source file: its bytes, its tree-sitter tree, and inline insertions.

Insertions never contain a newline, so a patched file keeps every line number of the
original. Symbolized stack frames and MC/DC regions then point at upstream lines.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import tree_sitter_cpp
from tree_sitter import Language, Node, Parser, Query, QueryCursor

CPP = Language(tree_sitter_cpp.language())
_PARSER = Parser(CPP)


def query(pattern: str) -> Query:
    return Query(CPP, pattern)


@dataclass(frozen=True)
class Insertion:
    offset: int
    text: bytes

    def __post_init__(self) -> None:
        if b"\n" in self.text:
            raise ValueError(f"insertion would shift line numbers: {self.text!r}")


class SourceFile:
    def __init__(self, path: Path, content: bytes) -> None:
        self.path = path
        self.content = content
        self.root = _PARSER.parse(content).root_node

    @classmethod
    def read(cls, path: Path) -> SourceFile:
        return cls(path, path.read_bytes())

    def matches(self, q: Query, node: Node | None = None) -> list[dict[str, list[Node]]]:
        """Captures of every match of `q` under `node` (the whole file by default)."""
        return [captures for _, captures in QueryCursor(q).matches(node or self.root)]

    def captures(self, q: Query, node: Node | None = None) -> dict[str, list[Node]]:
        return QueryCursor(q).captures(node or self.root)

    def text(self, node: Node) -> bytes:
        return self.content[node.start_byte : node.end_byte]

    def contains(self, needle: bytes) -> bool:
        return needle in self.content

    def apply(self, insertions: list[Insertion]) -> bytes:
        """The content with `insertions` applied. Insertions at the same offset keep their
        list order. Raises if the result has more parse errors than the original."""
        parts: list[bytes] = []
        pos = 0
        for ins in sorted(insertions, key=lambda i: i.offset):
            parts += [self.content[pos : ins.offset], ins.text]
            pos = ins.offset
        parts.append(self.content[pos:])
        out = b"".join(parts)
        if _error_count(_PARSER.parse(out).root_node) > _error_count(self.root):
            raise RuntimeError(f"{self.path}: patching introduced a parse error")
        return out


_ERRORS = query("(ERROR) @error")


def _error_count(root: Node) -> int:
    return len(QueryCursor(_ERRORS).captures(root).get("error", []))
