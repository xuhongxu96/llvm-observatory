// The observatory runtime: turns hook calls into events for the host.
//
//   iteration_begin {iteration, pass}
//   value           {iteration, value: Description}
//   replace         {iteration, old: Description, new: Description}
//   iteration_end   {iteration, ir: the module after the iteration}, followed by the
//                   iteration's coverage profile
//
// Description: {ptr, ir, opcode?, fn?, bb?, debug_loc?} (empty fields are omitted).
// Events are recorded only inside an iteration: outside one, Value::doRAUW is also used
// by the IR parser and others, which are not under observation.
#include "llvm_observatory/hooks.h"
#include "llvm_observatory/session.h"

#include "host.h"
#include "json.h"

#include "llvm/IR/BasicBlock.h"
#include "llvm/IR/DebugInfoMetadata.h"
#include "llvm/IR/Function.h"
#include "llvm/IR/Instruction.h"
#include "llvm/IR/Module.h"
#include "llvm/IR/Value.h"
#include "llvm/Support/raw_ostream.h"

#include <cstdio>
#include <set>
#include <string>
#include <vector>

// The profile runtime (compiler-rt), linked by -fprofile-instr-generate.
extern "C" void __llvm_profile_reset_counters(void);
extern "C" unsigned long long __llvm_profile_get_size_for_buffer(void);
extern "C" int __llvm_profile_write_buffer(char *Buffer);

namespace llvm_obs {
namespace {

struct State {
  const llvm::Module *Module = nullptr; // the module under observation
  long Iteration = 0;                 // 1-based number of the current or last iteration
  int Depth = 0;                      // nesting of IterationScope; 0 = not observing
  std::set<const llvm::Value *> Seen; // values already reported in this iteration
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
  J.open(Key).field("ptr", pointer(&V)).field("ir", ir(V));
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
  Json J;
  J.open().field("type", Type).field("iteration", state().Iteration);
  return J;
}

std::vector<char> profile() {
  std::vector<char> Buffer(__llvm_profile_get_size_for_buffer());
  __llvm_profile_write_buffer(Buffer.data());
  return Buffer;
}

} // namespace

void on_value(const llvm::Value *V) {
  State &S = state();
  if (S.Depth == 0 || !V || !S.Seen.insert(V).second)
    return;
  Json J = event("value");
  describe(J, "value", *V);
  host::emit(J.close().str());
}

void on_replace(const llvm::Value *Old, const llvm::Value *New) {
  if (state().Depth == 0 || !Old || !New)
    return;
  Json J = event("replace");
  describe(J, "old", *Old);
  describe(J, "new", *New);
  host::emit(J.close().str());
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
  __llvm_profile_reset_counters();
  host::emit(event("iteration_begin").field("pass", Pass).close().str());
}

IterationScope::~IterationScope() {
  State &S = state();
  if (--S.Depth > 0)
    return;
  Json End = event("iteration_end");
  if (S.Module)
    End.field("ir", printed([&](llvm::raw_ostream &OS) { S.Module->print(OS, nullptr); }));
  host::emit(End.close().str());
  host::emit_profile(S.Iteration, profile());
}

} // namespace llvm_obs

