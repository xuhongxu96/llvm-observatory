// The trace model: what one run of the driver observed, iteration by iteration.

// A value as the runtime describes it (runtime/src/runtime.cpp).
export interface ValueInfo {
  ptr: string;        // "0x…", unique while the value is alive; links replacements to values
  ir: string;         // an instruction prints as itself, any other value as `type operand`
  opcode?: string;
  fn?: string;        // the IR function holding the instruction
  bb?: string;        // its basic block
  debug_loc?: string; // file:line:col from the IR's debug info
}

// One frame of a symbolized call stack. An inlined call gives several frames for
// one wasm address, innermost first.
export interface Frame {
  function: string;
  path: string | null; // source path under llvm/ (e.g. lib/Analysis/InstructionSimplify.cpp)
  line: number;        // 0 when unknown
  column: number;
}

interface Observed {
  frames: Frame[];     // innermost first, without the observatory's own frames
  rule: Frame | null;  // innermost frame in an InstCombine source: the fold that fired
}

export interface ValueRecord extends Observed {
  value: ValueInfo;
  visit?: number; // the visit it happened in, if any
}

export interface Replacement extends Observed {
  old: ValueInfo;
  new: ValueInfo;
  visit?: number;
}

// One visit of an instruction by InstCombine, numbered from 1 over the run.
export interface Visit {
  number: number;
  instruction: ValueInfo; // as it was when the visit began
}

// Where a call of PatternMatch's match(V, P) is: its source, line and the column of
// `match` (in the sources as compiled).
export interface Site {
  path: string;
  line: number;
  column: number;
}

// One run of a matcher's match method: the value it examined, whether it matched, what
// it bound (a member it assigned: the IR value, constant or number), and the matchers
// it ran in turn.
export interface MatcherRun {
  name: string; // the matcher's class, e.g. BinaryOp_match
  line: number; // of its match method, in PatternMatch.h
  value?: string;
  result?: boolean;
  bound: { name: string; value: string }[];
  matchers: MatcherRun[];
}

// One call of PatternMatch's match(V, P) from an observed source.
export interface MatchCall {
  visit?: number;
  site: Site;
  matchers: MatcherRun[]; // the pattern's top matcher, as run
}

export interface Iteration {
  number: number;      // 1-based, over the whole run
  pass: string;        // "instcombine" | "aggressive-instcombine"
  visits: Visit[];
  matches: MatchCall[];
  values: ValueRecord[];
  replacements: Replacement[];
  irAfter: string;     // the whole module after this iteration
}

export interface Trace {
  iterations: Iteration[];
}
