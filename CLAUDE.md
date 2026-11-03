# CLAUDE.md

Guidance for Claude Code in this repository. README.md describes the project, its
layout and its commands; read it first.

## Invariants

- **Patching keeps line numbers.** Every `Insertion` is newline-free (asserted in
  `patcher/source.py`), and the hooks header is force-included by
  `driver/CMakeLists.txt` (`-include`), not `#include`d. Stack frames, MC/DC regions and
  GitHub links rely on upstream line numbers.
- **The patcher uses tree-sitter queries** (`patcher/queries.py`) with predicates for
  all node selection. Do not walk fields or filter nodes in loops when a query can
  express it. The one exception: returns of nested lambdas and local functions are
  excluded by range containment.
- **The patcher refuses a patched tree** (marker `llvm_obs::`) and fails when a
  required hook matches nothing. `scripts/prepare_target.sh` resets the tree before
  patching. Old-LLVM build fixups live in `patcher/compat.py`, each behind its version
  gate.
- **No LLVM CMake file is patched.** `driver/CMakeLists.txt` is an LLVM external
  project, configured after `llvm/lib`. It sets the observed sources' flags and the link.
- **`hooks.h` stays C++14** (old LLVM releases build as C++14).
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
  (`--system-header-prefix=llvm/`), so coverage skips their inline functions. Each
  inline function was instrumented again in every observed source, which made 95% of
  the 31k instrumented functions. Without them, profiles are 15x smaller, `llvm-cov
  export` is about 3x faster, and the driver's JS is 286 KB instead of 24 MB.
  (`-fprofile-list` cannot do this: its `source:` matches the translation unit, not the
  header.)
- **No PCH for observed sources.** Their flags differ from LLVM's shared precompiled
  headers.
- **`LLVM_ENABLE_PIC=OFF`, `LLVM_ENABLE_PLUGINS=OFF`.**

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
