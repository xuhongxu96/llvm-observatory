# Shared by the build scripts: paths, ref files, LLVM checkouts and checks.
# Source it; it sets `set -euo pipefail`.
#
# OBSERVATORY_TARGET and OBSERVATORY_BUILD move the target tree and the build directory,
# e.g. to build a second LLVM version next to the default one.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CLONE=$ROOT/thirdparty/llvm-project   # the git clone; the trees below are its worktrees
INFRA=$ROOT/thirdparty/llvm-infra
TARGET=${OBSERVATORY_TARGET:-$ROOT/thirdparty/llvm-target}
BUILD=${OBSERVATORY_BUILD:-$ROOT/build}
DIST=$BUILD/dist
LLVM_REMOTE=${LLVM_REMOTE:-https://github.com/llvm/llvm-project.git}
JOBS=${JOBS:-$(nproc)}

die() { echo "error: $*" >&2; exit 1; }

# The first ref in a ref file (blank lines and # comments are skipped).
read_ref() {
  local ref
  ref=$(grep -v '^[[:space:]]*\(#\|$\)' "$1" | head -n1 | tr -d '[:space:]')
  [ -n "$ref" ] || die "$1 has no ref"
  echo "$ref"
}

# checkout_tree <worktree> <ref>: fetches <ref> into the clone and checks it out,
# clean, in <worktree>.
checkout_tree() {
  local tree=$1 ref=$2 commit
  if [ ! -d "$CLONE/.git" ]; then
    git init -q "$CLONE"
    git -C "$CLONE" remote add origin "$LLVM_REMOTE"
  fi
  git -C "$CLONE" fetch --depth 1 origin "$ref"
  commit=$(git -C "$CLONE" rev-parse 'FETCH_HEAD^{commit}')
  if [ -e "$tree/.git" ]; then
    git -C "$tree" checkout -q --detach --force "$commit"
    git -C "$tree" reset -q --hard
    git -C "$tree" clean -q -fd
  else
    git -C "$CLONE" worktree add -q --detach --force "$tree" "$commit"
  fi
  echo "$tree: $ref at $commit"
}

llvm_major() {
  grep -hE '^[[:space:]]*set\(LLVM_VERSION_MAJOR[[:space:]]+[0-9]+\)' \
    "$1/llvm/CMakeLists.txt" "$1/cmake/Modules/LLVMVersion.cmake" 2>/dev/null \
    | grep -oE '[0-9]+' | head -n1
}

llvm_version() {
  local part out=()
  for part in MAJOR MINOR PATCH; do
    out+=("$(grep -hE "^[[:space:]]*set\(LLVM_VERSION_$part[[:space:]]+[0-9]+\)" \
      "$1/llvm/CMakeLists.txt" "$1/cmake/Modules/LLVMVersion.cmake" 2>/dev/null \
      | grep -oE '[0-9]+' | head -n1)")
  done
  (IFS=.; echo "${out[*]}")
}

require_emscripten() {
  command -v emcmake >/dev/null || die "emcmake not found (use the flake dev shell: nix develop)"
}

# build_tblgen <tree> <build dir>: native llvm-tblgen (and llvm-min-tblgen, LLVM >= 17)
# for cross-building <tree> to wasm. Without optional system libraries: tblgen needs
# none, and a library found at build time (e.g. libtinfo) may be missing when it runs.
build_tblgen() {
  local tree=$1 dir=$2 targets=(llvm-tblgen)
  [ "$(llvm_major "$tree")" -ge 17 ] && targets+=(llvm-min-tblgen)
  cmake -G Ninja -S "$tree/llvm" -B "$dir" "${CCACHE[@]}" "${CMAKE_COMPAT[@]}" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++ \
    -DLLVM_TARGETS_TO_BUILD= \
    -DLLVM_ENABLE_PROJECTS= \
    -DLLVM_INCLUDE_TESTS=OFF -DLLVM_INCLUDE_BENCHMARKS=OFF -DLLVM_INCLUDE_EXAMPLES=OFF \
    -DLLVM_ENABLE_TERMINFO=OFF -DLLVM_ENABLE_LIBEDIT=OFF -DLLVM_ENABLE_LIBXML2=OFF \
    -DLLVM_ENABLE_ZLIB=OFF -DLLVM_ENABLE_ZSTD=OFF
  ninja -C "$dir" -j "$JOBS" "${targets[@]}"
}

CCACHE=()
command -v ccache >/dev/null && CCACHE=(-DLLVM_CCACHE_BUILD=ON)

# CMake 4 rejects projects that declare compatibility with CMake < 3.5, as LLVM <= 10 does.
CMAKE_COMPAT=(-DCMAKE_POLICY_VERSION_MINIMUM=3.5)
