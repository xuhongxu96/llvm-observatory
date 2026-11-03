// Resolves the wasm frames of captured stacks to source frames with the driver's DWARF,
// using llvm-symbolizer.
//
// V8 reports a frame as a file offset and the name of the function there; DWARF
// addresses are offsets in the code section, so the symbolizer gets the offset minus
// the code section's start. The symbolizer returns the inlined calls at an address,
// innermost first, ending with the function itself, which it names from the symbol
// table; it reads that table with file offsets, so the name V8 showed replaces it.
// (The DWARF is only trustworthy as built by driver/CMakeLists.txt: see its notes on
// link order and -O0.)
import type { StackAddress } from "./host.ts";
import type { LlvmTools } from "./llvm-tools.ts";
import type { Frame } from "./types.ts";
import { codeSectionOffset } from "./wasm.ts";

// The frames of each stack address (by file offset), innermost first.
export type Symbols = Map<number, Frame[]>;

export async function symbolize(tools: LlvmTools, binary: Uint8Array, addresses: StackAddress[]): Promise<Symbols> {
  const names = new Map(addresses.map((a) => [a.offset, a.name]));
  if (names.size === 0) return new Map();
  const code = codeSectionOffset(binary);
  const offsets = [...names.keys()];
  const args = ["--obj=/work/module.wasm", "--output-style=JSON", "--inlining", ...offsets.map((o) => hex(o - code))];
  const { stdout } = await tools.run("llvm-symbolizer", args, { "module.wasm": binary });
  const resolved = parseSymbolizerJson(stdout);
  return new Map(offsets.map((o) => [o, withFunctionName(resolved.get(o - code) ?? [], names.get(o) ?? null)]));
}

// Replaces the name of the last frame (the function itself) with V8's.
function withFunctionName(frames: Frame[], v8Name: string | null): Frame[] {
  const own = frames.at(-1);
  if (!v8Name) return frames;
  if (!own) return [{ function: v8Name, path: null, line: 0, column: 0 }];
  return [...frames.slice(0, -1), { ...own, function: v8Name }];
}

interface SymbolizerEntry {
  Address: string;
  Symbol: { FunctionName: string; FileName: string; Line: number; Column: number }[];
}

// The symbolizer's frames by (code section) address, without those it found no source
// file for.
export function parseSymbolizerJson(json: string): Map<number, Frame[]> {
  const out = new Map<number, Frame[]>();
  for (const entry of JSON.parse(json) as SymbolizerEntry[]) {
    const frames = entry.Symbol.filter((s) => s.FileName !== "").map((s) => ({
      function: s.FunctionName,
      path: sourcePath(s.FileName),
      line: s.Line,
      column: s.Column,
    }));
    out.set(parseInt(entry.Address, 16), frames);
  }
  return out;
}

// The path under the tree's llvm/ directory, e.g.
// /src/thirdparty/llvm-target/llvm/lib/Analysis/ValueTracking.cpp -> lib/Analysis/ValueTracking.cpp.
// null for files outside an LLVM tree (and for unknown files).
export function sourcePath(file: string): string | null {
  const m = file.match(/^.*\/llvm\/((?:lib|include)\/.+)$/);
  return m ? m[1] : null;
}

const hex = (n: number) => `0x${n.toString(16)}`;
