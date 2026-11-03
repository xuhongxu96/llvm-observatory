// The match(V, P) calls of a source in the source view, and their hovers: for each run,
// the tree of its pattern's matchers, with the value each examined, whether it matched
// (✓, ✗), and what it bound.
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

const SHOWN_RUNS = 8;

// Markdown: each run's matcher tree, under its outcome.
export function callHover({ runs }: CallSite, where: string): string {
  const times = runs.length === 1 ? "once" : `${runs.length} times`;
  const parts = [`**match** ran ${times} in ${where}`];
  runs.slice(0, SHOWN_RUNS).forEach((run, i) => {
    const outcome = outcomeOf(run.matchers);
    const title = runs.length === 1 ? "" : `run ${i + 1}: `;
    parts.push(`${title}${outcome}\n\`\`\`\n${treeLines(run.matchers, "").join("\n")}\n\`\`\``);
  });
  if (runs.length > SHOWN_RUNS) parts.push(`… ${runs.length - SHOWN_RUNS} more`);
  return parts.join("\n\n");
}

function outcomeOf(matchers: MatcherRun[]): string {
  const top = matchers.at(-1);
  return top?.result === undefined ? "*no result*" : top.result ? "**matched**" : "**did not match**";
}

const mark = (result: boolean | undefined) => (result === undefined ? "?" : result ? "✓" : "✗");

// One line per matcher run, children indented under their parent.
export function treeLines(matchers: MatcherRun[], indent: string): string[] {
  return matchers.flatMap((m, i) => {
    const last = i === matchers.length - 1;
    const branch = indent === "" && matchers.length === 1 ? "" : last ? "└ " : "├ ";
    const bound = m.bound.map((b) => `  ${b.name} = ${b.value}`).join("");
    const line = `${indent}${branch}${m.name}${m.value ? `  ${m.value}` : ""}  ${mark(m.result)}${bound}`;
    const childIndent = indent + (branch === "" ? "" : last ? "  " : "│ ");
    return [line, ...treeLines(m.matchers, childIndent)];
  });
}
