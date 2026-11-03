// The observed program: runs InstCombine and AggressiveInstCombine on /work/input.ll and
// writes the result to /work/output.ll. The host (js/src/core/driver.ts) writes the input
// into the module's in-memory file system and calls main() once per run.
#include "llvm_observatory/session.h"

#include "llvm/Analysis/CGSCCPassManager.h"
#include "llvm/Analysis/LoopAnalysisManager.h"
#include "llvm/Config/llvm-config.h"
#include "llvm/IR/LLVMContext.h"
#include "llvm/IR/Module.h"
#include "llvm/IR/PassManager.h"
#include "llvm/IRReader/IRReader.h"
#include "llvm/Passes/PassBuilder.h"
#include "llvm/Support/FileSystem.h"
#include "llvm/Support/SourceMgr.h"
#include "llvm/Support/raw_ostream.h"
#include "llvm/Transforms/AggressiveInstCombine/AggressiveInstCombine.h"
#include "llvm/Transforms/InstCombine/InstCombine.h"

#include <type_traits>
#include <utility>

namespace {

const char *const InputPath = "/work/input.ll";
const char *const OutputPath = "/work/output.ll";

// sys::fs::OF_Text was F_Text before LLVM 7.
#if LLVM_VERSION_MAJOR < 7
const auto TextFile = llvm::sys::fs::F_Text;
#else
const auto TextFile = llvm::sys::fs::OF_Text;
#endif

// PassBuilder takes an LLVMContext only in some releases.
template <typename PB = llvm::PassBuilder> PB makePassBuilder(llvm::LLVMContext &Ctx) {
  if constexpr (std::is_constructible_v<PB, llvm::LLVMContext &>)
    return PB(Ctx);
  else
    return PB();
}

void runPasses(llvm::Module &M) {
  llvm::LoopAnalysisManager LAM;
  llvm::FunctionAnalysisManager FAM;
  llvm::CGSCCAnalysisManager CGAM;
  llvm::ModuleAnalysisManager MAM;

  llvm::LLVMContext &Ctx = M.getContext();
  llvm::PassBuilder PB = makePassBuilder(Ctx);
  PB.registerModuleAnalyses(MAM);
  PB.registerCGSCCAnalyses(CGAM);
  PB.registerFunctionAnalyses(FAM);
  PB.registerLoopAnalyses(LAM);
  PB.crossRegisterProxies(LAM, FAM, CGAM, MAM);

  llvm::FunctionPassManager FPM;
  FPM.addPass(llvm::InstCombinePass());
  FPM.addPass(llvm::AggressiveInstCombinePass());

  llvm::ModulePassManager MPM;
  MPM.addPass(llvm::createModuleToFunctionPassAdaptor(std::move(FPM)));
  MPM.run(M, MAM);
}

bool writeModule(const llvm::Module &M) {
  std::error_code EC;
  llvm::raw_fd_ostream Out(OutputPath, EC, TextFile);
  if (EC) {
    llvm::errs() << "driver: cannot write " << OutputPath << ": " << EC.message() << "\n";
    return false;
  }
  M.print(Out, nullptr);
  return true;
}

} // namespace

int main() {
  llvm_obs::start_session();

  llvm::LLVMContext Ctx;
  llvm::SMDiagnostic Err;
  std::unique_ptr<llvm::Module> M = llvm::parseIRFile(InputPath, Err, Ctx);
  if (!M) {
    Err.print("driver", llvm::errs());
    return 1;
  }
  runPasses(*M);
  return writeModule(*M) ? 0 : 1;
}
