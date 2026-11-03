// Builds the trace model from a driver run and the symbols of its stacks.
import type { RawEvent, StackAddress } from "./host.ts";
import type { Symbols } from "./symbolize.ts";
import type { Frame, Iteration, Trace } from "./types.ts";

// The observatory's own frames (runtime and hooks) say nothing about the fold.
const isObservatoryFrame = (f: Frame) => shortName(f.function).startsWith("llvm_obs::");

// Folds live in the InstCombine and AggressiveInstCombine sources.
const RULE_SOURCE = /^lib\/Transforms\/(Aggressive)?InstCombine\//;

export function buildTrace(events: RawEvent[], symbols: Symbols): Trace {
  const iterations: Iteration[] = [];
  let current: Iteration | null = null;

  for (const { data, stack } of events) {
    switch (data.type) {
      case "iteration_begin":
        current = { number: data.iteration, pass: data.pass, values: [], replacements: [], irAfter: "" };
        iterations.push(current);
        break;
      case "iteration_end":
        if (current) current.irAfter = data.ir ?? "";
        current = null;
        break;
      case "value":
        current?.values.push({ value: data.value, ...observed(stack, symbols) });
        break;
      case "replace":
        current?.replacements.push({ old: data.old, new: data.new, ...observed(stack, symbols) });
        break;
    }
  }
  return { iterations };
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
