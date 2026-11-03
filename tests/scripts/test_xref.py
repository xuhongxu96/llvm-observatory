"""scripts/xref.py on a small tree: calls resolved by clang, patterns as written. Needs
emcc's libclang (the Nix dev shell)."""

import json
import shutil
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(shutil.which("em-config") is None, reason="needs emscripten (nix develop)")

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import xref  # noqa: E402

PATTERN_MATCH = """
namespace llvm {
struct Value {};
namespace PatternMatch {
template <typename Val, typename Pattern> bool match(Val *V, const Pattern &P) { return P.match(V); }
struct match_bind { Value *&VR; template <typename T> bool match(T *V) const { VR = V; return true; } };
struct is_zero { template <typename T> bool match(T *) const { return false; } };
template <typename L, typename R> struct BinaryOp_match {
  L Left; R Right;
  template <typename T> bool match(T *V) const { return Left.match(V) && Right.match(V); }
};
inline match_bind m_Value(Value *&V) { return {V}; }
inline is_zero m_Zero() { return {}; }
struct specificval_ty { const Value *Val; template <typename T> bool match(T *V) const { return V == Val; } };
inline specificval_ty m_Specific(const Value *V) { return {V}; }
struct m_Mask { int *&Mask; m_Mask(int *&M) : Mask(M) {} bool match(Value *) { return true; } };
template <typename L, typename R> BinaryOp_match<L, R> m_Add(const L &A, const R &B) { return {A, B}; }
} // namespace PatternMatch
} // namespace llvm
"""

SOURCE = """#include "llvm/IR/PatternMatch.h"
using namespace llvm;
using namespace llvm::PatternMatch;
struct PHINode : Value {};
struct BinaryOperator : Value {};
bool recurrence(const PHINode *P, int *&X) { return P; }
bool recurrence(const BinaryOperator *I, int *&X) { return I; }
bool f(BinaryOperator *I, PHINode *P, int *X) {
  Value *A;
  return recurrence(I, X) && recurrence(P, X) && match(I, m_Add(m_Value(A), m_Specific(P))) && match(I, m_Mask(X));
}
"""


def test_xref(tmp_path: Path):
    llvm = tmp_path / "llvm"
    (llvm / "include/llvm/IR").mkdir(parents=True)
    (llvm / "lib").mkdir()
    (llvm / "include/llvm/IR/PatternMatch.h").write_text(PATTERN_MATCH)
    source = llvm / "lib/f.cpp"
    source.write_text(SOURCE)
    commands = [{"file": str(source), "command": f"em++ -std=c++17 -I{llvm}/include -o f.o -c {source}"}]
    sources = {"lib/f.cpp", "include/llvm/IR/PatternMatch.h"}

    out = json.loads(json.dumps(xref.index(commands, llvm, sources)))
    paths = out["paths"]
    calls = {(line, column): (paths[p], target) for line, column, p, target in out["calls"]["lib/f.cpp"]}
    assert calls[(10, 10)] == ("lib/f.cpp", 7)  # recurrence(I, X): the BinaryOperator overload
    assert calls[(10, 30)] == ("lib/f.cpp", 6)  # recurrence(P, X): the PHINode overload

    pattern = out["patterns"]["lib/f.cpp"]["10:50"]
    assert pattern["name"] == "m_Add" and pattern["text"] == "m_Add(m_Value(A), m_Specific(P))"
    assert pattern["classes"] == ["BinaryOp_match"]
    assert [(p["text"], p["classes"], p["vars"]) for p in pattern["args"]] == [
        ("m_Value(A)", ["match_bind"], [{"text": "A", "out": True}]),  # binds A
        ("m_Specific(P)", ["specificval_ty"], [{"text": "P", "out": False}]),  # reads P
    ]
    # A matcher made by its constructor.
    mask = next(p for k, p in out["patterns"]["lib/f.cpp"].items() if p["name"] == "m_Mask")
    assert (mask["text"], mask["vars"]) == ("m_Mask(X)", [{"text": "X", "out": True}])
