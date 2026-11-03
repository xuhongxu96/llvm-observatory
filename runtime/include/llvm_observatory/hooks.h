// The interface between the patched observed sources (and Value.cpp) and the
// observatory runtime. The patcher (patcher/hooks.py) inserts calls to these hooks, and
// driver/CMakeLists.txt force-includes this header into those sources. The matchers'
// hooks are in matchers.h. It stays C++11: LLVM 8 and 9 build as C++11.
#ifndef LLVM_OBSERVATORY_HOOKS_H
#define LLVM_OBSERVATORY_HOOKS_H

// Not under observation itself: no coverage for the hooks.
#pragma clang system_header

#include <cstddef>
#include <type_traits>
#include <utility>

namespace llvm {
class Instruction;
class Value;
} // namespace llvm

namespace llvm_obs {

// A value produced by a fold, simplification or constant fold.
void on_value(const llvm::Value *V);

// `Old` is about to be replaced by `New` everywhere (Value::doRAUW).
void on_replace(const llvm::Value *Old, const llvm::Value *New);

// `V` is being destroyed (Value::~Value).
void on_delete(const llvm::Value *V);

// One iteration of a pass, from construction to destruction. Events are recorded only
// inside an iteration.
class IterationScope {
public:
  explicit IterationScope(const char *Pass);
  ~IterationScope();
  IterationScope(const IterationScope &) = delete;
  IterationScope &operator=(const IterationScope &) = delete;
};

// One visit of an instruction by InstCombine: `visit(*I)` becomes
// `(VisitScope(*I), visit(*I))`, so the temporary lives as long as the visit.
class VisitScope {
public:
  explicit VisitScope(const llvm::Instruction &I);
  ~VisitScope();
  VisitScope(const VisitScope &) = delete;
  VisitScope &operator=(const VisitScope &) = delete;
};

// One call of PatternMatch's match(V, Pattern) from an observed source:
// `match(V, P)` becomes `(match_begin(), match_end(match(V, P)))`. (A temporary scope
// object would live to the end of the full expression, past the other match calls of a
// condition.) Its matchers report to it (MatcherScope, in matchers.h). The defaults
// record where it is: the column is that of match_begin, which the patcher puts just
// before `match`. A match call inside another one is part of the outer one.
void match_begin(const char *File = __builtin_FILE(), int Line = __builtin_LINE(), int Column = __builtin_COLUMN());
bool match_end(bool Matched);

template <typename T>
using IsValue = std::is_convertible<T &&, const llvm::Value *>;

// `return X;` becomes `return observed(X);`. X is passed through unchanged; it is
// recorded when it converts to a Value pointer (Instruction *, Constant *, Use &, ...).
template <typename T>
typename std::enable_if<IsValue<T>::value, T &&>::type observed(T &&X) {
  on_value(static_cast<const llvm::Value *>(X));
  return std::forward<T>(X);
}

template <typename T>
typename std::enable_if<!IsValue<T>::value, T &&>::type observed(T &&X) {
  return std::forward<T>(X);
}

} // namespace llvm_obs

#endif
