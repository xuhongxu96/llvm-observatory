// The host calls, as JavaScript imports. `Module.observatory` is the object the host
// passes to the module factory.
#include "host.h"

#include <emscripten/em_js.h>

EM_JS_DEPS(llvm_obs_host, "$UTF8ToString");

EM_JS(void, llvm_obs_host_emit, (const char *Json, int Length, int Stack), {
  Module.observatory.emit(UTF8ToString(Json, Length), Stack !== 0);
});

EM_JS(void, llvm_obs_host_emit_profile, (int Segment, const char *Data, int Length), {
  Module.observatory.emitProfile(Segment, HEAPU8.subarray(Data, Data + Length));
});

namespace llvm_obs {
namespace host {

void emit(const std::string &Json, bool Stack) {
  llvm_obs_host_emit(Json.data(), static_cast<int>(Json.size()), Stack ? 1 : 0);
}

void emit_profile(long Segment, const std::vector<char> &Profile) {
  llvm_obs_host_emit_profile(static_cast<int>(Segment), Profile.data(),
                             static_cast<int>(Profile.size()));
}

} // namespace host
} // namespace llvm_obs
