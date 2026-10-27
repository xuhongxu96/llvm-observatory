#!/usr/bin/env bash
# Builds the policy as WebAssembly with Clang MC/DC instrumentation, for the viewer
# and the trace demo. Needs emcc on PATH (the flake dev shell provides it).
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p web/src
cp target/policy.h target/policy.cpp web/src/

# -O0 keeps every condition visible to coverage. -g is required: llvm-cov cannot
# read the coverage mapping of a module built without debug info.
emcc -std=c++17 -O0 -g -fno-exceptions -fno-rtti \
  -fprofile-instr-generate -fcoverage-mapping -fcoverage-mcdc \
  -sSTANDALONE_WASM=1 \
  -sEXPORTED_FUNCTIONS=_input_ptr,_run,_result_ptr,_reset_profile,_profile_dump,_profile_ptr \
  -Wl,--no-entry \
  target/policy.cpp driver/driver.cpp -o web/policy.wasm

echo "built web/policy.wasm and web/src/"
