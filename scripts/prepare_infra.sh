#!/usr/bin/env bash
# Checks out the infra LLVM (infra_commit.txt) at thirdparty/llvm-infra.
source "$(dirname "$0")/lib.sh"

checkout_tree "$INFRA" "$(read_ref "$ROOT/infra_commit.txt")"

# The profile format must match emcc's clang: compare the versions.
infra=$(llvm_version "$INFRA")
if command -v emcc >/dev/null; then
  emcc_clang=$(emcc -v 2>&1 | grep -oE 'clang version [0-9]+\.[0-9]+\.[0-9]+' | head -n1 | cut -d' ' -f3)
  [ "$emcc_clang" = "$infra" ] \
    || echo "warning: emcc uses clang $emcc_clang but the infra LLVM is $infra; update infra_commit.txt" >&2
fi
