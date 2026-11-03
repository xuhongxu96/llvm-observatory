"""Indexes the functions defined and declared in the build's sources, for jump to
definition in the source view, with tree-sitter's C++ tags query.

    python scripts/tags.py <sources dir> <out.json>

The output:

    {"paths": [<path under llvm/>, ...],
     "tags": {<name>: [[<path index>, <line>, <kind>, <definition>, <min args>, <max args>], ...]}}

<kind> is "function" or "type". <definition> is 1 for a definition (a function with a
body, or a type) and 0 for a declaration. The argument counts let a call pick among
overloads (e.g. the free match(V, P) among the matchers' match(V) methods); <max args>
is -1 for a variadic function, and both are 0 for types.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import tree_sitter_cpp
from tree_sitter import Node

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from patcher.source import SourceFile, query

TAGS = query(tree_sitter_cpp.TAGS_QUERY)

KINDS = {
    "definition.function": "function",
    "definition.method": "function",
    "definition.class": "type",
    "definition.type": "type",
}

# A function tag inside one of these is a definition.
DEFINITION_DECLARATORS = query("(function_definition declarator: (_) @declarator)")

# The parameters of a function declarator, as direct children of its parameter list.
PARAMETERS = query("""
(function_declarator
  parameters: (parameter_list
    [(parameter_declaration) @required
     (optional_parameter_declaration) @optional
     (variadic_parameter_declaration) @variadic
     "..." @variadic]?)) @function
""")

SOURCE_SUFFIXES = {".cpp", ".h", ".inc", ".def"}

Tag = tuple[str, int, str, int, int, int]  # name, line, kind, definition, min args, max args


def _within(node: Node, ranges: list[Node]) -> bool:
    return any(r.start_byte <= node.start_byte and node.end_byte <= r.end_byte for r in ranges)


def _arities(src: SourceFile) -> dict[int, tuple[int, int]]:
    """Function declarator (by start byte) -> (min, max) arguments; max -1 if variadic."""
    counts: dict[int, list[int]] = defaultdict(lambda: [0, 0, 0])  # required, optional, variadic
    for match in src.matches(PARAMETERS):
        count = counts[match["function"][0].start_byte]
        for i, kind in enumerate(("required", "optional", "variadic")):
            count[i] += len(match.get(kind, []))
    return {start: (r, -1 if v else r + o) for start, (r, o, v) in counts.items()}


def tags_of(src: SourceFile) -> list[Tag]:
    definitions = [m["declarator"][0] for m in src.matches(DEFINITION_DECLARATORS)]
    arities = _arities(src)
    out: list[Tag] = []
    for match in src.matches(TAGS):
        tag = next((k for k in match if k in KINDS), None)
        if tag is None:
            continue
        name, node = match["name"][0], match[tag][0]
        kind = KINDS[tag]
        if kind == "type":
            out.append((src.text(name).decode(), name.start_point.row + 1, kind, 1, 0, 0))
            continue
        low, high = arities.get(node.start_byte, (0, 0))
        out.append((src.text(name).decode(), name.start_point.row + 1, kind, int(_within(node, definitions)), low, high))
    return out


def index(sources: Path) -> dict:
    paths = sorted(str(p.relative_to(sources)) for p in sources.rglob("*") if p.suffix in SOURCE_SUFFIXES)
    tags: dict[str, set[tuple]] = defaultdict(set)
    for i, path in enumerate(paths):
        for name, *rest in tags_of(SourceFile.read(sources / path)):
            tags[name].add((i, *rest))
    return {
        "paths": paths,
        "tags": {name: [list(t) for t in sorted(entries)] for name, entries in sorted(tags.items())},
    }


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    result = index(Path(argv[1]))
    Path(argv[2]).write_text(json.dumps(result, separators=(",", ":")))
    count = sum(len(t) for t in result["tags"].values())
    print(f"{count} tags of {len(result['tags'])} names in {len(result['paths'])} sources")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
