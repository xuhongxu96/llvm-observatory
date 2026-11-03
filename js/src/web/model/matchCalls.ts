// The match(V, P) calls of a source in the source view, and their hovers: for each run,
// the tree of its pattern's matchers, with the value each examined, whether it matched
// (✓, ✗), and what it bound. The matchers are named as the pattern writes them
// (m_Add(…), m_Value(X)) where it is known (scripts/xref.py), by their class otherwise.
import type { Pattern } from "../../core/xref.ts";
import type { MatchCall, MatcherRun, Site } from "../../core/types.ts";

export interface CallSite {
  site: Site;
  runs: MatchCall[];
}

// The calls of `path`, grouped by site.
export function callSites(calls: MatchCall[], path: string): CallSite[] {
  const sites = new Map<string, CallSite>();
  for (const call of calls) {
    if (call.site.path !== path) continue;
    const key = `${call.site.line}:${call.site.column}`;
    const entry = sites.get(key);
    if (entry) entry.runs.push(call);
    else sites.set(key, { site: call.site, runs: [call] });
  }
  return [...sites.values()];
}

// A matcher run, named.
export interface NamedRun {
  label: string; // m_Add(…), m_Value(X), or the class (BinaryOp_match)
  value?: string;
  result?: boolean;
  bound: { name: string; value: string }[];
  matchers: NamedRun[];
}

// Names the runs after `pattern`. A run takes the sub-pattern (of its parent's) whose
// matcher has its class, the next one in order when several do (a commutative matcher
// tries its operands twice, a combinator its alternatives). A run that takes none is
// the inner working of its parent's matcher (`owner`): it keeps its class, and its own
// runs look for the parent's sub-patterns.
export function nameRuns(runs: MatcherRun[], pattern: Pattern | null): NamedRun[] {
  return named(runs, pattern ? [pattern] : [], null);
}

function named(runs: MatcherRun[], candidates: Pattern[], owner: Pattern | null): NamedRun[] {
  let next = 0;
  return runs.map((outer) => {
    const order = candidates.map((_, i) => (next + i) % candidates.length);
    const taken = order.find((i) => candidates[i].classes.includes(outer.name));
    const pattern = taken === undefined ? null : candidates[taken];
    if (taken !== undefined) next = (taken + 1) % candidates.length;
    const run = unwrap(outer, pattern?.classes ?? [outer.name]);
    return {
      label: pattern ? labelOf(pattern) : run.name,
      value: run.value,
      result: run.result,
      bound: boundAs(run.bound, pattern ?? owner),
      matchers: named(run.matchers, pattern ? pattern.args : candidates, pattern ?? owner),
    };
  });
}

// A match method that only forwards to another of the same matcher, on the same value
// (BinaryOp_match's match(V) to match(Opcode, V); SpecificBinaryOp_match's to its base
// BinaryOp_match's), is one run: the inner one, with the outer's result. `classes`: the
// matcher's class and bases.
function unwrap(run: MatcherRun, classes: string[]): MatcherRun {
  const [inner] = run.matchers;
  if (run.matchers.length !== 1 || !classes.includes(inner.name) || inner.value !== run.value) return run;
  return unwrap({ ...inner, result: run.result, bound: [...run.bound, ...inner.bound] }, classes);
}

// A leaf as written; a pattern with sub-patterns by its name (they follow, below it).
const labelOf = (p: Pattern) => (p.args.length > 0 ? `${p.name}(…)` : p.text);

// What a matcher bound, under the names of the variables it binds (m_APInt(C): C, not
// its member Res): its output arguments, in order, when they pair up with the bindings.
function boundAs(bound: NamedRun["bound"], pattern: Pattern | null): NamedRun["bound"] {
  const outs = pattern?.vars.filter((v) => v.out) ?? [];
  return bound.length > 0 && bound.length === outs.length ? bound.map((b, i) => ({ ...b, name: outs[i].text })) : bound;
}

const SHOWN_RUNS = 8;

// Markdown: each run's matcher tree, under its outcome.
export function callHover({ runs }: CallSite, where: string, pattern: Pattern | null): string {
  const times = runs.length === 1 ? "once" : `${runs.length} times`;
  const parts = [`**match** ran ${times} in ${where}`];
  runs.slice(0, SHOWN_RUNS).forEach((run, i) => {
    const outcome = outcomeOf(run.matchers);
    const title = runs.length === 1 ? "" : `run ${i + 1}: `;
    parts.push(`${title}${outcome}\n\`\`\`\n${treeLines(nameRuns(run.matchers, pattern)).join("\n")}\n\`\`\``);
  });
  if (runs.length > SHOWN_RUNS) parts.push(`… ${runs.length - SHOWN_RUNS} more`);
  return parts.join("\n\n");
}

function outcomeOf(matchers: MatcherRun[]): string {
  const top = matchers.at(-1);
  return top?.result === undefined ? "*no result*" : top.result ? "**matched**" : "**did not match**";
}

const mark = (result: boolean | undefined) => (result === undefined ? "?" : result ? "✓" : "✗");

// One line per matcher run, children indented under their parent. A single top run
// has no branch.
export function treeLines(runs: NamedRun[], indent = "", top = true): string[] {
  return runs.flatMap((m, i) => {
    const last = i === runs.length - 1;
    const branch = top && runs.length === 1 ? "" : last ? "└ " : "├ ";
    const bound = m.bound.map((b) => `  ${b.name} = ${b.value}`).join("");
    const line = `${indent}${branch}${m.label}${m.value ? `  ${m.value}` : ""}  ${mark(m.result)}${bound}`;
    const childIndent = indent + (branch === "" ? "" : last ? "  " : "│ ");
    return [line, ...treeLines(m.matchers, childIndent, false)];
  });
}
