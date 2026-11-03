// Builds the trace model from a driver run and the symbols of its stacks.
import type { RawEvent, StackAddress } from "./host.ts";
import type { Symbols } from "./symbolize.ts";
import { sourcePath } from "./symbolize.ts";
import type { Frame, Iteration, Site, Trace, ValueInfo } from "./types.ts";

// The observatory's own frames (runtime and hooks) say nothing about the fold.
const isObservatoryFrame = (f: Frame) => shortName(f.function).startsWith("llvm_obs::");

// Folds are defined in the InstCombine and AggressiveInstCombine .cpp files; their
// headers hold helpers (e.g. replaceInstUsesWith, in InstCombineInternal.h before
// LLVM 12) that every fold calls.
const RULE_SOURCE = /^lib\/Transforms\/(Aggressive)?InstCombine\/[^/]+\.cpp$/;

export function buildTrace(events: RawEvent[], symbols: Symbols): Trace {
  const iterations: Iteration[] = [];
  let current: Iteration | null = null;

  for (const { data, stack } of events) {
    switch (data.type) {
      case "iteration_begin":
        current = { number: data.iteration, pass: data.pass, visits: [], matches: [], values: [], replacements: [], irAfter: "" };
        iterations.push(current);
        break;
      case "iteration_end":
        if (current) current.irAfter = data.ir ?? "";
        current = null;
        break;
      case "visit_begin":
        current?.visits.push({ number: data.visit, instruction: data.instruction });
        break;
      case "match": {
        const site = siteOf(data);
        if (site) current?.matches.push({ ...visitOf(data), site, matchers: data.matchers });
        break;
      }
      case "value":
        current?.values.push({ value: data.value, ...visitOf(data), ...observed(stack, symbols) });
        break;
      case "replace":
        current?.replacements.push({ old: data.old, new: data.new, ...visitOf(data), ...observed(stack, symbols) });
        break;
      case "describe":
        if (current) placed(current, data.value);
        break;
    }
  }
  return { iterations };
}

const visitOf = (data: { visit?: number }) => (data.visit ? { visit: data.visit } : {});

// match_begin (runtime/include/llvm_observatory/hooks.h) records the column of its own
// call, which the patcher puts this far before `match`.
const MATCH_PREFIX = "llvm_obs::match_begin(), llvm_obs::match_end(".length;

function siteOf(data: { file: string; line: number; column: number }): Site | null {
  const path = sourcePath(data.file);
  return path ? { path, line: data.line, column: data.column + MATCH_PREFIX } : null;
}

// A value recorded as `<badref>` (not in a function yet), described again once inserted:
// its records take the new description.
function placed(iteration: Iteration, value: ValueInfo) {
  const update = (v: ValueInfo) => (v.ptr === value.ptr && v.ir.includes("<badref>") ? value : v);
  for (const record of iteration.values) record.value = update(record.value);
  for (const record of iteration.replacements) {
    record.old = update(record.old);
    record.new = update(record.new);
  }
}

// The coverage segments of a run, by iteration and visit (null: between visits).
export interface Segment {
  segment: number;
  iteration: number;
  visit: number | null;
}

export function segmentsOf(events: RawEvent[]): Segment[] {
  return events.flatMap(({ data }) =>
    data.type === "segment" ? [{ segment: data.segment, iteration: data.iteration, visit: data.visit ?? null }] : [],
  );
}

function observed(stack: StackAddress[], symbols: Symbols) {
  const frames = stack.flatMap((address) => framesAt(address, symbols)).filter((f) => !isObservatoryFrame(f));
  return { frames, rule: frames.find(isRuleFrame) ?? null };
}

function framesAt(address: StackAddress, symbols: Symbols): Frame[] {
  const frames = symbols.get(address.offset);
  if (frames && frames.length > 0) return frames;
  return [{ function: address.name ?? `wasm@0x${address.offset.toString(16)}`, path: null, line: 0, column: 0 }];
}

export function isRuleFrame(frame: Frame): boolean {
  return frame.path !== null && RULE_SOURCE.test(frame.path);
}

// Every address in the events' stacks, for one symbolizer call.
export function stackAddresses(events: RawEvent[]): StackAddress[] {
  return events.flatMap((e) => e.stack);
}

// "llvm::Instruction* llvm::InstCombinerImpl::visitAdd(llvm::BinaryOperator&)" -> "InstCombinerImpl::visitAdd"
export function shortName(fn: string): string {
  const head = fn.slice(0, parameterListStart(fn)).trim();
  // The name starts after the last space, '*' or '&' outside template arguments.
  let depth = 0;
  let start = 0;
  for (let i = head.length - 1; i >= 0; i--) {
    const ch = head[i];
    if (ch === ">") depth++;
    else if (ch === "<") depth--;
    else if (depth === 0 && (ch === " " || ch === "*" || ch === "&")) {
      start = i + 1;
      break;
    }
  }
  return head.slice(start).replace(/^llvm::/, "") || fn;
}

// The index of the '(' opening the last top-level parenthesis group (the parameters).
function parameterListStart(fn: string): number {
  let depth = 0;
  for (let i = fn.length - 1; i >= 0; i--) {
    if (fn[i] === ")") depth++;
    else if (fn[i] === "(" && --depth === 0) return i;
  }
  return fn.length;
}
