// Plain-text rendering of a trace, for the CLI and the web app's text view.
import { shortName } from "./trace.ts";
import type { Frame, Trace, ValueInfo } from "./types.ts";

export interface TextOptions {
  maxFrames?: number; // frames per record (default: all)
}

export function renderText(trace: Trace, options: TextOptions = {}): string {
  const out: string[] = [];
  for (const it of trace.iterations) {
    if (it.values.length === 0 && it.replacements.length === 0) continue;
    out.push(`=== iteration ${it.number}: ${it.pass} ===`);
    for (const v of it.values) {
      out.push(`value ${describe(v.value)}${tags(v.value, v.rule)}`);
      out.push(...frameLines(v.frames, options));
    }
    for (const r of it.replacements) {
      out.push(`replace ${describe(r.old)}  ->  ${describe(r.new)}${tags(r.old, r.rule)}`);
      out.push(...frameLines(r.frames, options));
    }
    out.push("");
  }
  return out.join("\n");
}

const describe = (v: ValueInfo) => `${v.ptr} \`${v.ir.trim()}\``;

function tags(v: ValueInfo, rule: Frame | null): string {
  const parts: string[] = [];
  if (v.fn) parts.push(`fn=@${v.fn}${v.bb ? `/${v.bb}` : ""}`);
  if (v.debug_loc) parts.push(`dbg=${v.debug_loc}`);
  if (rule) parts.push(`rule=${shortName(rule.function)}`);
  return parts.length ? `  [${parts.join("] [")}]` : "";
}

export function frameLines(frames: Frame[], { maxFrames }: TextOptions = {}): string[] {
  const shown = maxFrames === undefined ? frames : frames.slice(0, maxFrames);
  const lines = shown.map((f, i) => `    #${i} ${shortName(f.function)}${location(f)}`);
  if (shown.length < frames.length) lines.push(`    … ${frames.length - shown.length} more`);
  return lines;
}

export const location = (f: Frame) => (f.path ? `  ${f.path}:${f.line}` : "");
