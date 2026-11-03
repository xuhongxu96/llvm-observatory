"""Cross-references the observed sources with clang (libclang, from emcc's LLVM), with the
build's own compile commands: what each call in them calls, as the compiler resolved it
(overloads, templates and methods included), and the pattern of each match(V, P) call.

    python scripts/xref.py <compile_commands.json> <llvm dir> <sources dir> <out.json>

The output:

    {"paths": [<path under llvm/>, ...],
     "calls": {<path>: [[<line>, <column>, <path index>, <line>], ...]},
     "patterns": {<path>: {"<line>:<column>": <pattern>}}}

A call is the name of a called function (its first character) and the line of its
definition, if it is in the sources. A pattern is keyed by where its match call starts:

    {"name": "m_Add", "text": "m_Add(m_Value(X), m_One())",
     "classes": ["BinaryOp_match"],      # the matcher type and its bases
     "args": [<pattern>, ...],           # the sub-patterns
     "vars": [{"text": "X", "out": true}]}  # the other arguments; out: the matcher
                                         # binds it (a non-const reference parameter)

The runtime names a matcher by its class (runtime/include/llvm_observatory/matchers.h),
so the classes line up the matchers that ran with the pattern as written.
"""

from __future__ import annotations

import json
import shlex
import subprocess
import sys
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from clang import cindex

K = cindex.CursorKind
FUNCTIONS = {K.FUNCTION_DECL, K.CXX_METHOD, K.FUNCTION_TEMPLATE, K.CONSTRUCTOR, K.CONVERSION_FUNCTION}
REFERENCES = {K.DECL_REF_EXPR, K.MEMBER_REF_EXPR}

Location = tuple[str, int]  # path under llvm/, line


@dataclass
class Index:
    """What one translation unit tells about the sources."""

    calls: set[tuple[str, int, int, Location | str]] = field(default_factory=set)  # str: a USR, resolved later
    definitions: dict[str, Location] = field(default_factory=dict)  # USR -> location
    patterns: dict[tuple[str, int, int], dict] = field(default_factory=dict)


def emscripten_flags() -> list[str]:
    """The flags em++ adds for clang (target, sysroot), without its -mllvm options."""
    flags = shlex.split(subprocess.check_output(["em++", "--cflags"], text=True))
    out: list[str] = []
    skip = False
    for flag in flags:
        if skip:
            skip = False
        elif flag == "-mllvm":
            skip = True
        else:
            out.append(flag)
    return out


def compile_flags(command: str, file: str) -> list[str]:
    """A compile command's flags, without the compiler, the output and the source."""
    args = shlex.split(command)[1:]
    out: list[str] = []
    skip = False
    for arg in args:
        if skip:
            skip = False
        elif arg in ("-o", "-c"):
            skip = True
        elif arg != file:
            out.append(arg)
    return out


class Unit:
    def __init__(self, tu: cindex.TranslationUnit, llvm: Path, sources: set[str]):
        self.tu = tu
        self.prefix = str(llvm) + "/"
        self.sources = sources
        self.texts: dict[str, bytes] = {}
        self.index = Index()

    def path(self, cursor: cindex.Cursor) -> str | None:
        """The cursor's path under llvm/, if it is in the sources."""
        file = cursor.location.file
        if file is None or not file.name.startswith(self.prefix):
            return None
        path = file.name[len(self.prefix) :]
        return path if path in self.sources else None

    def text(self, cursor: cindex.Cursor) -> str:
        file = cursor.extent.start.file.name
        if file not in self.texts:
            self.texts[file] = Path(file).read_bytes()
        return self.texts[file][cursor.extent.start.offset : cursor.extent.end.offset].decode()

    def run(self) -> Index:
        for child in self.tu.cursor.get_children():
            self.visit(child)
        return self.index

    def visit(self, cursor: cindex.Cursor) -> None:
        """Visits the parts of the AST written in the sources (namespaces span files)."""
        if cursor.kind != K.NAMESPACE and self.path(cursor) is None:
            return
        path = self.path(cursor)
        if path is not None:
            self.note(cursor, path)
        for child in cursor.get_children():
            self.visit(child)

    def note(self, cursor: cindex.Cursor, path: str) -> None:
        kind = cursor.kind
        if kind in FUNCTIONS and cursor.is_definition():
            self.index.definitions[cursor.get_usr()] = (path, cursor.location.line)
        elif kind in REFERENCES:
            target = cursor.referenced
            if target is not None and target.kind in FUNCTIONS:
                self.call(cursor, path, target)
        elif kind == K.CALL_EXPR and cursor.spelling == "match":
            self.match(cursor, path)

    def call(self, cursor: cindex.Cursor, path: str, target: cindex.Cursor) -> None:
        definition = target.get_definition()
        where: Location | str | None = None
        if definition is not None:
            where = self.location(definition)
        if where is None:
            where = target.canonical.get_usr()  # defined in another unit, maybe
        location = cursor.location
        self.index.calls.add((path, location.line, location.column, where))

    def location(self, cursor: cindex.Cursor) -> Location | None:
        path = self.path(cursor)
        return (path, cursor.location.line) if path else None

    def match(self, call: cindex.Cursor, path: str) -> None:
        """A call of PatternMatch's match(V, P): the pattern P, as written."""
        target = call.referenced
        args = list(call.get_arguments())
        if target is None or target.semantic_parent.spelling != "PatternMatch" or len(args) != 2:
            return
        patterns = self.patterns(args[1])
        if len(patterns) == 1:
            start = call.extent.start
            self.index.patterns[(path, start.line, start.column)] = patterns[0]

    def patterns(self, expression: cindex.Cursor) -> list[dict]:
        """The matchers made in an expression, outermost first (through conversions and
        copies): calls of functions (m_Add(…)) and of matchers' constructors (m_Mask(…))."""
        if expression.kind == K.CALL_EXPR and (is_function(expression.referenced) or is_matcher_constructor(expression)):
            return [self.pattern(expression)]
        return [p for child in expression.get_children() for p in self.patterns(child)]

    def pattern(self, call: cindex.Cursor) -> dict:
        args, vars = [], []
        parameters = list(call.referenced.type.argument_types())
        for i, arg in enumerate(call.get_arguments()):
            sub = self.patterns(arg)
            if sub:
                args.extend(sub)
            else:
                out = i < len(parameters) and is_output(parameters[i])
                vars.append({"text": self.text(arg), "out": out})
        return {
            "name": call.spelling,
            "text": self.text(call),
            "classes": classes(call.type.get_canonical().get_declaration()),
            "args": args,
            "vars": vars,
        }


def is_output(parameter: cindex.Type) -> bool:
    """A parameter the matcher binds: a reference to non-const (Value *&, APInt *&,
    CmpPredicate &, ArrayRef<int> &)."""
    return parameter.kind == cindex.TypeKind.LVALUEREFERENCE and not parameter.get_pointee().is_const_qualified()


def is_function(cursor: cindex.Cursor | None) -> bool:
    return cursor is not None and cursor.kind in (K.FUNCTION_DECL, K.FUNCTION_TEMPLATE)


def is_matcher_constructor(call: cindex.Cursor) -> bool:
    """A constructor of a class with a match method, written out (not a copy, a move or
    an implicit conversion)."""
    target = call.referenced
    if target is None or target.kind != K.CONSTRUCTOR or target.is_copy_constructor() or target.is_move_constructor():
        return False
    tokens = list(call.get_tokens())
    if not tokens or tokens[0].spelling != call.spelling:
        return False
    return any(m.spelling == "match" for m in target.semantic_parent.get_children())


def classes(decl: cindex.Cursor) -> list[str]:
    """A matcher type's class and its bases (those of its template, too), by name."""
    out: list[str] = []
    for d in (decl, decl.specialized_template):
        if d is None or d.kind == K.NO_DECL_FOUND:
            continue
        if d.spelling and d.spelling not in out:
            out.append(d.spelling)
        for base in d.get_children():
            if base.kind == K.CXX_BASE_SPECIFIER:
                out.extend(c for c in classes(base.type.get_canonical().get_declaration()) if c not in out)
    return out


# The worker processes' shared state, set by init().
_ARGS: tuple[list[str], Path, set[str]] | None = None


def init(flags: list[str], llvm: Path, sources: set[str], library: str) -> None:
    global _ARGS
    cindex.Config.set_library_file(library)
    _ARGS = (flags, llvm, sources)


def index_unit(entry: dict) -> Index:
    assert _ARGS is not None
    flags, llvm, sources = _ARGS
    args = [*flags, *compile_flags(entry["command"], entry["file"]), "-Wno-everything"]
    tu = cindex.Index.create().parse(entry["file"], args=args)
    errors = [d for d in tu.diagnostics if d.severity >= cindex.Diagnostic.Error]
    if errors:
        print(f"{entry['file']}: {len(errors)} errors, e.g. {errors[0]}", file=sys.stderr)
    return Unit(tu, llvm, sources).run()


def libclang() -> str:
    root = subprocess.check_output(["em-config", "LLVM_ROOT"], text=True).strip()
    return str(Path(root).parent / "lib" / "libclang.so")


def index(commands: list[dict], llvm: Path, sources: set[str]) -> dict:
    units = [c for c in commands if c["file"].startswith(f"{llvm}/") and c["file"][len(str(llvm)) + 1 :] in sources]
    with ProcessPoolExecutor(initializer=init, initargs=(emscripten_flags(), llvm, sources, libclang())) as pool:
        results = list(pool.map(index_unit, units))

    definitions: dict[str, Location] = {}
    for r in results:
        definitions.update(r.definitions)
    paths = sorted(sources)
    ids = {p: i for i, p in enumerate(paths)}
    calls: dict[str, set[tuple[int, int, int, int]]] = defaultdict(set)
    patterns: dict[str, dict[str, dict]] = defaultdict(dict)
    for r in results:
        for path, line, column, where in r.calls:
            target = definitions.get(where) if isinstance(where, str) else where
            if target is not None:
                calls[path].add((line, column, ids[target[0]], target[1]))
        for (path, line, column), pattern in r.patterns.items():
            patterns[path][f"{line}:{column}"] = pattern
    return {
        "paths": paths,
        "calls": {p: [list(c) for c in sorted(cs)] for p, cs in sorted(calls.items())},
        "patterns": dict(sorted(patterns.items())),
    }


def main(argv: list[str]) -> int:
    if len(argv) != 5:
        print(__doc__, file=sys.stderr)
        return 2
    commands = json.loads(Path(argv[1]).read_text())
    llvm, sources_dir = Path(argv[2]).resolve(), Path(argv[3])
    sources = {str(p.relative_to(sources_dir)) for p in sources_dir.rglob("*") if p.is_file()}
    result = index(commands, llvm, sources)
    Path(argv[4]).write_text(json.dumps(result, separators=(",", ":")))
    calls = sum(len(c) for c in result["calls"].values())
    patterns = sum(len(p) for p in result["patterns"].values())
    print(f"{calls} calls and {patterns} match patterns in {len(result['calls'])} sources")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
