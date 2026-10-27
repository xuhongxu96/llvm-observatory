# MC/DC condition viewer

A small C++ policy evaluator, compiled to WebAssembly with Clang's MC/DC
instrumentation. The source has no tracing code. The value of every boolean
condition comes from the coverage profile of each run, decoded by LLVM's own
`llvm-cov`. The web page and the Node demo decode it the same way.

```
flake.nix, .envrc      dev shell (emscripten, clang, cmake, ninja, node)
target/                policy.h, policy.cpp: the code under test
driver/driver.cpp      wasm exports: run a request, reset and dump the profile
scripts/build.sh       emcc: target + driver -> web/policy.wasm (copies sources to web/src/)
scripts/build_llvm.sh  llvm-cov and llvm-profdata for WebAssembly -> web/tools/
scripts/trace.mjs      demo: print the value of every condition for some inputs
web/                   the viewer: index.html, app.js, coverage.mjs, policy.mjs, llvm.mjs
```

## Setup

With [direnv](https://direnv.net) and Nix, `direnv allow` in this directory loads the
flake's dev shell, which provides `emcc`, `emcmake`, `cmake`, `ninja`, and `node`.

`build_llvm.sh` builds LLVM from source, which must be the same LLVM as the emscripten
clang: the coverage profile format changes between LLVM versions. The repo root's
`llvm_commit.txt` pins that commit. To check it, run `emcc -v` and look for the
clang commit hash in its output, or use `clang --version` from the emscripten
toolchain. If emcc is upgraded, update `llvm_commit.txt` and re-run `clone_llvm.sh`.

```sh
./clone_llvm.sh            # from the repo root -> thirdparty/llvm-project at llvm_commit.txt
```

## Build

```sh
scripts/build.sh           # web/policy.wasm and web/src/
scripts/build_llvm.sh      # web/tools/llvm-cov.*, web/tools/llvm-profdata.* (builds LLVM; takes a while)
```

Both are needed for the web page and for the trace demo, which decodes the profile
with the same `web/tools/` files.

## Run the web viewer

```sh
cd web && python3 -m http.server 8000
# open http://localhost:8000
```

Type a request such as `age=34 member=y vip=n`, or press a sample. Each run:

1. runs the policy and resets the MC/DC counters first, so the profile holds only
   this run;
2. merges the profile with `llvm-profdata` and exports it with `llvm-cov`, both in
   the browser;
3. shows the selected source file with a badge after each condition: `T` true,
   `F` false, `–` not evaluated (short-circuit), `T/F` both values in this run. Each
   decision also gets its outcome (`→ true`, `→ false`, `→ both`).

Below the source, each decision lists its test vectors. Hover over a badge to see
them.

## Trace demo

Needs Node 22 or newer (the flake provides 26). The trace demo runs the same modules as the page.

```sh
node scripts/trace.mjs                  # sample inputs
node scripts/trace.mjs 'age=40 vip=y'   # your inputs
```

Example output:

```
input: "age=34 member=y vip=n"  ->  STANDARD
  policy.cpp:113  r.age >= 18  r.age < 65  r.member  r.vip
    T  T  T  -  =>  true
```

## How it works

- `-fcoverage-mcdc` makes Clang instrument each compound `if` and `while` condition.
  The instrumentation records which condition patterns (test vectors) ran.
- `reset_profile()` clears the counters and bitmaps. `profile_dump()` serializes
  them as a `.profraw` buffer.
- `llvm-cov export` maps the test vectors to conditions, using the coverage
  mapping compiled into `policy.wasm`. `web/coverage.mjs` maps each condition to
  its source span. Plain `if` and `while` conditions use the branch counters from
  the same export.

## Limits

- MC/DC instruments only decisions with two or more conditions (`&&`, `||`). A plain
  `if (x)` or `while (x)` has no MC/DC record. Its value comes from the branch counters
  instead: a true count and a false count per run. That gives the values it took, but
  not the independence pairs. Other boolean expressions (for example the operand of
  `?:` or a `for` condition) are not shown.
- Values are per test vector. A decision evaluated several times with the same
  pattern is shown once per pattern.
- Condition text comes from the source span, split at `&&` and `||`. If the split
  does not match llvm-cov's condition count, the decision is listed with its
  outcome but without inline badges.
