# CLAUDE.md

Guidance for Claude Code in this repository. README.md describes the project, its
layout and its commands; read it first.

## Invariants

- **Patching keeps line numbers.** Every `Insertion` is newline-free (asserted in
  `patcher/source.py`), and the hooks headers are force-included (`-include`), not
  `#include`d: `hooks.h` into the observed sources and `Value.cpp` by
  `driver/CMakeLists.txt`, `matchers.h` into every C++ source by
  `scripts/build_driver.sh` (the patched PatternMatch.h is included all over LLVM). Stack frames, MC/DC regions and
  GitHub links rely on upstream line numbers.
- **The patcher uses tree-sitter queries** (`patcher/queries.py`) with predicates for
  all node selection. Do not walk fields or filter nodes in loops when a query can
  express it. The one exception: returns of nested lambdas and local functions are
  excluded by range containment.
- **The patcher refuses a patched tree** (marker `llvm_obs::`) and fails when a
  required hook matches nothing. `scripts/prepare_target.sh` resets the tree before
  patching. Old-LLVM build fixups live in `patcher/compat.py`, each behind its version
  gate.
- **Coverage comes in segments** (`runtime/src/runtime.cpp`): each visit, and the
  iteration's code around visits, is one; the counters are reset at the start of each,
  so a scope's coverage is the merge of its segments. The host keeps the first profile
  whole and the others as byte differences from it (`js/src/core/profiles.ts`).
- **No LLVM CMake file is patched.** `driver/CMakeLists.txt` is an LLVM external
  project, configured after `llvm/lib`. It sets the observed sources' flags and the link.
- **Targets are LLVM 8 and later.** Code for older releases is not kept. The hooks headers
  stay C++11-compatible (LLVM 8 and 9 build as C++11).
- **`matchers.h` declares no LLVM name.** A forward-declared `llvm::Value` makes `Value`
  ambiguous in sources that also use `llvm::json::Value` (TextAPI). It recognizes
  LLVM's types by their members when a matcher is instantiated (`stripPointerCasts`:
  Value, `getTypeID`: Type, `getActiveBits`: APInt, `bitcastToAPInt`: APFloat,
  `hasSameSign`: CmpPredicate, `data`/`size` of `int`: masks), enums by their name
  (`__PRETTY_FUNCTION__`; CmpInst::Predicate is printed by name), and passes them
  type-erased.
- **The tools match emcc, not the target.** `llvm-cov`/`llvm-profdata`/`llvm-symbolizer`
  are built from the infra tree (`infra_commit.txt`, emcc's LLVM) and read profiles of
  any target.

## Why the driver build looks the way it does

The DWARF must describe the code exactly, or symbolized stacks are wrong. Each of these
was found the hard way:

- **Observed sources at `-O0`.** In optimized code, DWARF attributes merged code to the
  wrong inlined frames.
- **Link at `-O0`.** At higher levels, emcc runs binaryen after linking ("limited
  postlink optimizations" with `-g`). Its rewrite left the DWARF function ranges out of
  step with the code.
- **Observed objects first in the link.** wasm-ld places the DWARF of a discarded
  COMDAT copy at the copy it keeps. When the kept copy came from an optimized,
  uninstrumented object, that DWARF claimed the code after it. With the observed
  objects first, the kept copy is an observed one, compiled the same way.
- **LLVM's headers are system headers for the observed sources**
  (`--system-header-prefix=llvm/`), except PatternMatch (`--no-system-header-prefix`),
  so coverage skips their inline functions. Each one was instrumented again in every
  observed source: 95% of the 31k instrumented functions. With only PatternMatch kept
  (about 10k functions), an iteration decodes in about 0.8 s instead of 5 s.
  `-fprofile-list` cannot do this: its `source:` matches the translation unit, not the
  header. The hooks headers are `#pragma clang system_header` for the same reason.
  `js/src/core/mcdc.ts` merges the records a header function has per instantiation.
- **No PCH for observed sources.** Their flags differ from LLVM's shared precompiled
  headers.
- **`LLVM_ENABLE_PIC=OFF`, `LLVM_ENABLE_PLUGINS=OFF`.**

`scripts/xref.py` resolves the calls in the shipped sources with libclang: emcc's own
`libclang.so` (same version as the compiler), the `clang` Python bindings, and the
build's `compile_commands.json` plus `em++ --cflags`. Jump to definition goes where
clang resolved the call; overloads of the same arity differ only by type. libclang needs
the glibc of nixpkgs, so the flake points uv at its Python (`UV_PYTHON`). The match
calls' patterns are recorded with each matcher's class and bases;
`js/src/web/model/matchCalls.ts` names the runs after them (a run of the parent's own
class on the same value is folded into it: forwarding `match` methods). What they bind is
named after their output arguments (non-const reference parameters, by clang), in
order; a run the pattern does not write (a matcher's inner working) takes its owner's.

`scripts/tags.py` is the fallback for names clang did not resolve (in templates):
the shipped sources' functions by tree-sitter's C++ tags query, with a definition flag
and parameter counts, so jump to definition picks the overloads that take the call's
argument count (e.g. the free `match(V, P)` among the matchers' `match(V)` methods). tree-sitter is pinned below 0.26: 0.26.0 segfaults in
`QueryCursor.matches` on this run.

`js/src/core/llvm-tools.ts` reopens a tool's stdout on a MEMFS file: emscripten's
terminal passes output to JavaScript byte by byte, which made `llvm-cov export` 4x slower.

`js/src/core/symbolize.ts` passes llvm-symbolizer addresses relative to the code
section: DWARF addresses in wasm are code section offsets, while V8's are file offsets.
llvm-symbolizer names the outermost function of each address from the symbol table,
which it reads with file offsets, so the name is wrong. It is replaced by the name V8
reported.

## Working here

- Python: `uv run pytest`, `uv run python -m patcher --llvm <tree> --dry-run`.
- JS (in `js/`): `npx tsc --noEmit`, `npm test`, `npm run test:e2e`,
  `npm run test:web`. Node runs the TypeScript directly (type stripping): use only
  erasable syntax and `.ts` import specifiers.
- Builds need the Nix dev shell (`nix develop -c <cmd>`). A driver rebuild after a
  runtime or driver change is incremental; a full target build takes a while.
- The `test-mc-dc` branch holds the original MC/DC and stack-trace demo, for reference
  only.
