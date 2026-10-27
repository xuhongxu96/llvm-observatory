// WebAssembly driver: exposes the code under test to JavaScript.
//
// JS contract:
//   input_ptr()     -> address of a NUL-terminated input buffer
//   run()           -> runs the policy on the input; returns 1 if accepted, 0 if rejected
//   result_ptr()    -> address of the NUL-terminated result (tier name or error)
//   reset_profile() -> zeroes the MC/DC counters and bitmaps, so the next profile
//                      holds only the test vectors of the next run
//   profile_dump()  -> writes the raw clang profile (.profraw), returns its size
//   profile_ptr()   -> address of the profile bytes written by profile_dump()
#include "../target/policy.h"

// Provided by compiler-rt's profile runtime (InstrProfiling.c, InstrProfilingBuffer.c).
extern "C" void __llvm_profile_reset_counters(void);
extern "C" unsigned long long __llvm_profile_get_size_for_buffer(void);
extern "C" int __llvm_profile_write_buffer(char* buffer);

namespace {

const int kInputCapacity = 512;
char g_input[kInputCapacity];

const int kResultCapacity = 128;
char g_result[kResultCapacity];

const int kProfileCapacity = 1 << 20;
char g_profile[kProfileCapacity];
int g_profile_size = 0;

void copy_result(const char* text) {
  int i = 0;
  for (; text[i] != '\0' && i < kResultCapacity - 1; ++i) {
    g_result[i] = text[i];
  }
  g_result[i] = '\0';
}

}  // namespace

extern "C" {

__attribute__((export_name("input_ptr"))) char* input_ptr() {
  return g_input;
}

__attribute__((export_name("run"))) int run() {
  const PolicyResult result = run_policy(g_input);
  copy_result(result.error != nullptr ? result.error : tier_name(result.tier));
  return result.error == nullptr ? 1 : 0;
}

__attribute__((export_name("result_ptr"))) const char* result_ptr() {
  return g_result;
}

__attribute__((export_name("reset_profile"))) void reset_profile() {
  __llvm_profile_reset_counters();
}

__attribute__((export_name("profile_dump"))) int profile_dump() {
  const unsigned long long size = __llvm_profile_get_size_for_buffer();
  if (size > kProfileCapacity) return -1;
  __llvm_profile_write_buffer(g_profile);
  g_profile_size = static_cast<int>(size);
  return g_profile_size;
}

__attribute__((export_name("profile_ptr"))) const char* profile_ptr() {
  return g_profile;
}

}  // extern "C"
