#!/usr/bin/env bash
# Builds llvm-cov, llvm-profdata and llvm-symbolizer for WebAssembly from the infra LLVM
# into build/dist/llvm-tools/. Run scripts/prepare_infra.sh first.
source "$(dirname "$0")/lib.sh"
require_emscripten
[ -f "$INFRA/llvm/CMakeLists.txt" ] || die "no infra LLVM (run scripts/prepare_infra.sh)"

HOST=$BUILD/infra-host
WASM=$BUILD/infra-wasm
build_tblgen "$INFRA" "$HOST"

# zlib comes from emscripten's port: the profiles are zlib-compressed. A probe compile
# builds the port and reveals the sysroot that holds it.
probe=$(mktemp -d)
trap 'rm -rf "$probe"' EXIT
printf '#include <zlib.h>\nint probe(void) { return zlibVersion()[0]; }\n' > "$probe/probe.c"
sysroot=$(emcc -sUSE_ZLIB=1 -c "$probe/probe.c" -o "$probe/probe.o" -v 2>&1 \
  | grep -o -- '--sysroot=[^ ]*' | head -n1 | cut -d= -f2)
zlib_lib=$sysroot/lib/wasm32-emscripten/libz.a
[ -f "$zlib_lib" ] && [ -f "$sysroot/include/zlib.h" ] || die "emscripten zlib port not found (sysroot: '$sysroot')"

# LLVM needs far more stack than emscripten's 64 KB default. The ES-module factory gives
# each tool call a fresh instance.
emcmake cmake -G Ninja -S "$INFRA/llvm" -B "$WASM" "${CCACHE[@]}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DLLVM_TARGETS_TO_BUILD=WebAssembly \
  -DLLVM_ENABLE_PROJECTS= \
  -DLLVM_INCLUDE_TESTS=OFF -DLLVM_INCLUDE_BENCHMARKS=OFF -DLLVM_INCLUDE_EXAMPLES=OFF \
  -DLLVM_ENABLE_ZSTD=OFF -DLLVM_ENABLE_LIBXML2=OFF -DLLVM_ENABLE_ASSERTIONS=OFF \
  -DLLVM_ENABLE_THREADS=OFF -DLLVM_ENABLE_PIC=OFF -DLLVM_BUILD_LLVM_DYLIB=OFF \
  -DHAVE_VALGRIND_VALGRIND_H=OFF \
  -DLLVM_ENABLE_ZLIB=ON -DZLIB_LIBRARY="$zlib_lib" -DZLIB_INCLUDE_DIR="$sysroot/include" \
  -DLLVM_NATIVE_TOOL_DIR="$HOST/bin" \
  -DCMAKE_EXE_LINKER_FLAGS="-sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=8MB -sINITIAL_MEMORY=64MB -sMODULARIZE=1 -sEXPORT_ES6=1 -sINVOKE_RUN=0 -sEXPORTED_RUNTIME_METHODS=FS,callMain -sFORCE_FILESYSTEM=1"
EMCC_CFLAGS=-sUSE_ZLIB=1 EMCC_CXXFLAGS=-sUSE_ZLIB=1 ninja -C "$WASM" -j "$JOBS" llvm-cov llvm-profdata llvm-symbolizer

mkdir -p "$DIST/llvm-tools"
for tool in llvm-cov llvm-profdata llvm-symbolizer; do
  cp "$WASM/bin/$tool.js" "$WASM/bin/$tool.wasm" "$DIST/llvm-tools/"
done
echo "built $DIST/llvm-tools/"
