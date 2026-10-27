// Resolves captured call stacks to function, file and line, with the module's DWARF.
// The offsets from Error.stack are byte offsets in the module file, which is the address
// llvm-symbolizer expects for wasm (no conversion needed).
import { runTool } from './llvm.mjs';

// Each stack entry gets `frames` with { name, file, line }, innermost first.
export async function resolveStacks(wasmBytes, stacks) {
  const offsets = [...new Set(stacks.flatMap((frames) => frames.map((f) => f.offset)))];
  if (offsets.length === 0) return stacks.map(() => []);

  const args = ['--obj=/work/policy.wasm', '--inlining=false', ...offsets.map((o) => `0x${o.toString(16)}`)];
  const out = await runTool('llvm-symbolizer', args, { 'policy.wasm': wasmBytes });

  // One address gives two lines: the function name, then file:line:col.
  const lines = out.text.split('\n').filter((l) => l !== '');
  const resolved = new Map();
  offsets.forEach((offset, i) => {
    const name = lines[2 * i] ?? '??';
    const location = lines[2 * i + 1] ?? '??:0:0';
    const m = location.match(/^(.*):(\d+):\d+$/);
    resolved.set(offset, {
      name,
      file: m && m[1] !== '??' ? basename(m[1]) : null,
      line: m && m[1] !== '??' ? Number(m[2]) : null,
    });
  });
  return stacks.map((frames) => frames.map((f) => ({ ...resolved.get(f.offset) })));
}

const basename = (path) => path.slice(path.lastIndexOf('/') + 1);
