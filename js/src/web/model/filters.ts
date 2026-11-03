// The structured view's filter bar: which records of a trace to show.
import { shortName } from "../../core/trace.ts";
import type { Iteration, Replacement, ValueRecord } from "../../core/types.ts";

export interface Filters {
  text: string;   // anywhere in the record
  opcode: string;
  rule: string;   // the fold, e.g. visitAdd
  fn: string;     // the IR function, with or without '@'
}

export const NO_FILTERS: Filters = { text: "", opcode: "", rule: "", fn: "" };

export const isFiltering = (f: Filters) => Object.values(f).some((v) => v !== "");

const has = (haystack: string | undefined, needle: string) =>
  needle === "" || (haystack ?? "").toLowerCase().includes(needle.toLowerCase());

const ruleName = (r: ValueRecord | Replacement) => (r.rule ? shortName(r.rule.function) : "");

export function matchValue(r: ValueRecord, f: Filters): boolean {
  const v = r.value;
  return (
    has(v.opcode, f.opcode) &&
    has(ruleName(r), f.rule) &&
    has(v.fn, f.fn.replace(/^@/, "")) &&
    has([v.ptr, v.ir, v.opcode, v.fn, v.bb, v.debug_loc, ruleName(r)].join(" "), f.text)
  );
}

export function matchReplacement(r: Replacement, f: Filters): boolean {
  return (
    has(`${r.old.opcode ?? ""} ${r.new.opcode ?? ""}`, f.opcode) &&
    has(ruleName(r), f.rule) &&
    has(`${r.old.fn ?? ""} ${r.new.fn ?? ""}`, f.fn.replace(/^@/, "")) &&
    has([r.old.ptr, r.old.ir, r.new.ptr, r.new.ir, ruleName(r)].join(" "), f.text)
  );
}

// The iterations with the records that pass the filters. Without filters, every
// iteration, also one that changed nothing (InstCombine's last): the optimized IR panel
// lists it. With filters, only those with records left.
export function filterIterations(iterations: Iteration[], f: Filters): Iteration[] {
  const filtered = iterations.map((it) => ({
    ...it,
    values: it.values.filter((v) => matchValue(v, f)),
    replacements: it.replacements.filter((r) => matchReplacement(r, f)),
  }));
  return isFiltering(f) ? filtered.filter((it) => it.values.length > 0 || it.replacements.length > 0) : filtered;
}
