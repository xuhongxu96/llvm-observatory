// Decodes a coverage profile of one iteration into the conditions it evaluated, using
// llvm-profdata and llvm-cov. Ported from the MC/DC demo (test-mc-dc branch).
//
// decodeProfile() runs the tools and keeps, per observed source, its executed MC/DC
// records and branch regions (FileCoverage, plain data). decisions() and
// singleConditions() then place them in the source text.
import type { LlvmTools } from "./llvm-tools.ts";
import { sourcePath } from "./symbolize.ts";

// llvm-cov export JSON (format version 3).
// MC/DC record: [line, col, endLine, endCol, trueCount, falseCount, fileId,
//                expandedFileId, kind, independencePairs[], testVectors[]]
// Branch:       [line, col, endLine, endCol, trueCount, falseCount, fileId,
//                expandedFileId, kind]
// Columns are 1-based; end columns are inclusive.
type McdcRecord = [number, number, number, number, number, number, number, number, number, unknown[], TestVector[]];
type BranchRecord = [number, number, number, number, number, number, number, number, number];
interface TestVector {
  executed: boolean;
  result: boolean;
  conditions: (boolean | null)[]; // null: not evaluated (short-circuit)
}
interface ExportFunction {
  filenames: string[];
  branches: BranchRecord[];
  mcdc_records?: McdcRecord[];
}
interface CoverageExport {
  data: { functions: ExportFunction[] }[];
}

export interface Region {
  line: number;
  col: number;
  endLine: number;
  endCol: number;
}

export interface ExecutedDecision extends Region {
  conditionCount: number;
  vectors: (boolean | null)[][]; // executed test vectors: one value per condition
  results: boolean[];            // the decision's outcome per vector
}

export interface TakenBranch extends Region {
  trueCount: number;
  falseCount: number;
}

// What one iteration evaluated in one source file.
export interface FileCoverage {
  decisions: ExecutedDecision[];
  branches: TakenBranch[];
}

export type IterationCoverage = Map<string, FileCoverage>; // source path -> coverage

const BRANCH_REGION = 4; // llvm::coverage::CounterMappingRegion::BranchRegion

// Decodes the .profraw of an iteration against the module that wrote it.
export async function decodeProfile(tools: LlvmTools, binary: Uint8Array, profraw: Uint8Array): Promise<IterationCoverage> {
  const merged = await tools.run(
    "llvm-profdata",
    ["merge", "-o", "/work/run.profdata", "/work/run.profraw"],
    { "run.profraw": profraw },
    ["run.profdata"],
  );
  const cov = await tools.run(
    "llvm-cov",
    ["export", "/work/module.wasm", "-instr-profile=/work/run.profdata", "-format=text", "-skip-expansions"],
    { "module.wasm": binary, "run.profdata": merged.files["run.profdata"] },
  );
  return summarize(JSON.parse(cov.stdout) as CoverageExport);
}

// The executed decisions and taken branches of an export, by source path.
export function summarize(report: CoverageExport): IterationCoverage {
  const files: IterationCoverage = new Map();
  const fileOf = (fn: ExportFunction, fileId: number) => {
    const path = sourcePath(fn.filenames[fileId] ?? "");
    if (path === null) return null;
    let file = files.get(path);
    if (!file) files.set(path, (file = { decisions: [], branches: [] }));
    return file;
  };
  const seenBranches = new Set<string>();

  for (const fn of report.data[0]?.functions ?? []) {
    for (const rec of fn.mcdc_records ?? []) {
      const executed = rec[10].filter((tv) => tv.executed);
      if (executed.length === 0) continue;
      fileOf(fn, rec[6])?.decisions.push({
        ...region(rec),
        conditionCount: rec[9].length,
        vectors: executed.map((tv) => tv.conditions),
        results: executed.map((tv) => tv.result),
      });
    }
    for (const rec of fn.branches) {
      const [, , , , trueCount, falseCount, fileId, , kind] = rec;
      if (kind !== BRANCH_REGION || trueCount + falseCount === 0) continue;
      // An inline function from a header appears once per including function.
      const key = `${fileId}:${fn.filenames[fileId]}:${rec.slice(0, 4).join(":")}`;
      if (seenBranches.has(key)) continue;
      seenBranches.add(key);
      fileOf(fn, fileId)?.branches.push({ ...region(rec), trueCount, falseCount });
    }
  }
  for (const [path, file] of files) {
    // A decision's own branch region would repeat it as a plain condition.
    const starts = new Set(file.decisions.map((d) => `${d.line}:${d.col}`));
    file.branches = file.branches.filter((b) => !starts.has(`${b.line}:${b.col}`));
    if (file.decisions.length === 0 && file.branches.length === 0) files.delete(path);
  }
  return files;
}

const region = (rec: number[] | McdcRecord): Region => ({
  line: rec[0] as number,
  col: rec[1] as number,
  endLine: rec[2] as number,
  endCol: rec[3] as number,
});

// ---- Placing coverage in the source -------------------------------------------

export interface Position {
  line: number;
  col: number;
}

export interface Condition {
  text: string;
  start: Position;
  end: Position; // just after the condition
  values: (boolean | null)[]; // one per executed vector
}

export interface Decision extends ExecutedDecision {
  text: string;
  conditions: Condition[]; // empty when the source split does not match llvm-cov's count
  conditionNames: string[];
}

// A plain `if (c)` or `while (c)`: MC/DC needs two or more conditions, but its branch
// region counts how often it was true and false.
export interface SingleCondition extends TakenBranch {
  keyword: "if" | "while";
  text: string;
  values: boolean[];
}

export function decisions(file: FileCoverage, source: string): Decision[] {
  const lines = source.split("\n");
  return file.decisions.map((d) => {
    const text = spanText(lines, d);
    const names = conditionTexts(text);
    const matches = names.length === d.conditionCount;
    const conditions: Condition[] = [];
    if (matches) {
      // Conditions appear in source order, so each is found after the previous one.
      const positions = positionsOf(text, d.line, d.col);
      let cursor = 0;
      names.forEach((name, i) => {
        const start = text.indexOf(name, cursor);
        cursor = start + name.length;
        conditions.push({
          text: name,
          start: positions[start],
          end: positions[cursor],
          values: d.vectors.map((v) => v[i]),
        });
      });
    }
    return {
      ...d,
      text,
      conditions,
      conditionNames: matches ? names : Array.from({ length: d.conditionCount }, (_, i) => `C${i + 1}`),
    };
  });
}

// The text before a condition's region: `if (` or `while (`, and for a condition that
// declares a variable (`if (Value *V = ...)`, whose region is the variable), its type.
const CONDITION_HEAD = /\b(if|while)\s*\(\s*(?:[\w:<>,]+(?:\s+[\w:<>,]+)*[\s*&]+)?$/;

export function singleConditions(file: FileCoverage, source: string): SingleCondition[] {
  const lines = source.split("\n");
  const out: SingleCondition[] = [];
  for (const b of file.branches) {
    const head = lines[b.line - 1]?.slice(0, b.col - 1).match(CONDITION_HEAD);
    if (!head) continue;
    const values: boolean[] = [];
    if (b.trueCount > 0) values.push(true);
    if (b.falseCount > 0) values.push(false);
    out.push({ ...b, keyword: head[1] as "if" | "while", text: stripGroupingParens(spanText(lines, b)), values });
  }
  return out;
}

// "T", "F", "-" (not evaluated), or e.g. "T/F" when a condition took both values.
export function valueLabel(values: readonly (boolean | null)[]): string {
  const seen: string[] = [];
  for (const v of values) {
    const s = v === null ? "-" : v ? "T" : "F";
    if (!seen.includes(s)) seen.push(s);
  }
  return seen.join("/");
}

// The exact source text of a region, lines joined with '\n'.
export function spanText(lines: string[], r: Region): string {
  if (r.line === r.endLine) return lines[r.line - 1].slice(r.col - 1, r.endCol);
  const parts = [lines[r.line - 1].slice(r.col - 1)];
  for (let l = r.line + 1; l < r.endLine; l++) parts.push(lines[l - 1]);
  parts.push(lines[r.endLine - 1].slice(0, r.endCol));
  return parts.join("\n");
}

// Splits a decision at every && and || (at any parenthesis depth, outside string and
// character literals) into its condition texts.
export function conditionTexts(decision: string): string[] {
  const leaves: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < decision.length; i++) {
    const ch = decision[i];
    if (quote) {
      current += ch;
      if (ch === "\\") current += decision[++i] ?? "";
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if ((ch === "&" || ch === "|") && decision[i + 1] === ch) {
      leaves.push(current);
      current = "";
      i++;
    } else {
      current += ch;
    }
  }
  leaves.push(current);
  return leaves.map(stripGroupingParens);
}

// Removes the '(' and ')' around a condition that have no partner inside it.
export function stripGroupingParens(text: string): string {
  let s = text.trim();
  for (;;) {
    if (s.startsWith("(") && !closesWithin(s)) s = s.slice(1).trim();
    else if (s.endsWith(")") && !opensWithin(s)) s = s.slice(0, -1).trim();
    else return s;
  }
}

function closesWithin(s: string): boolean {
  let depth = 0;
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return true;
  }
  return false;
}

function opensWithin(s: string): boolean {
  let depth = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === ")") depth++;
    else if (s[i] === "(" && --depth === 0) return true;
  }
  return false;
}

// positions[k] is the source position of text[k]; positions[text.length] is just after.
function positionsOf(text: string, line: number, col: number): Position[] {
  const positions: Position[] = [];
  for (let i = 0; i < text.length; i++) {
    positions.push({ line, col });
    if (text[i] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  positions.push({ line, col });
  return positions;
}
