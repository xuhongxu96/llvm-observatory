"""Each hook on small C++ snippets."""

from pathlib import Path
from textwrap import dedent

import pytest

from patcher import hooks
from patcher.source import Insertion, SourceFile


def patch(hook, code: str) -> str:
    src = SourceFile(Path("test.cpp"), dedent(code).encode())
    points = hook.points(src)
    return src.apply([ins for point in points for ins in point]).decode()


VALUE_RETURNS = hooks.ValueReturns()


def test_wraps_returns_of_value_functions():
    out = patch(VALUE_RETURNS, """
        Instruction *InstCombinerImpl::visitAdd(BinaryOperator &I) {
          if (Value *V = simplifyAddInst(I.getOperand(0)))
            return replaceInstUsesWith(I, V);
          return nullptr;
        }
        """)
    assert "return llvm_obs::observed(replaceInstUsesWith(I, V));" in out
    assert "return nullptr;" in out


def test_matches_qualified_and_derived_return_types():
    out = patch(VALUE_RETURNS, """
        static llvm::Constant *fold(int X) { return getC(X); }
        ConstantInt *folded(int X) { return getCI(X); }
        """)
    assert "return llvm_obs::observed(getC(X));" in out
    assert "return llvm_obs::observed(getCI(X));" in out


def test_skips_other_return_types():
    code = """
        bool isFree(Value *V) { return V != nullptr; }
        Value **slot(Value **P) { return P; }
        Value &ref(Value *V) { return *V; }
        """
    assert patch(VALUE_RETURNS, code) == dedent(code)


def test_skips_nested_lambdas_and_braced_returns():
    out = patch(VALUE_RETURNS, """
        Value *outer(Value *A) {
          auto Pick = [&](Value *B) { return B; };
          struct Local { int *get() { return nullptr; } };
          if (!A)
            return {};
          return Pick(A);
        }
        """)
    assert "return B;" in out
    assert "return {};" in out
    assert "return llvm_obs::observed(Pick(A));" in out
    assert out.count("llvm_obs::observed") == 1


def test_wraps_template_and_inline_member_functions():
    out = patch(VALUE_RETURNS, """
        template <typename T> Instruction *make(T X) { return create(X); }
        class Combiner {
          Instruction *replace(Instruction &I) { return &I; }
        };
        """)
    assert "return llvm_obs::observed(create(X));" in out
    assert "return llvm_obs::observed(&I);" in out


def test_replace_hook_uses_the_first_parameter():
    out = patch(hooks.REPLACE, """
        void Value::doRAUW(Value *New, ReplaceMetadataUses ReplaceMetaUses) {
          assert(New);
        }
        void Value::replaceAllUsesWith(Value *New) { doRAUW(New, ReplaceMetadataUses::Yes); }
        """)
    assert "{ llvm_obs::on_replace(this, New);\n  assert(New);" in out
    assert out.count("on_replace") == 1


def test_replace_hook_falls_back_to_older_spelling():
    out = patch(hooks.REPLACE, """
        void Value::replaceAllUsesWith(Value *NewV) {
          use_begin();
        }
        """)
    assert "{ llvm_obs::on_replace(this, NewV);" in out


def test_iteration_scope_opens_the_body():
    hook = hooks.iteration("instcombine", ("InstCombinerImpl::run", "InstCombiner::run"))
    out = patch(hook, """
        bool InstCombiner::run() {
          return false;
        }
        """)
    assert 'bool InstCombiner::run() { llvm_obs::IterationScope llvm_obs_iteration("instcombine");' in out


def test_no_match_gives_no_points():
    hook = hooks.iteration("instcombine", ("InstCombinerImpl::run",))
    src = SourceFile(Path("t.cpp"), b"void InstCombinePass::run() {}")
    assert hook.points(src) == []


def test_patching_preserves_line_numbers():
    code = dedent("""
        Value *f(Value *A,
                 Value *B) {
          return
              A ? A : B;
        }
        """)
    assert patch(VALUE_RETURNS, code).count("\n") == code.count("\n")


def test_insertions_may_not_contain_newlines():
    with pytest.raises(ValueError):
        Insertion(0, b"a\nb")
