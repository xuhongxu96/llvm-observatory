#!/usr/bin/env bash
# scripts/prepare_target.sh [ref]: checks out the target LLVM at thirdparty/llvm-target
# (default ref: target_commit.txt) and patches it.
source "$(dirname "$0")/lib.sh"

ref=${1:-$(read_ref "$ROOT/target_commit.txt")}
checkout_tree "$TARGET" "$ref"
echo "$ref" > "$TARGET/.observatory-ref"   # read by build_driver.sh
(cd "$ROOT" && uv run python -m patcher --llvm "$TARGET")
