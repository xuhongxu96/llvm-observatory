# LLVM Observatory

Watch LLVM's InstCombine at work. Give it LLVM IR; for every iteration of InstCombine
and AggressiveInstCombine it shows

- each value a fold produced, and each replacement (RAUW) it made, with the full call
  stack down to the source line of the fold, and the rule (the InstCombine function)
  that fired;
- every condition the iteration evaluated in InstCombine, InstructionSimplify,
  ConstantFolding and ValueTracking, from Clang's MC/DC coverage: `T`/`F` for each
  operand of `&&`/`||` and the outcome of each decision, so you can see why a fold did
  or did not apply.

Everything runs in WebAssembly, in the browser or in Node. The observed LLVM can be any
commit.

## How it works

The patch to LLVM is small. `patcher/` (Python, tree-sitter queries) inserts three hooks,
each on an existing line, so that line numbers do not change:

| hook | where | inserted |
|---|---|---|
| value | `return X;` of functions returning a `Value`-like pointer in the observed sources | `return llvm_obs::observed(X);` |
| replace | `Value::doRAUW` | `llvm_obs::on_replace(this, New);` |
| iteration | `InstCombinerImpl::run`, `AggressiveInstCombinePass::run` | `llvm_obs::IterationScope …;` |

Everything else comes from the toolchain:

- **Stacks.** Each hook calls into JavaScript (`runtime/src/host.cpp`), which reads the
  live wasm stack from `new Error().stack`. `llvm-symbolizer` resolves it with the DWARF
  of the observed sources.
- **Conditions.** The observed sources are compiled with `-fcoverage-mcdc`. Each
  iteration resets the profile counters on entry and hands the raw profile to JavaScript
  on exit. `llvm-profdata` and `llvm-cov` (also in wasm) decode it.

The runtime (`runtime/`) and the driver (`driver/`) are compiled into one wasm module,
`observatory_driver`. It runs InstCombinePass and AggressiveInstCombinePass on
`/work/input.ll`. `driver/CMakeLists.txt` sets every compiler and linker flag of the
observed sources. No LLVM CMake file is patched.

## Two LLVM trees

| tree | ref | role |
|---|---|---|
| `thirdparty/llvm-infra` | `infra_commit.txt` | the LLVM of emcc's clang; builds `llvm-cov`, `llvm-profdata`, `llvm-symbolizer` |
| `thirdparty/llvm-target` | `target_commit.txt` or any ref | patched and observed |

emcc's clang writes the coverage profile, so the tools that read it must come from
emcc's LLVM, whatever the target is. Both trees are worktrees of the clone in
`thirdparty/llvm-project`.

## Layout

```
patcher/         the patcher (uv run python -m patcher --llvm <tree> [--dry-run])
runtime/         the hooks' interface (include/) and their implementation (src/)
driver/          the observed program and its build flags
scripts/         prepare_infra.sh, build_tools.sh, prepare_target.sh, build_driver.sh
js/src/core/     driver, host, symbolizer, trace model, MC/DC decoding (shared)
js/src/cli/      observe.ts: the Node command line
js/src/web/      the web app (Vite + React)
tests/patcher/   patcher tests (pytest)
js/test/         unit, end-to-end (built driver) and web tests
build/dist/      the build output the CLI and the web app load (not in git)
```

## Build

With [direnv](https://direnv.net) and Nix, `direnv allow` loads the flake's dev shell
(emscripten, clang, cmake, ninja, uv, node). Otherwise, use `nix develop`.

```sh
uv sync                            # the patcher's Python packages
scripts/prepare_infra.sh           # infra LLVM; warns if it is not emcc's LLVM
scripts/build_tools.sh             # build/dist/llvm-tools/
scripts/prepare_target.sh [ref]    # target LLVM at ref, patched
scripts/build_driver.sh            # build/dist/{driver,sources,target.json}
cd js && npm install
```

To observe another LLVM, run `prepare_target.sh <ref>` and then `build_driver.sh`. To
keep two targets side by side, set `OBSERVATORY_TARGET` and `OBSERVATORY_BUILD`, e.g.
`thirdparty/llvm-15` and `build-15`. A second build directory needs a copy of
`build/dist/llvm-tools/`.

## Use

```sh
cd js
node src/cli/observe.ts input.ll                           # values and replacements, with stacks
node src/cli/observe.ts input.ll --mcdc-file InstructionSimplify   # ... and the conditions
node src/cli/observe.ts input.ll --json > run.json
npm run dev                                                # the web app, on build/dist
```

In the web app, **Run** observes the IR. The trace has a structured view (filters,
pointer links between values and replacements) and a text view. A rule or a stack frame
opens its source with the MC/DC badges of that iteration; **conditions** lists the
sources an iteration evaluated conditions in. The optimized IR pane shows the final IR,
or the whole module after any one iteration. **Share** copies a link that holds the IR.

## Tests

```sh
uv run pytest                 # patcher (with a dry run on thirdparty/llvm-infra if present)
cd js && npm test             # unit and component tests
cd js && npm run test:e2e     # the built driver on js/test/e2e/inputs/*.ll
cd js && npm run test:web     # the app in a headless browser (Playwright)
```

An end-to-end input states what it expects in comments:

```llvm
; expect value `i32 %x`: simplifyAddInst, visitAdd, InstructionSimplify.cpp
; expect replace `%a = add i32 %x, 0`: visitAdd
; expect mcdc lib/Analysis/InstructionSimplify.cpp: m_Zero
```

## Limits

- The observed sources are built at `-O0`, so InstCombine runs slower than in a release
  build. Optimized DWARF puts merged code under the wrong inlined frames.
- Decoding an iteration's conditions takes under a second: `llvm-cov export` renders
  every instrumented function, not only those that ran. The web app decodes an
  iteration only when it is opened.
- Coverage covers the observed sources, InstCombine's own headers and PatternMatch
  (`PatternMatch.h`, `PatternMatchHelpers.h`), but not the inline functions of LLVM's
  other headers (SmallVector, DenseMap, …): each would be instrumented again in every
  observed source. A header function's records from all its instantiations are merged.
- MC/DC needs two or more conditions (`&&`, `||`). A plain `if (c)` or `while (c)` shows
  only whether it was true, false or both, from its branch counters.
- The source view shows the patched sources, as compiled, so that coverage columns match.
