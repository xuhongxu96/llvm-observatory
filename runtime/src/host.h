// The JavaScript host (js/src/core/host.ts). Each call runs synchronously in JS while
// the caller's wasm frames are live, so the host captures the call stack of every event.
#ifndef LLVM_OBSERVATORY_HOST_H
#define LLVM_OBSERVATORY_HOST_H

#include <string>
#include <vector>

namespace llvm_obs {
namespace host {

// One event, as a JSON object; the host captures the call stack if `Stack`.
void emit(const std::string &Json, bool Stack = true);

// The raw coverage profile (.profraw) of a coverage segment.
void emit_profile(long Segment, const std::vector<char> &Profile);

} // namespace host
} // namespace llvm_obs

#endif
