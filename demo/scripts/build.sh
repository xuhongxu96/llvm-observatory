#!/usr/bin/env bash
# Builds the policy as WebAssembly, for the viewer and the trace demo. Needs emcc on
# PATH (the flake dev shell provides it).
#
# The module keeps its DWARF (-g, not stripped): the stack traces resolve function, file
# and line from it (web/stacktrace.mjs).
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=web/build
# Object files are only inputs to the module: keep them in a temporary directory.
OBJ=$(mktemp -d)
trap 'rm -rf "$OBJ"' EXIT
mkdir -p "$OUT/sources"
cp target/policy.h target/policy.cpp "$OUT/sources/"

# -O0 keeps every condition visible to coverage. -g is required: llvm-cov cannot
# read the coverage mapping of a module built without debug info.
FLAGS=(-std=c++17 -O0 -g -fno-exceptions -fno-rtti
  -fprofile-instr-generate -fcoverage-mapping -fcoverage-mcdc)

emcc "${FLAGS[@]}" -c target/policy.cpp -o "$OBJ/policy.o"
emcc "${FLAGS[@]}" -c driver/driver.cpp -o "$OBJ/driver.o"
emcc "${FLAGS[@]}" -c driver/stacktrace.cpp -o "$OBJ/stacktrace.o"

emcc "${FLAGS[@]}" -sSTANDALONE_WASM=1 \
  -sEXPORTED_FUNCTIONS=_input_ptr,_run,_result_ptr,_reset_profile,_profile_dump,_profile_ptr \
  -Wl,--no-entry -Wl,--allow-undefined \
  "$OBJ/policy.o" "$OBJ/driver.o" "$OBJ/stacktrace.o" -o "$OUT/policy.wasm"

echo "built $OUT/ (policy.wasm, sources/)"
