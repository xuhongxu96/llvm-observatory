// Observes InstCombine on an IR file and prints what it did.
//
//   node src/cli/observe.ts input.ll [options]
//     --frames N      stack frames per record (default 8; 0 for all)
//     --mcdc          also print the conditions each iteration evaluated
//     --mcdc-file S   ... only in sources whose path contains S
//     --output-ir     also print the optimized IR
//     --json          print the run as JSON instead
//     --dist DIR      the build output (default: build/dist)
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { decisions, singleConditions, valueLabel, type IterationCoverage } from "../core/mcdc.ts";
import { Observatory, type Run } from "../core/observatory.ts";
import { renderText } from "../core/text.ts";
import { DEFAULT_DIST, localDist } from "./dist.ts";

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    frames: { type: "string", default: "8" },
    mcdc: { type: "boolean", default: false },
    "mcdc-file": { type: "string" },
    "output-ir": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    dist: { type: "string", default: DEFAULT_DIST },
  },
});
if (positionals.length !== 1) {
  console.error("usage: node src/cli/observe.ts input.ll [--frames N] [--mcdc] [--mcdc-file S] [--output-ir] [--json] [--dist DIR]");
  process.exit(2);
}

const dist = localDist(opts.dist);
const observatory = await Observatory.create(dist);
const run = await observatory.observe(await readFile(positionals[0], "utf8"));
if (run.status !== 0) {
  console.error(run.stderr || `driver exited with status ${run.status}`);
  process.exit(1);
}

const wantsCoverage = opts.mcdc || opts["mcdc-file"] !== undefined;
const coverage = new Map<number, IterationCoverage>();
if (wantsCoverage) {
  for (const it of run.trace.iterations) coverage.set(it.number, filterFiles(await observatory.coverage(run, it.number)));
}

if (opts.json) {
  console.log(JSON.stringify(toJson(run, coverage), null, 2));
} else {
  const frames = Number(opts.frames);
  console.log(renderText(run.trace, { maxFrames: frames > 0 ? frames : undefined }));
  for (const [iteration, files] of coverage) console.log(await renderCoverage(iteration, files));
  if (opts["output-ir"]) console.log(`=== output IR ===\n${run.outputIr}`);
}

function filterFiles(files: IterationCoverage): IterationCoverage {
  const needle = opts["mcdc-file"];
  return needle ? new Map([...files].filter(([path]) => path.includes(needle))) : files;
}

async function renderCoverage(iteration: number, files: IterationCoverage): Promise<string> {
  const out = [`=== conditions evaluated in iteration ${iteration} ===`];
  for (const [path, file] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const source = await dist.source(path);
    if (source === null) continue;
    const rows = [
      ...decisions(file, source).map((d) => ({
        line: d.line,
        lines: [
          `${path}:${d.line}  ${d.conditionNames.join("  ")}`,
          ...d.vectors.map((v, n) => `    ${v.map((c) => valueLabel([c])).join("  ")}  =>  ${d.results[n]}`),
        ],
      })),
      ...singleConditions(file, source).map((c) => ({
        line: c.line,
        lines: [`${path}:${c.line}  ${c.keyword} (${c.text})  =>  ${valueLabel(c.values)}`],
      })),
    ];
    for (const row of rows.sort((a, b) => a.line - b.line)) out.push(...row.lines);
  }
  return out.join("\n");
}

function toJson(run: Run, coverage: Map<number, IterationCoverage>) {
  return {
    trace: run.trace,
    outputIr: run.outputIr,
    coverage: Object.fromEntries([...coverage].map(([n, files]) => [n, Object.fromEntries(files)])),
  };
}
