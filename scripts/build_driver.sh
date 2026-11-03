#!/usr/bin/env bash
# Builds the observed driver from the patched target LLVM into build/dist/:
#   driver/    observatory_driver.{js,wasm}
#   sources/   the observed sources as compiled (patched), by path under llvm/
#   target.json  {ref, commit, version}
# Run scripts/prepare_target.sh first.
source "$(dirname "$0")/lib.sh"
require_emscripten
[ -f "$TARGET/.observatory-ref" ] || die "no patched target LLVM (run scripts/prepare_target.sh)"

HOST=$BUILD/target-host
WASM=$BUILD/target-wasm
build_tblgen "$TARGET" "$HOST"

tblgen=(-DLLVM_TABLEGEN="$HOST/bin/llvm-tblgen")
[ -x "$HOST/bin/llvm-min-tblgen" ] && tblgen+=(-DLLVM_MIN_TABLEGEN="$HOST/bin/llvm-min-tblgen")

emcmake cmake -G Ninja -S "$TARGET/llvm" -B "$WASM" "${CCACHE[@]}" "${CMAKE_COMPAT[@]}" "${tblgen[@]}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DLLVM_TARGETS_TO_BUILD= \
  -DLLVM_ENABLE_PROJECTS= \
  -DLLVM_INCLUDE_TESTS=OFF -DLLVM_INCLUDE_BENCHMARKS=OFF -DLLVM_INCLUDE_EXAMPLES=OFF \
  -DLLVM_INCLUDE_UTILS=OFF -DLLVM_TOOL_LTO_BUILD=OFF -DLLVM_TOOL_REMARKS_SHLIB_BUILD=OFF \
  -DLLVM_ENABLE_THREADS=OFF -DLLVM_ENABLE_BACKTRACES=OFF -DLLVM_ENABLE_CRASH_OVERRIDES=OFF \
  -DLLVM_ENABLE_PIC=OFF -DLLVM_ENABLE_PLUGINS=OFF \
  -DLLVM_ENABLE_ZLIB=OFF -DLLVM_ENABLE_ZSTD=OFF -DLLVM_ENABLE_LIBXML2=OFF \
  -DLLVM_ENABLE_TERMINFO=OFF -DLLVM_ENABLE_LIBEDIT=OFF -DLLVM_ENABLE_ONDISK_CAS=OFF \
  -DLLVM_NATIVE_TOOL_DIR="$HOST/bin" \
  -DLLVM_EXTERNAL_PROJECTS=observatory_driver \
  -DLLVM_EXTERNAL_OBSERVATORY_DRIVER_SOURCE_DIR="$ROOT/driver"
ninja -C "$WASM" -j "$JOBS" observatory_driver

rm -rf "$DIST/driver" "$DIST/sources"
mkdir -p "$DIST/driver" "$DIST/sources"
cp "$WASM/bin/observatory_driver.js" "$WASM/bin/observatory_driver.wasm" "$DIST/driver/"

# The sources whose lines appear in stack frames and MC/DC regions (those that exist in
# this LLVM version).
shopt -s nullglob
cd "$TARGET/llvm"
for file in \
  lib/Transforms/InstCombine/*.{cpp,h} \
  lib/Transforms/AggressiveInstCombine/*.{cpp,h} \
  lib/Analysis/{InstructionSimplify,ConstantFolding,ValueTracking}.cpp \
  include/llvm/Transforms/InstCombine/*.h \
  include/llvm/IR/PatternMatch.h \
  include/llvm/Support/PatternMatchHelpers.h; do
  if [ -f "$file" ]; then cp --parents "$file" "$DIST/sources/"; fi
done
cd "$ROOT"

cat > "$DIST/target.json" <<JSON
{"ref": "$(cat "$TARGET/.observatory-ref")", "commit": "$(git -C "$TARGET" rev-parse HEAD)", "version": "$(llvm_version "$TARGET")"}
JSON
ls -lh "$DIST/driver"
