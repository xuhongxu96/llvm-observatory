// The hooks of PatternMatch's matchers (the patched PatternMatch.h and
// PatternMatchHelpers.h). Those headers are included all over LLVM, so
// scripts/build_driver.sh force-includes this one into every C++ source. It therefore
// declares no LLVM name: `llvm::Value` would make `Value` ambiguous in the sources that
// use another one (llvm::json::Value). LLVM's types are recognized by their members
// instead, when a matcher is instantiated. It stays C++11: LLVM 8 and 9 build as C++11.
#ifndef LLVM_OBSERVATORY_MATCHERS_H
#define LLVM_OBSERVATORY_MATCHERS_H

// Not under observation itself: no coverage for the hooks.
#pragma clang system_header

#include <cstddef>
#include <type_traits>
#include <utility>

namespace llvm_obs {

namespace detail {
// What a matcher binds, by type. The pointers are type-erased; the runtime casts them back.
void note_value(int Node, const char *Name, const void *V);   // a const llvm::Value *
void note_type(int Node, const char *Name, const void *T);    // a const llvm::Type *
void note_apint(int Node, const char *Name, const void *V);   // a const llvm::APInt *
void note_apfloat(int Node, const char *Name, const void *V); // a const llvm::APFloat *
void note_integer(int Node, const char *Name, long long V);
// An enum, with its type's name (in `Function`: __PRETTY_FUNCTION__ of type_name<E>).
// CmpInst::Predicate is shown by name.
void note_enum(int Node, const char *Name, long long V, const char *Function);
void note_predicate(int Node, const char *Name, int Predicate, bool SameSign); // llvm::CmpPredicate
void note_integers(int Node, const char *Name, const int *Data, std::size_t Size); // ArrayRef<int>

// Overloads of higher rank are tried first.
template <int N> struct Rank : Rank<N - 1> {};
template <> struct Rank<0> {};

template <typename T> const char *type_name() { return __PRETTY_FUNCTION__; }

// An IR value (llvm::Value and its subclasses) has stripPointerCasts, which returns its
// Value base: `const llvm::Value *`.
template <typename P> using ValuePointer = decltype(std::declval<const P &>().stripPointerCasts());

template <typename P>
auto value_of(const P *V, Rank<1>) -> decltype(static_cast<const void *>(ValuePointer<P>())) {
  return static_cast<ValuePointer<P>>(V);
}
template <typename P> const void *value_of(const P *, Rank<0>) { return nullptr; }

template <typename P>
auto note_pointer(int N, const char *Name, const P *X, Rank<4>) -> decltype(void(ValuePointer<P>())) {
  note_value(N, Name, value_of(X, Rank<1>()));
}
// llvm::Type (getTypeID), llvm::APInt (getActiveBits) and llvm::APFloat (bitcastToAPInt).
template <typename P>
auto note_pointer(int N, const char *Name, const P *X, Rank<3>) -> decltype(void(X->getTypeID())) {
  note_type(N, Name, X);
}
template <typename P>
auto note_pointer(int N, const char *Name, const P *X, Rank<2>) -> decltype(void(X->getActiveBits())) {
  note_apint(N, Name, X);
}
template <typename P>
auto note_pointer(int N, const char *Name, const P *X, Rank<1>) -> decltype(void(X->bitcastToAPInt())) {
  note_apfloat(N, Name, X);
}
template <typename P> void note_pointer(int, const char *, const P *, Rank<0>) {} // nothing to show

// llvm::CmpPredicate (hasSameSign; it converts to CmpInst::Predicate) and ranges of int
// (ArrayRef<int>: a shuffle mask).
template <typename T>
auto note_object(int N, const char *Name, const T &X, Rank<2>) -> decltype(void(X.hasSameSign())) {
  note_predicate(N, Name, static_cast<int>(X), X.hasSameSign());
}
template <typename T>
auto note_object(int N, const char *Name, const T &X, Rank<1>)
    -> decltype(void(static_cast<const int *>(X.data())), void(static_cast<std::size_t>(X.size()))) {
  note_integers(N, Name, X.data(), X.size());
}
template <typename T> void note_object(int, const char *, const T &, Rank<0>) {} // nothing to show

template <typename T> void note(int N, const char *Name, T *X) { note_pointer(N, Name, X, Rank<4>()); }
template <typename T>
typename std::enable_if<std::is_integral<T>::value>::type note(int N, const char *Name, T X) {
  note_integer(N, Name, static_cast<long long>(X));
}
template <typename T>
typename std::enable_if<std::is_enum<T>::value>::type note(int N, const char *Name, T X) {
  note_enum(N, Name, static_cast<long long>(X), type_name<T>());
}
template <typename T>
typename std::enable_if<std::is_class<T>::value>::type note(int N, const char *Name, const T &X) {
  note_object(N, Name, X, Rank<2>());
}
} // namespace detail

// One run of a matcher's match method inside a match call (match_begin, in hooks.h): the
// patcher puts `MatcherScope llvm_obs_matcher("<matcher>", __LINE__, <value>);` first in
// the method, `return llvm_obs_matcher.result(X);` for its returns, and
// `Member = llvm_obs_matcher.bound("Member", X);` for what it binds. <value> is the
// method's pointer parameter, or nullptr. Outside a match call, it records nothing.
class MatcherScope {
public:
  template <typename T>
  MatcherScope(const char *Name, int Line, T *V) : MatcherScope(Name, Line, detail::value_of(V, detail::Rank<1>()), 0) {}
  MatcherScope(const char *Name, int Line, std::nullptr_t) : MatcherScope(Name, Line, nullptr, 0) {}
  ~MatcherScope();
  MatcherScope(const MatcherScope &) = delete;
  MatcherScope &operator=(const MatcherScope &) = delete;

  bool result(bool Matched);

  template <typename T> T &&bound(const char *Name, T &&X) {
    if (Node >= 0)
      detail::note(Node, Name, X);
    return std::forward<T>(X);
  }

private:
  // V: a const llvm::Value *, or null.
  MatcherScope(const char *Name, int Line, const void *V, int);

  int Node = -1; // in the current call's matchers; -1 when not recording
};

} // namespace llvm_obs

#endif
