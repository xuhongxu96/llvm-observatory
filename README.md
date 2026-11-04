# LLVM Observatory

Watch LLVM's InstCombine at work. Give it LLVM IR; for every iteration of InstCombine
and AggressiveInstCombine it shows

- each value a fold produced, and each replacement (RAUW) it made, with the full call
  stack down to the source line of the fold, and the rule (the InstCombine function)
  that fired;
- each `match(V, P)` call an observed source made, with every matcher of its pattern as
  it ran: whether it matched, the value it looked at, and what it bound (an IR value,
  an `APInt`, a predicate, ...);
- every condition the iteration evaluated in InstCombine, InstructionSimplify,
  ConstantFolding and ValueTracking, from Clang's MC/DC coverage: `T`/`F` for each
  operand of `&&`/`||` and the outcome of each decision, so you can see why a fold did
  or did not apply.

Everything runs in WebAssembly, in the browser or in Node. The observed LLVM can be any
commit; the site, at <https://xuhongxu96.github.io/llvm-observatory/>, follows LLVM main.
Its **?** opens a short guide with examples to try.

## How it works

The patch to LLVM is small. `patcher/` (Python, tree-sitter queries) inserts its hooks,
each on an existing line, so that line numbers do not change:

| hook | where | inserted |
|---|---|---|
| value | `return X;` of functions returning a `Value`-like pointer in the observed sources (not `return replaceInstUsesWith(I, V);`: it returns the old `I`, and the replace hook records the replacement) | `return llvm_obs::observed(X);` |
| replace | `Value::doRAUW` | `llvm_obs::on_replace(this, New);` |
| delete | `Value::~Value` | `llvm_obs::on_delete(this);` (a fold's new instruction prints as `<badref>` until InstCombine inserts it, after the visit; the runtime describes it again then, unless it was destroyed) |
| iteration | `InstCombinerImpl::run`, `AggressiveInstCombinePass::run` | `llvm_obs::IterationScope …;` |
| visit | `visit(*I)` in `InstCombinerImpl::run` | `(llvm_obs::VisitScope(*I), visit(*I))` |
| match | `match(V, P)` in the observed sources | `(llvm_obs::match_begin(), llvm_obs::match_end(match(V, P)))` |
| matchers | the `match` methods of PatternMatch's matchers | a `MatcherScope` first; `result(X)` around returns; `bound("M", X)` around member assignments |

Everything else comes from the toolchain:

- **Stacks.** Each hook calls into JavaScript (`runtime/src/host.cpp`), which reads the
  live wasm stack from `new Error().stack`. `llvm-symbolizer` resolves it with the DWARF
  of the observed sources.
- **Matchers.** A match call collects the runs of its matchers as a tree (a matcher's
  sub-patterns run inside it) and emits it as one event, without a stack. The source
  panel underlines each call that ran in the scope; its hover shows the tree, with the
  matchers named as the pattern writes them (`m_Add(…)`, `m_Value(X)`).
- **Cross-references.** After the build, `scripts/xref.py` has clang (libclang, from
  emcc's LLVM) parse the observed sources with the build's compile commands. It
  records what each call calls (so jump to definition picks the right overload) and the
  pattern of each match call (the matcher types line up the runs with it).
- **Conditions.** The observed sources are compiled with `-fcoverage-mcdc`. The runtime
  hands the raw profile to JavaScript per segment and resets the counters: a segment is
  one visit of an instruction by InstCombine, or the iteration's code before, between
  or after visits. `llvm-profdata` merges the segments of a scope (a visit, or a whole
  iteration) and `llvm-cov` (also in wasm) decodes them.

The runtime (`runtime/`) and the driver (`driver/`) are compiled into one wasm module,
`observatory_driver`. It runs InstCombinePass and AggressiveInstCombinePass on
`/work/input.ll`. `driver/CMakeLists.txt` sets every compiler and linker flag of the
observed sources. No LLVM CMake file is patched.

## Two LLVM trees

| tree | ref | role |
|---|---|---|
| `thirdparty/llvm-infra` | `infra_commit.txt` | the LLVM of emcc's clang; builds `llvm-cov`, `llvm-profdata`, `llvm-symbolizer` |
| `thirdparty/llvm-target` | `target_commit.txt` or any ref of LLVM 8 or later | patched and observed |

emcc's clang writes the coverage profile, so the tools that read it must come from
emcc's LLVM, whatever the target is. Targets from LLVM 8 on are supported (built and
tested: 8, 9, 10, 15 and main); `patcher/compat.py` holds the few source fixups old
releases need to build with today's compilers. Both trees are worktrees of the clone in
`thirdparty/llvm-project`.

## Layout

```
patcher/         the patcher (uv run python -m patcher --llvm <tree> [--dry-run])
runtime/         the hooks' interface (include/) and their implementation (src/)
driver/          the observed program and its build flags
scripts/         prepare_infra.sh, build_tools.sh, prepare_target.sh, build_driver.sh;
                 tags.py (the sources' functions, by name) and xref.py (calls and
                 patterns, by clang), run by build_driver.sh
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
scripts/build_driver.sh            # build/dist/{driver,sources,tags.json,xref.json,target.json}
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

In the web app, **Run** observes the IR. Each value and replacement belongs to the visit
of the instruction InstCombine was combining (its **visit** pill); its rule and frames
open their sources with the conditions of that visit. In the source panel, Ctrl/⌘+click
(or F12) on a call goes to its definition, keeping the visit's conditions, so they show
in the called functions too; the breadcrumb and **←** go back. The **visit / iteration
/ whole run** switch widens the conditions shown, along the whole breadcrumb. The trace has a structured view (filters,
pointer links between values and replacements) and a JSON view (the trace as `--json`
prints it; copy or download it). A rule or a stack frame
opens its source with the MC/DC badges of that iteration; **coverage** lists the
sources an iteration (or a visit) evaluated conditions in. The optimized IR pane shows the whole module
after any one iteration; the last one, the final IR, by default. **Share** copies a link that holds the IR.
The page counts visits with [GoatCounter](https://www.goatcounter.com) (no cookies; not
on localhost).

## Publishing

`.github/workflows/pages.yml` builds the site and deploys it to GitHub Pages (the
repository's Pages source must be **GitHub Actions**). It runs on pushes to main, every
Monday (to follow LLVM main), and by hand, optionally with another LLVM ref to observe.
It runs the same scripts in the flake's dev shell, then the tests (pytest, unit, e2e)
and `vite build`. The LLVM tools are cached until `infra_commit.txt` or the toolchain
changes; ccache keeps the compiler outputs between runs. A first run, with no cache,
takes a few hours on a hosted runner.

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

## Acknowledgements

Thanks to Yingwei Zheng ([@dtcxzyw](https://github.com/dtcxzyw)) and Min Hsu
([@mshockwave](https://github.com/mshockwave)) for their suggestions in the
[LLVM Discourse thread](https://discourse.llvm.org/t/web-based-trace-viewer-for-instcombine-rewrites/90889):
observing InstSimplify, ConstantFolding, VectorCombine and AggressiveInstCombine;
showing the conditions that held, the ValueTracking queries and the worklist; and
weighing the compile-time cost and the trace size.
