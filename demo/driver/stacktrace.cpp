// print_stacktrace() asks the host to capture the call stack. The host reads it from
// JavaScript's Error.stack, which lists each wasm frame with its function index and byte
// offset in the module. Those offsets are resolved to file and line with the module's
// DWARF (web/stacktrace.mjs). No instrumentation is needed.
#include "../target/stacktrace.h"

// Imported from JavaScript (web/policy.mjs).
extern "C" void js_capture_stack();

void print_stacktrace() {
  js_capture_stack();
}
