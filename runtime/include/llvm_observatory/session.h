// The runtime's interface to the driver.
#ifndef LLVM_OBSERVATORY_SESSION_H
#define LLVM_OBSERVATORY_SESSION_H

namespace llvm {
class Module;
} // namespace llvm

namespace llvm_obs {

// Starts a new run on `M`: iterations are numbered from 1 again, and each iteration's
// end event carries `M` as it is then.
void start_session(const llvm::Module &M);

} // namespace llvm_obs

#endif
