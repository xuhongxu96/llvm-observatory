// The interface between a patched LLVM tree and the observatory runtime. The patcher
// (patcher/hooks.py) inserts calls to these hooks, and the driver build force-includes
// this header into the patched sources. It stays C++14: old LLVM releases build as C++14.
#ifndef LLVM_OBSERVATORY_HOOKS_H
#define LLVM_OBSERVATORY_HOOKS_H

// Not under observation itself: no coverage for the hooks.
#pragma clang system_header

#include <type_traits>
#include <utility>

namespace llvm {
class Value;
} // namespace llvm

namespace llvm_obs {

// A value produced by a fold, simplification or constant fold.
void on_value(const llvm::Value *V);

// `Old` is about to be replaced by `New` everywhere (Value::doRAUW).
void on_replace(const llvm::Value *Old, const llvm::Value *New);

// One iteration of a pass, from construction to destruction. Events are recorded only
// inside an iteration; the coverage profile is reset at its start and reported at its end.
class IterationScope {
public:
  explicit IterationScope(const char *Pass);
  ~IterationScope();
  IterationScope(const IterationScope &) = delete;
  IterationScope &operator=(const IterationScope &) = delete;
};

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
