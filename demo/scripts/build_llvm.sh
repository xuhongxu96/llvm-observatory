#!/usr/bin/env bash
# Builds llvm-cov and llvm-profdata for the browser (WebAssembly, via emscripten)
# from thirdparty/llvm-project and copies them to web/llvm-tools/.
#
#   ../clone_llvm.sh          # once: fetch the LLVM source (repo root)
#   scripts/build_llvm.sh     # needs emcc on PATH (the flake dev shell provides it)
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC=$ROOT/../thirdparty/llvm-project
HOST=$ROOT/../thirdparty/llvm-host     # native build: llvm-tblgen, used by the cross build
WASM=$ROOT/../thirdparty/llvm-wasm
JOBS=${JOBS:-$(nproc)}

[ -f "$SRC/llvm/CMakeLists.txt" ] || { echo "error: no LLVM source at $SRC (run clone_llvm.sh)" >&2; exit 1; }
command -v emcmake >/dev/null || { echo "error: emcmake not found (use the flake dev shell)" >&2; exit 1; }

COMMON=(
  -G Ninja -S "$SRC/llvm"
  -DCMAKE_BUILD_TYPE=Release
  -DLLVM_TARGETS_TO_BUILD=WebAssembly
  -DLLVM_ENABLE_PROJECTS=
  -DLLVM_INCLUDE_TESTS=OFF -DLLVM_INCLUDE_BENCHMARKS=OFF
  -DLLVM_INCLUDE_EXAMPLES=OFF -DLLVM_INCLUDE_DOCS=OFF
  -DLLVM_ENABLE_ZSTD=OFF -DLLVM_ENABLE_LIBXML2=OFF
  -DLLVM_ENABLE_ASSERTIONS=OFF
  -DHAVE_VALGRIND_VALGRIND_H=OFF
)

# 1. Host llvm-tblgen.
cmake "${COMMON[@]}" -B "$HOST" -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++
ninja -C "$HOST" -j "$JOBS" llvm-tblgen

# 2. The tools, for WebAssembly. zlib comes from emscripten's port (-sUSE_ZLIB): the
#    profiles written by the instrumented module are zlib-compressed. The stack is raised because LLVM needs far more than
#    emscripten's 64 KB default. The ES-module factory lets the page create a fresh
#    instance for each run.
# emscripten's zlib port: a probe compile builds the port and shows the sysroot it
# uses. The library and headers are in that sysroot.
PROBE=$(mktemp -d)
printf '#include <zlib.h>\nint probe(void) { return zlibVersion()[0]; }\n' > "$PROBE/probe.c"
SYSROOT=$(emcc -sUSE_ZLIB=1 -c "$PROBE/probe.c" -o "$PROBE/probe.o" -v 2>&1 \
  | grep -o -- '--sysroot=[^ ]*' | head -1 | cut -d= -f2)
rm -rf "$PROBE"
ZLIB_LIB="$SYSROOT/lib/wasm32-emscripten/libz.a"
ZLIB_INC="$SYSROOT/include"
[ -n "$SYSROOT" ] && [ -f "$ZLIB_LIB" ] && [ -f "$ZLIB_INC/zlib.h" ] \
  || { echo "error: emscripten zlib port not found (sysroot: '$SYSROOT')" >&2; exit 1; }

emcmake cmake "${COMMON[@]}" -B "$WASM" \
  -DLLVM_ENABLE_THREADS=OFF -DLLVM_ENABLE_PIC=OFF -DLLVM_BUILD_LLVM_DYLIB=OFF \
  -DLLVM_ENABLE_ZLIB=ON -DZLIB_LIBRARY="$ZLIB_LIB" -DZLIB_INCLUDE_DIR="$ZLIB_INC" \
  -DLLVM_NATIVE_TOOL_DIR="$HOST/bin" \
  -DCMAKE_EXE_LINKER_FLAGS="-sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=8388608 -sINITIAL_MEMORY=67108864 -sMODULARIZE=1 -sEXPORT_ES6=1 -sINVOKE_RUN=0 -sEXPORTED_RUNTIME_METHODS=FS,callMain -sFORCE_FILESYSTEM=1"
EMCC_CFLAGS="-sUSE_ZLIB=1" EMCC_CXXFLAGS="-sUSE_ZLIB=1" ninja -C "$WASM" -j "$JOBS" llvm-cov llvm-profdata llvm-symbolizer

mkdir -p "$ROOT/web/build/llvm-tools"
cp "$WASM"/bin/llvm-cov.{js,wasm} "$WASM"/bin/llvm-profdata.{js,wasm} "$WASM"/bin/llvm-symbolizer.{js,wasm} "$ROOT/web/build/llvm-tools/"
echo "copied llvm-cov, llvm-profdata and llvm-symbolizer to web/build/llvm-tools/"
