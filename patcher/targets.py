"""Which hooks go into which files of the LLVM tree."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from . import hooks
from .hooks import Hook


@dataclass(frozen=True)
class Rule:
    hook: Hook
    globs: tuple[str, ...]  # relative to the llvm/ directory of the tree
    required: bool = True  # a required hook must match at least once

    def files(self, llvm_dir: Path) -> list[Path]:
        return sorted({p for g in self.globs for p in llvm_dir.glob(g) if p.is_file()})


OBSERVED_PASSES = (
    "lib/Transforms/InstCombine/*.cpp",
    "lib/Transforms/InstCombine/*.h",
    "lib/Transforms/AggressiveInstCombine/*.cpp",
    "lib/Transforms/AggressiveInstCombine/*.h",
    "lib/Analysis/InstructionSimplify.cpp",
    "lib/Analysis/ConstantFolding.cpp",
)

# InstCombine's main loop; InstCombinerImpl was InstCombiner before LLVM 12.
INSTCOMBINE_RUN = ("InstCombinerImpl::run", "InstCombiner::run")

# Where match(V, P) calls are delimited: every source compiled with coverage.
MATCHING_SOURCES = (*OBSERVED_PASSES, "lib/Analysis/ValueTracking.cpp")

# PatternMatch's matchers (PatternMatchHelpers.h has some since LLVM 23).
MATCHERS = ("include/llvm/IR/PatternMatch.h", "include/llvm/Support/PatternMatchHelpers.h")

RULES = (
    Rule(hooks.ValueReturns(), OBSERVED_PASSES),
    Rule(hooks.MatchHook(), MATCHING_SOURCES),
    Rule(hooks.MatcherHooks(), MATCHERS),
    Rule(hooks.REPLACE, ("lib/IR/Value.cpp",)),
    Rule(hooks.DELETE, ("lib/IR/Value.cpp",)),
    Rule(
        hooks.iteration("instcombine", INSTCOMBINE_RUN),
        ("lib/Transforms/InstCombine/InstructionCombining.cpp",),
    ),
    Rule(hooks.VisitScopeHook(INSTCOMBINE_RUN), ("lib/Transforms/InstCombine/InstructionCombining.cpp",)),
    Rule(
        # The new-pass-manager entry point; absent in old releases.
        hooks.iteration("aggressive-instcombine", ("AggressiveInstCombinePass::run",)),
        ("lib/Transforms/AggressiveInstCombine/AggressiveInstCombine.cpp",),
        required=False,
    ),
)
