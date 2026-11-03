"""The hooks: each finds its points in a source file and returns, for each point, the
insertions that call the runtime (runtime/include/llvm_observatory/hooks.h)."""

from __future__ import annotations

from dataclasses import dataclass
from functools import cached_property
from typing import Protocol

from tree_sitter import Node, Query

from . import queries
from .source import Insertion, SourceFile, query


# The insertions of one hook point, e.g. the opening and closing half of a wrap.
Point = tuple[Insertion, ...]


class Hook(Protocol):
    name: str

    def points(self, src: SourceFile) -> list[Point]: ...


@dataclass(frozen=True)
class ValueReturns:
    """`return X;` -> `return llvm_obs::observed(X);` in every function that returns a
    pointer to a value-like type. Returns of nested lambdas and local functions are left
    alone: they return from a different scope."""

    name: str = "value-returns"

    def points(self, src: SourceFile) -> list[Point]:
        return [
            (Insertion(value.start_byte, b"llvm_obs::observed("), Insertion(value.end_byte, b")"))
            for match in src.matches(queries.VALUE_FUNCTIONS)
            for value in _own_returns(src, match["body"][0])
        ]


def _own_returns(src: SourceFile, body: Node) -> list[Node]:
    nested = src.captures(queries.NESTED_SCOPES, body).get("scope", [])
    values = src.captures(queries.RETURN_VALUES, body).get("value", [])
    return [v for v in values if not any(_within(v, scope) for scope in nested)]


def _within(node: Node, scope: Node) -> bool:
    return scope.start_byte <= node.start_byte and node.end_byte <= scope.end_byte


@dataclass(frozen=True)
class FunctionEntry:
    """A statement inserted right after the opening brace of the first function found
    among `candidates` (qualified names, in order of preference: spellings differ
    between LLVM versions). `{first_param}` in the statement is replaced by the name of
    the function's first pointer parameter."""

    name: str
    candidates: tuple[str, ...]
    statement: str

    def points(self, src: SourceFile) -> list[Point]:
        found = {src.text(m["name"][0]).decode(): m for m in src.matches(self._query)}
        for candidate in self.candidates:
            if match := found.get(candidate):
                return [(Insertion(match["open"][0].end_byte, b" " + self._render(src, match)),)]
        return []

    @cached_property
    def _query(self) -> Query:
        return query(queries.function_entry(self.candidates))

    def _render(self, src: SourceFile, match: dict[str, list[Node]]) -> bytes:
        statement = self.statement
        if "{first_param}" in statement:
            params = match.get("first_param")
            if not params:
                raise RuntimeError(f"{src.path}: {self.name}: no pointer parameter")
            statement = statement.replace("{first_param}", src.text(params[0]).decode())
        return statement.encode()


REPLACE = FunctionEntry(
    name="replace",
    candidates=("Value::doRAUW",),
    statement="llvm_obs::on_replace(this, {first_param});",
)


def iteration(pass_name: str, candidates: tuple[str, ...]) -> FunctionEntry:
    return FunctionEntry(
        name=f"iteration:{pass_name}",
        candidates=candidates,
        statement=f'llvm_obs::IterationScope llvm_obs_iteration("{pass_name}");',
    )
