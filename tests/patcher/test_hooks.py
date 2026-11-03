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


def test_iteration_scope_opens_the_body():
    hook = hooks.iteration("instcombine", ("InstCombinerImpl::run", "InstCombiner::run"))
    out = patch(hook, """
        bool InstCombiner::run() {
          return false;
        }
        """)
    assert 'bool InstCombiner::run() { llvm_obs::IterationScope llvm_obs_iteration("instcombine");' in out


def test_visit_scope_wraps_the_visit_call():
    hook = hooks.VisitScopeHook(("InstCombinerImpl::run", "InstCombiner::run"))
    out = patch(hook, """
        bool InstCombinerImpl::run() {
          while (!Worklist.isEmpty()) {
            if (Instruction *Result = visit(*I)) {
              Worklist.add(Result);
            }
          }
          return visitor.visit(*J);
        }
        void other() { visit(*I); }
        """)
    assert "if (Instruction *Result = (llvm_obs::VisitScope(*I), visit(*I))) {" in out
    assert out.count("VisitScope") == 1  # not member calls, nor other functions


def test_match_hook_wraps_pattern_match_calls():
    out = patch(hooks.MatchHook(), """
        Value *f(Value *Op0, Value *Op1) {
          if (match(Op1, m_Zero()) && PatternMatch::match(Op0, m_One()))
            return Op0;
          return P.match(Op0) || match(Op0) ? Op1 : nullptr;
        }
        """)
    begin = "llvm_obs::match_begin(), llvm_obs::match_end("
    assert f"if (({begin}match(Op1, m_Zero()))) && ({begin}PatternMatch::match(Op0, m_One()))))" in out
    assert "return P.match(Op0) || match(Op0) ?" in out  # a matcher's own match, and one argument


MATCHERS = """
template <typename Class> struct bind_ty {
  Class *&VR;
  bind_ty(Class *&V) : VR(V) {}
  template <typename ITy> bool match(ITy *V) const {
    if (auto *CV = dyn_cast<Class>(V)) {
      VR = CV;
      return true;
    }
    auto Local = V;
    Local = nullptr;
    return false;
  }
};
struct shuffle_ty {
  ArrayRef<int> &MaskRef;
  bool match(ArrayRef<int> Mask) { MaskRef = Mask; return [&] { return true; }(); }
};
template <typename Val, typename Pattern> bool match(Val *V, const Pattern &P) { return P.match(V); }
"""


def test_matcher_hooks_record_runs_results_and_bindings():
    out = patch(hooks.MatcherHooks(), MATCHERS)
    assert 'bool match(ITy *V) const { llvm_obs::MatcherScope llvm_obs_matcher("bind_ty", __LINE__, V);' in out
    assert 'VR = llvm_obs_matcher.bound("VR", CV);' in out
    assert "return llvm_obs_matcher.result(true);" in out
    assert "return llvm_obs_matcher.result(false);" in out
    assert "Local = nullptr;" in out  # not a member


def test_matcher_hooks_without_a_value_and_with_a_lambda():
    out = patch(hooks.MatcherHooks(), MATCHERS)
    assert 'bool match(ArrayRef<int> Mask) { llvm_obs::MatcherScope llvm_obs_matcher("shuffle_ty", __LINE__, nullptr);' in out
    assert 'MaskRef = llvm_obs_matcher.bound("MaskRef", Mask);' in out
    assert "return llvm_obs_matcher.result([&] { return true; }());" in out  # the lambda's own return stays
    assert "bool match(Val *V, const Pattern &P) { return P.match(V); }" in out  # a free function


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
