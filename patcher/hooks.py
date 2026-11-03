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

# A value is destroyed: the runtime no longer reads it (it describes values again once
# they are inserted).
DELETE = FunctionEntry(
    name="delete",
    candidates=("Value::~Value",),
    statement="llvm_obs::on_delete(this);",
)


def iteration(pass_name: str, candidates: tuple[str, ...]) -> FunctionEntry:
    return FunctionEntry(
        name=f"iteration:{pass_name}",
        candidates=candidates,
        statement=f'llvm_obs::IterationScope llvm_obs_iteration("{pass_name}");',
    )


@dataclass(frozen=True)
class VisitScopeHook:
    """`visit(*I)` -> `(llvm_obs::VisitScope(*I), visit(*I))` in the body of the first
    function found among `candidates`: the temporary scope lasts as long as the visit."""

    candidates: tuple[str, ...]
    name: str = "visit"

    def points(self, src: SourceFile) -> list[Point]:
        found = {src.text(m["name"][0]).decode(): m for m in src.matches(self._functions)}
        for candidate in self.candidates:
            if match := found.get(candidate):
                body = match["open"][0].parent
                return [
                    (
                        Insertion(call["call"][0].start_byte, b"(llvm_obs::VisitScope(" + src.text(call["argument"][0]) + b"), "),
                        Insertion(call["call"][0].end_byte, b")"),
                    )
                    for call in src.matches(self._calls, body)
                ]
        return []

    @cached_property
    def _functions(self) -> Query:
        return query(queries.function_entry(self.candidates))

    @cached_property
    def _calls(self) -> Query:
        return query(queries.calls_to("visit"))


MATCH_BEGIN = b"(llvm_obs::match_begin(), llvm_obs::match_end("


@dataclass(frozen=True)
class MatchHook:
    """`match(V, P)` -> `(llvm_obs::match_begin(), llvm_obs::match_end(match(V, P)))`:
    delimits each call of PatternMatch's match, whose matchers MatcherHooks record."""

    name: str = "match"

    def points(self, src: SourceFile) -> list[Point]:
        return [
            (Insertion(m["call"][0].start_byte, MATCH_BEGIN), Insertion(m["call"][0].end_byte, b"))"))
            for m in src.matches(queries.MATCH_CALLS)
        ]


@dataclass(frozen=True)
class MatcherHooks:
    """In each matcher's `match` method (a `match` defined in a class body):
    - `llvm_obs::MatcherScope llvm_obs_matcher("<class>", __LINE__, <value>);` first, the
      value being the method's first pointer parameter (or nullptr);
    - `return X;` -> `return llvm_obs_matcher.result(X);`;
    - an assignment to one of the class's members, `M = X` or `*M = X`, ->
      `M = llvm_obs_matcher.bound("M", X)`: what the matcher binds.
    Returns and assignments of nested lambdas are left alone."""

    name: str = "matchers"

    def points(self, src: SourceFile) -> list[Point]:
        classes = [(m["name"][0], m["body"][0]) for m in src.matches(queries.CLASS_BODIES)]
        points: list[Point] = []
        for method in src.matches(queries.MATCH_METHODS):
            node = method["method"][0]
            owner = _innermost(node, classes)
            if owner is None:
                continue  # a free function
            name, body = owner
            members = {src.text(m).decode() for m in src.captures(queries.MEMBERS, body).get("member", [])}
            points.append(self._scope(src, method, src.text(name).decode()))
            points += self._results(src, method["body"][0])
            points += self._bindings(src, method["body"][0], members)
        return points

    def _scope(self, src: SourceFile, method: dict[str, list[Node]], class_name: str) -> Point:
        pointers = src.captures(queries.POINTER_PARAMETERS, method["params"][0]).get("parameter", [])
        value = src.text(min(pointers, key=lambda n: n.start_byte)).decode() if pointers else "nullptr"
        statement = f' llvm_obs::MatcherScope llvm_obs_matcher("{class_name}", __LINE__, {value});'
        return (Insertion(method["open"][0].end_byte, statement.encode()),)

    def _results(self, src: SourceFile, body: Node) -> list[Point]:
        return [
            (Insertion(v.start_byte, b"llvm_obs_matcher.result("), Insertion(v.end_byte, b")"))
            for v in _own_returns(src, body)
        ]

    def _bindings(self, src: SourceFile, body: Node, members: set[str]) -> list[Point]:
        nested = src.captures(queries.NESTED_SCOPES, body).get("scope", [])
        points: list[Point] = []
        for m in src.matches(queries.ASSIGNMENTS, body):
            target, value = src.text(m["target"][0]).decode(), m["value"][0]
            if target in members and not any(_within(value, scope) for scope in nested):
                opening = f'llvm_obs_matcher.bound("{target}", '.encode()
                points.append((Insertion(value.start_byte, opening), Insertion(value.end_byte, b")")))
        return points


def _innermost(node: Node, classes: list[tuple[Node, Node]]) -> tuple[Node, Node] | None:
    """The innermost (name, body) of `classes` whose body contains `node`."""
    owners = [(name, body) for name, body in classes if _within(node, body)]
    return min(owners, key=lambda c: c[1].end_byte - c[1].start_byte, default=None)
