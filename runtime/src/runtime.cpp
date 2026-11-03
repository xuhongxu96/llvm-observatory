// The observatory runtime: turns hook calls into events for the host.
//
//   iteration_begin {iteration, pass}
//   visit_begin     {iteration, visit, instruction: Description}
//   value           {iteration, visit?, value: Description}
//   replace         {iteration, visit?, old: Description, new: Description}
//   describe        {iteration, value: Description}: a value described as <badref> (in
//                   no function yet), described again once inserted
//   segment         {iteration, visit?, segment}, followed by the segment's coverage profile
//   visit_end       {iteration, visit}
//   match           {iteration, visit?, file, line, column, matchers: [Matcher]}: a call
//                   of PatternMatch's match(V, P), reported when it returns
//
// Matcher: {name, line, value?, result?, bound: [{name, value}], matchers: [Matcher]}, one
// run of a matcher's match method: the value it examined, whether it matched, what it
// bound, and the matchers it ran.
//   iteration_end   {iteration, ir: the module after the iteration}
//
// Description: {ptr, ir, opcode?, fn?, bb?, debug_loc?} (empty fields are omitted).
// Only `value` and `replace` carry the call stack (the host captures it): it says where
// the fold made or replaced the value.
// Events are recorded only inside an iteration: outside one, Value::doRAUW is also used
// by the IR parser and others, which are not under observation. `visit` is set inside a
// visit of an instruction by InstCombine (numbered from 1 over the run).
//
// Coverage comes in segments: each visit is one, and so is the code of an iteration
// before, between and after visits. The counters are reset at the start of each, so an
// iteration's coverage is the merge of its segments.
#include "llvm_observatory/hooks.h"
#include "llvm_observatory/matchers.h"
#include "llvm_observatory/session.h"

#include "host.h"
#include "json.h"

#include "llvm/IR/BasicBlock.h"
#include "llvm/IR/DebugInfoMetadata.h"
#include "llvm/IR/Function.h"
#include "llvm/IR/Instructions.h"
#include "llvm/IR/Instruction.h"
#include "llvm/IR/Module.h"
#include "llvm/ADT/APFloat.h"
#include "llvm/ADT/APInt.h"
#include "llvm/ADT/SmallString.h"
#include "llvm/IR/Type.h"
#include "llvm/IR/Value.h"
#include "llvm/Support/raw_ostream.h"

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <set>
#include <string>
#include <vector>

// The profile runtime (compiler-rt), linked by -fprofile-instr-generate.
extern "C" void __llvm_profile_reset_counters(void);
extern "C" unsigned long long __llvm_profile_get_size_for_buffer(void);
extern "C" int __llvm_profile_write_buffer(char *Buffer);

namespace llvm_obs {
namespace {

// The matchers of one match(V, P) call, as a tree.
struct MatcherRun {
  std::string Name;
  int Line;
  std::string Value; // empty if none
  int Result = -1;   // -1: did not return (e.g. through an exception)
  std::vector<std::pair<std::string, std::string>> Bound;
  std::vector<int> Children;
};

struct MatchCall {
  std::string File;
  int Line = 0;
  int Column = 0;
  std::vector<MatcherRun> Runs;
  std::vector<int> Roots;
  std::vector<int> Open; // the matchers running, innermost last
};

struct State {
  const llvm::Module *Module = nullptr; // the module under observation
  long Iteration = 0;                 // 1-based number of the current or last iteration
  long Visit = 0;                     // the current visit; 0 = between visits
  long Visits = 0;                    // visits so far
  long Segments = 0;                  // coverage segments so far
  bool InCall = false;                // inside a recorded match(V, P) call
  int Calls = 0;                      // nesting of match calls
  MatchCall Call;                     // the outermost one
  int Depth = 0;                      // nesting of IterationScope; 0 = not observing
  std::set<const llvm::Value *> Seen; // values already reported in this iteration
  // Values described as `<badref>` (in no function yet: InstCombine inserts a fold's new
  // instruction after the visit returns), to describe again once they are inserted.
  std::set<const llvm::Value *> Unplaced;
};

State &state() {
  static State S;
  return S;
}

std::string pointer(const void *P) {
  char Buf[24];
  std::snprintf(Buf, sizeof Buf, "0x%zx", reinterpret_cast<size_t>(P));
  return Buf;
}

// What `Print` writes to a raw_ostream, as a string.
template <typename PrintFn> std::string printed(const PrintFn &Print) {
  std::string S;
  llvm::raw_string_ostream OS(S);
  Print(OS);
  return OS.str();
}

// An instruction prints as itself; every other value (constant, argument, global) as an
// operand with its type, e.g. `i32 %x`.
std::string ir(const llvm::Value &V) {
  if (llvm::isa<llvm::Instruction>(V))
    return printed([&](llvm::raw_ostream &OS) { V.print(OS); });
  return printed([&](llvm::raw_ostream &OS) { V.printAsOperand(OS, true); });
}

std::string block_name(const llvm::BasicBlock &BB) {
  if (BB.hasName())
    return BB.getName().str();
  return printed([&](llvm::raw_ostream &OS) { BB.printAsOperand(OS, false); });
}

std::string debug_loc(const llvm::Instruction &I) {
  const llvm::DILocation *Loc = I.getDebugLoc().get();
  if (!Loc)
    return "";
  return Loc->getFilename().str() + ":" + std::to_string(Loc->getLine()) + ":" +
         std::to_string(Loc->getColumn());
}

void describe(Json &J, const char *Key, const llvm::Value &V) {
  const std::string Text = ir(V);
  if (Text.find("<badref>") != std::string::npos)
    state().Unplaced.insert(&V);
  J.open(Key).field("ptr", pointer(&V)).field("ir", Text);
  if (const auto *I = llvm::dyn_cast<llvm::Instruction>(&V)) {
    J.field("opcode", I->getOpcodeName());
    if (const llvm::BasicBlock *BB = I->getParent()) {
      J.field("bb", block_name(*BB));
      if (const llvm::Function *F = BB->getParent())
        J.field("fn", F->getName().str());
    }
    const std::string Loc = debug_loc(*I);
    if (!Loc.empty())
      J.field("debug_loc", Loc);
  }
  J.close();
}

Json event(const char *Type) {
  const State &S = state();
  Json J;
  J.open().field("type", Type).field("iteration", S.Iteration);
  if (S.Visit)
    J.field("visit", S.Visit);
  return J;
}

// Describes again the values described as <badref> that have been inserted since: a
// `describe` event each, which updates their records.
void describe_placed() {
  State &S = state();
  std::vector<const llvm::Value *> Placed;
  for (const llvm::Value *V : S.Unplaced)
    if (ir(*V).find("<badref>") == std::string::npos)
      Placed.push_back(V);
  for (const llvm::Value *V : Placed) {
    S.Unplaced.erase(V);
    Json J = event("describe");
    describe(J, "value", *V);
    host::emit(J.close().str());
  }
}

std::vector<char> profile() {
  std::vector<char> Buffer(__llvm_profile_get_size_for_buffer());
  __llvm_profile_write_buffer(Buffer.data());
  return Buffer;
}

std::string operand(const llvm::Value &V) {
  return printed([&](llvm::raw_ostream &OS) { V.printAsOperand(OS, true); });
}

void describe_runs(Json &J, const MatchCall &Call, const std::vector<int> &Runs) {
  J.array("matchers");
  for (int I : Runs) {
    const MatcherRun &R = Call.Runs[I];
    J.open().field("name", R.Name).field("line", R.Line);
    if (!R.Value.empty())
      J.field("value", R.Value);
    if (R.Result >= 0)
      J.field("result", R.Result == 1);
    J.array("bound");
    for (const auto &B : R.Bound)
      J.open().field("name", B.first).field("value", B.second).close();
    J.close_array();
    describe_runs(J, Call, R.Children);
    J.close();
  }
  J.close_array();
}

void add_binding(int Node, const char *Name, std::string Text) {
  State &S = state();
  if (S.InCall && Node < static_cast<int>(S.Call.Runs.size()))
    S.Call.Runs[Node].Bound.emplace_back(Name, std::move(Text));
}

// Reports the coverage since the last reset as a segment, and starts the next one.
void end_segment() {
  State &S = state();
  ++S.Segments;
  host::emit(event("segment").field("segment", S.Segments).close().str());
  host::emit_profile(S.Segments, profile());
  __llvm_profile_reset_counters();
}

// CmpInst::Predicate by name, as the IR writes it (its values are the same in every
// LLVM version), or null.
const char *predicate_name(long long P) {
  static const char *const FCmp[] = {"false", "oeq", "ogt", "oge", "olt", "ole", "one", "ord",
                                     "uno",   "ueq", "ugt", "uge", "ult", "ule", "une", "true"};
  static const char *const ICmp[] = {"eq", "ne", "ugt", "uge", "ult", "ule", "sgt", "sge", "slt", "sle"};
  if (P >= 0 && P < 16)
    return FCmp[P];
  if (P >= 32 && P < 42)
    return ICmp[P - 32];
  return nullptr;
}

// A pointer that can point at a Value. Some functions return a sentinel instead
// (InstCombiner::getFreelyInvertedImpl: `(Value *)1` for "invertible", without a builder).
bool is_value(const llvm::Value *V) {
  return V && reinterpret_cast<std::uintptr_t>(V) % alignof(llvm::Value) == 0;
}

} // namespace

void on_value(const llvm::Value *V) {
  State &S = state();
  if (S.Depth == 0 || !is_value(V) || !S.Seen.insert(V).second)
    return;
  Json J = event("value");
  describe(J, "value", *V);
  host::emit(J.close().str(), /*Stack=*/true); // where the fold made it
}

void on_delete(const llvm::Value *V) {
  State &S = state();
  if (S.Depth == 0)
    return;
  S.Unplaced.erase(V);
  S.Seen.erase(V); // its address may be reused
}

void on_replace(const llvm::Value *Old, const llvm::Value *New) {
  if (state().Depth == 0 || !Old || !New)
    return;
  Json J = event("replace");
  describe(J, "old", *Old);
  describe(J, "new", *New);
  host::emit(J.close().str(), /*Stack=*/true); // where it was replaced
}

void start_session(const llvm::Module &M) {
  state() = State();
  state().Module = &M;
}

IterationScope::IterationScope(const char *Pass) {
  State &S = state();
  if (S.Depth++ > 0)
    return;
  ++S.Iteration;
  S.Seen.clear();
  S.Unplaced.clear();
  __llvm_profile_reset_counters();
  host::emit(event("iteration_begin").field("pass", Pass).close().str());
}

IterationScope::~IterationScope() {
  State &S = state();
  if (--S.Depth > 0)
    return;
  end_segment();
  describe_placed();
  S.Unplaced.clear();
  Json End = event("iteration_end");
  if (S.Module)
    End.field("ir", printed([&](llvm::raw_ostream &OS) { S.Module->print(OS, nullptr); }));
  host::emit(End.close().str());
}

VisitScope::VisitScope(const llvm::Instruction &I) {
  State &S = state();
  if (S.Depth == 0 || S.Visit)
    return;
  end_segment(); // the iteration's code before this visit
  describe_placed(); // what the previous visit made, inserted since
  S.Visit = ++S.Visits;
  Json J = event("visit_begin");
  describe(J, "instruction", I);
  host::emit(J.close().str());
}

VisitScope::~VisitScope() {
  State &S = state();
  if (S.Depth == 0 || !S.Visit)
    return;
  end_segment();
  host::emit(event("visit_end").close().str());
  S.Visit = 0;
}

void match_begin(const char *File, int Line, int Column) {
  State &S = state();
  if (S.Calls++ > 0 || S.Depth == 0)
    return;
  S.InCall = true;
  S.Call = MatchCall();
  S.Call.File = File;
  S.Call.Line = Line;
  S.Call.Column = Column;
}

bool match_end(bool Matched) {
  State &S = state();
  if (--S.Calls > 0 || !S.InCall)
    return Matched;
  Json J = event("match");
  J.field("file", S.Call.File).field("line", S.Call.Line).field("column", S.Call.Column);
  describe_runs(J, S.Call, S.Call.Roots);
  host::emit(J.close().str());
  S.InCall = false;
  return Matched;
}

MatcherScope::MatcherScope(const char *Name, int Line, const void *Operand, int) {
  const auto *V = static_cast<const llvm::Value *>(Operand);
  State &S = state();
  if (!S.InCall)
    return;
  MatchCall &Call = S.Call;
  Node = static_cast<int>(Call.Runs.size());
  Call.Runs.push_back(MatcherRun{Name, Line, V ? operand(*V) : std::string(), -1, {}, {}});
  (Call.Open.empty() ? Call.Roots : Call.Runs[Call.Open.back()].Children).push_back(Node);
  Call.Open.push_back(Node);
}

MatcherScope::~MatcherScope() {
  State &S = state();
  if (Node >= 0 && S.InCall && !S.Call.Open.empty())
    S.Call.Open.pop_back();
}

bool MatcherScope::result(bool Matched) {
  State &S = state();
  if (Node >= 0 && S.InCall)
    S.Call.Runs[Node].Result = Matched;
  return Matched;
}

namespace detail {
void note_value(int Node, const char *Name, const void *Value) {
  const auto *V = static_cast<const llvm::Value *>(Value);
  add_binding(Node, Name, V ? operand(*V) : "null");
}
void note_apint(int Node, const char *Name, const void *Value) {
  const auto *V = static_cast<const llvm::APInt *>(Value);
  add_binding(Node, Name, V ? printed([&](llvm::raw_ostream &OS) { V->print(OS, /*isSigned=*/true); }) : "null");
}
void note_apfloat(int Node, const char *Name, const void *Value) {
  const auto *V = static_cast<const llvm::APFloat *>(Value);
  llvm::SmallString<32> Text;
  if (V)
    V->toString(Text);
  add_binding(Node, Name, V ? std::string(Text.str()) : "null");
}
void note_integer(int Node, const char *Name, long long V) { add_binding(Node, Name, std::to_string(V)); }
void note_type(int Node, const char *Name, const void *T) {
  const auto *Ty = static_cast<const llvm::Type *>(T);
  add_binding(Node, Name, Ty ? printed([&](llvm::raw_ostream &OS) { Ty->print(OS); }) : "null");
}
void note_enum(int Node, const char *Name, long long V, const char *Function) {
  const char *Text = std::strstr(Function, "CmpInst::Predicate") ? predicate_name(V) : nullptr;
  add_binding(Node, Name, Text ? Text : std::to_string(V));
}
void note_predicate(int Node, const char *Name, int Predicate, bool SameSign) {
  const char *Text = predicate_name(Predicate);
  std::string Shown = Text ? Text : std::to_string(Predicate);
  add_binding(Node, Name, SameSign ? "samesign " + Shown : Shown);
}
void note_integers(int Node, const char *Name, const int *Data, std::size_t Size) {
  std::string Shown = "<";
  for (std::size_t I = 0; I < Size; ++I)
    Shown += (I ? ", " : "") + (Data[I] < 0 ? std::string("poison") : std::to_string(Data[I]));
  add_binding(Node, Name, Shown + ">");
}
} // namespace detail

} // namespace llvm_obs

